/**
 * Batched road renderer for the selected-road graph.
 *
 * Surfaces come from the RD-03 foundations / RD-04 indexed surface data (fold-free,
 * UV-mapped). Junction nodes get a fan patch built from the real boundary endpoints
 * of the edges that share the node, so connections only exist where OSM shares a
 * node: a bridge or tunnel that merely crosses another road is never joined to it.
 *
 * Everything that stands on or beside the road is built from the SAME boundary polylines
 * as the asphalt (decks, fascias, guardrails, medians, verges, markings), so infrastructure
 * cannot drift from the road. The triangles and barrier segments that are drawn are also
 * returned in group.userData.roadSurface for the ground sampler, so what a vehicle drives
 * on and collides with is exactly what is rendered.
 *
 * Vertical and depth layering comes from road-surface-contract.js. Coplanar layers are
 * separated by GPU polygon offset, not by lifting meshes, so they stay separated at any
 * distance and on any slope.
 */
import { buildRoadFoundation } from "./road-foundations.js";
import { buildRoadSurfaceData } from "./road-surface-geometry.js";
import { MeshBatch } from "./mesh-batch.js";
import { createRoadGround } from "./road-ground.js";
import {
  ROAD_SURFACE_Y, GROUND_Y, MARKING_LIFT_Y, MEDIAN_HEIGHT_M, DECK_THICKNESS_M, DECK_OVERHANG_M, VERGE_WIDTH_M,
  GUARDRAIL_INSET_M, GUARDRAIL_COLLIDER_HALF_WIDTH_M, GUARDRAIL_POST_SPACING_M, PIER_SPACING_M, GUARDRAIL_HEIGHT_M,
  DEPTH_BIAS, RENDER_ORDER, roadClassRank
} from "./road-surface-contract.js";

const CLASS_COLORS = {
  motorway: 0x55585a, motorway_link: 0x50565a, trunk: 0x50565a, trunk_link: 0x50565a,
  primary: 0x4a5054, primary_link: 0x4a5054, secondary: 0x454b4f, secondary_link: 0x454b4f,
  tertiary: 0x3e4549, tertiary_link: 0x3e4549, residential: 0x363d41,
  unclassified: 0x363d41, living_street: 0x42484b, service: 0x4a4f52
};
const roadClass = edge => Object.hasOwn(CLASS_COLORS, edge.osm?.highway) ? edge.osm.highway : "residential";

const LINE_W = 0.14, STOP_W = 0.4, END_CLEAR_M = 3, DASH_M = 3, GAP_M = 6;
const MARK_Y = ROAD_SURFACE_Y + MARKING_LIFT_Y;
/** Kerb face stays this far off the carriageway edge so a median can never overlap a lane. */
const MEDIAN_CLEARANCE_M = 0.3;

class Batch {
  constructor() { this.positions = []; this.uvs = []; this.indices = []; }
  get base() { return this.positions.length / 3; }
}

/** Collects every drawn drivable triangle so the ground sampler uses the rendered geometry. */
class SurfaceLedger {
  constructor() { this.triangles = []; this.thickness = []; }
  addIndexed(positions, indices, base, thicknessOf) {
    for (let i = 0; i < indices.length; i += 3) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        const v = (indices[i + k] - base) * 3;
        this.triangles.push(positions[v], positions[v + 1], positions[v + 2]);
        sum += positions[v + 1];
      }
      this.thickness.push(thicknessOf(sum / 3));
    }
  }
}

// Flat ribbon (quad strip) along a polyline, optionally dashed, skipping the ends.
// Each end of every dash takes its OWN interpolated height, so paint follows slopes and
// ramps; previously both ends used the segment start height and paint stayed flat while the
// road rose beneath it (buried at one end, floating at the other).
function addRibbon(batch, points, width, { dashed = false, clearM = END_CLEAR_M } = {}) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const total = cum[cum.length - 1];
  if (total < clearM * 2 + 2) return;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const s0 = Math.max(cum[i - 1], clearM), s1 = Math.min(cum[i], total - clearM);
    if (s1 - s0 < 0.2) continue;
    const len = cum[i] - cum[i - 1];
    if (len < 1e-6) continue;
    const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len, dy = (b.y - a.y) / len, nx = -dz * width / 2, nz = dx * width / 2;
    const emit = (t0, t1) => {
      const u0 = t0 - cum[i - 1], u1 = t1 - cum[i - 1];
      const p0 = [a.x + dx * u0, a.y + dy * u0 + MARK_Y, a.z + dz * u0];
      const p1 = [a.x + dx * u1, a.y + dy * u1 + MARK_Y, a.z + dz * u1];
      batch.quad([p0[0] + nx, p0[1], p0[2] + nz], [p0[0] - nx, p0[1], p0[2] - nz], [p1[0] - nx, p1[1], p1[2] - nz], [p1[0] + nx, p1[1], p1[2] + nz],
        { hint: [0, 1, 0], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] });
    };
    if (!dashed) { emit(s0, s1); continue; }
    const period = DASH_M + GAP_M;
    for (let s = Math.floor(s0 / period) * period; s < s1; s += period) {
      const t0 = Math.max(s, s0), t1 = Math.min(s + DASH_M, s1);
      if (t1 - t0 > 0.3) emit(t0, t1);
    }
  }
}

function addCross(batch, centre, dirX, dirZ, halfLength, width, y, grade) {
  // Ribbon across the lane (perpendicular to travel) for stop lines; follows the road grade.
  const nx = -dirZ, nz = dirX, hw = width / 2;
  const P = (along, across) => [centre.x + dirX * along + nx * across, y + MARK_Y + grade * along, centre.z + dirZ * along + nz * across];
  batch.quad(P(-hw, -halfLength), P(hw, -halfLength), P(hw, halfLength), P(-hw, halfLength), { hint: [0, 1, 0] });
}

function addArrow(batch, centre, dirX, dirZ, y, laneWidth, grade) {
  const shaft = Math.min(0.2, laneWidth * 0.07), head = Math.min(0.9, laneWidth * 0.28), len = 3.2, headLen = 1.2;
  const nx = -dirZ, nz = dirX;
  const P = (along, across) => [centre.x + dirX * along + nx * across, y + MARK_Y + grade * along, centre.z + dirZ * along + nz * across];
  batch.quad(P(-len / 2, -shaft), P(len / 2 - headLen, -shaft), P(len / 2 - headLen, shaft), P(-len / 2, shaft), { hint: [0, 1, 0] });
  batch.tri(P(len / 2 - headLen, -head), P(len / 2, 0), P(len / 2 - headLen, head), { hint: [0, 1, 0] });
}

function polylineMid(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const half = cum[cum.length - 1] / 2;
  for (let i = 1; i < points.length; i++) {
    if (cum[i] >= half) {
      const t = (half - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      const a = points[i - 1], b = points[i], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len, grade: (b.y - a.y) / len };
    }
  }
  return null;
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

function nearestPointOnPolyline(point, points) {
  let best = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z;
    const length2 = dx * dx + dz * dz;
    const raw = length2 ? ((point.x - a.x) * dx + (point.z - a.z) * dz) / length2 : 0;
    const t = Math.max(0, Math.min(1, raw));
    const candidate = { x: a.x + dx * t, y: a.y + (b.y - a.y) * t, z: a.z + dz * t };
    const distanceM = Math.hypot(point.x - candidate.x, point.z - candidate.z);
    // `beyondEnd`: the point lies past either end of the polyline, so the "nearest" point is a diagonal to an endpoint, not a perpendicular.
    if (!best || distanceM < best.distanceM) best = { ...candidate, distanceM, beyondEnd: (i === 1 && raw < 0) || (i === points.length - 1 && raw > 1) };
  }
  return best;
}

/**
 * Raised median between paired opposing carriageways. The strip is one mitred ribbon along
 * the matched centre line (previously a separate unmitred prism per segment, which opened
 * wedge gaps and overlaps on every bend) with end caps, and it is registered as a solid
 * collider so the barrier you see is the barrier you hit.
 */
const MEDIAN_SAMPLE_M = 3;
function densify(points, stepM) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1], q = points[i], n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / stepM));
    for (let k = 1; k <= n; k++) { const u = k / n; out.push({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u, z: p.z + (q.z - p.z) * u }); }
  }
  return out;
}
function addVerifiedCarriagewayMedians(edges, grassBatch, concreteTopBatch, wallBatch, colliders) {
  const physicalRoads = new Map();
  for (const edge of edges) {
    const model = edge.roadModel;
    if (model?.groupingSource !== "osm:paired-oneway-carriageways" || !model.physicalRoadId || !model.carriagewayId) continue;
    if (!physicalRoads.has(model.physicalRoadId)) physicalRoads.set(model.physicalRoadId, new Map());
    const carriageways = physicalRoads.get(model.physicalRoadId);
    if (!carriageways.has(model.carriagewayId)) carriageways.set(model.carriagewayId, []);
    carriageways.get(model.carriagewayId).push(edge);
  }
  // Every road's centreline, indexed, so a median can end where ANY other road crosses or joins it.
  const CELL = 24, cellKey = (gx, gz) => gx * 73856093 ^ gz * 19349663, roadGrid = new Map();
  for (const edge of edges) {
    const pts = edge.centerline;
    if (!Array.isArray(pts)) continue;
    const half = ((edge.lanes || []).reduce((sum, lane) => sum + (lane.widthM || 0), 0) / 2) || 3.5;
    for (let i = 1; i < pts.length; i++) {
      const seg = { edge, ax: pts[i - 1].x, az: pts[i - 1].z, bx: pts[i].x, bz: pts[i].z, half };
      for (let gx = Math.floor(Math.min(seg.ax, seg.bx) / CELL) - 1; gx <= Math.floor(Math.max(seg.ax, seg.bx) / CELL) + 1; gx++) {
        for (let gz = Math.floor(Math.min(seg.az, seg.bz) / CELL) - 1; gz <= Math.floor(Math.max(seg.az, seg.bz) / CELL) + 1; gz++) {
          const k = cellKey(gx, gz), list = roadGrid.get(k);
          if (list) list.push(seg); else roadGrid.set(k, [seg]);
        }
      }
    }
  }
  const crossedByOtherRoad = (point, widthM, a, b) => {
    for (const seg of roadGrid.get(cellKey(Math.floor(point.x / CELL), Math.floor(point.z / CELL))) || []) {
      if (seg.edge === a || seg.edge === b) continue;
      const dx = seg.bx - seg.ax, dz = seg.bz - seg.az, l2 = dx * dx + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((point.x - seg.ax) * dx + (point.z - seg.az) * dz) / l2)) : 0;
      if (Math.hypot(point.x - seg.ax - dx * t, point.z - seg.az - dz * t) < seg.half + widthM / 2 + 0.5) return true;
    }
    return false;
  };
  let medianSegments = 0;
  const emittedPairs = new Set();
  for (const carriageways of physicalRoads.values()) {
    const lanes = [...carriageways.values()];
    if (lanes.length !== 2) continue;
    for (const a of lanes[0]) {
      if (!a.roadModel?.oneWay || !Array.isArray(a.centerline) || a.centerline.length < 2) continue;
      const midA = polylineMid(a.centerline);
      if (!midA) continue;
      let best = null;
      for (const b of lanes[1]) {
        if (!b.roadModel?.oneWay || !Array.isArray(b.centerline) || b.centerline.length < 2) continue;
        const midB = polylineMid(b.centerline);
        if (!midB || midA.dx * midB.dx + midA.dz * midB.dz > -0.5) continue;
        const nearest = nearestPointOnPolyline(midA, b.centerline);
        if (!nearest || nearest.distanceM < 4 || nearest.distanceM > 45) continue;
        if (!best || nearest.distanceM < best.distanceM) best = { edge: b, distanceM: nearest.distanceM };
      }
      if (!best) continue;
      const b = best.edge;
      const pairKey = [a.id, b.id].sort().join("|");
      if (emittedPairs.has(pairKey)) continue;
      emittedPairs.add(pairKey);
      const roadWidthM = edge => (edge.lanes || []).reduce((sum, lane) => sum + (lane.widthM || 0), 0);
      const halfAM = roadWidthM(a) / 2, halfBM = roadWidthM(b) / 2;
      // The median is centred in the gap between the two carriageway EDGES, not midway between the
      // centrelines: carriageways of different width (2 lanes opposite 1) put the centreline midpoint
      // inside the wider carriageway.
      // Resample so the median follows bends in EITHER carriageway; matching only a's own vertices drew straight
      // chords through the bend of b and cut across the lanes (measured on Accra Central).
      const matched = densify(a.centerline, MEDIAN_SAMPLE_M).map(point => {
        const nearest = nearestPointOnPolyline(point, b.centerline);
        if (!nearest || nearest.beyondEnd || nearest.distanceM < 4 || nearest.distanceM > 45) return null;
        const gapM = nearest.distanceM - halfAM - halfBM;
        const t = (halfAM + gapM / 2) / nearest.distanceM;
        return { point: { x: point.x + (nearest.x - point.x) * t, y: (point.y + nearest.y) / 2, z: point.z + (nearest.z - point.z) * t }, distanceM: nearest.distanceM };
      }).filter(Boolean);
      if (matched.length < 2) continue;
      const halfRoadsM = ((a.lanes || []).reduce((sum, lane) => sum + (lane.widthM || 0), 0) + (b.lanes || []).reduce((sum, lane) => sum + (lane.widthM || 0), 0)) / 2;
      // Width is the LOCAL gap at every vertex, not the average. Carriageways drift apart and together;
      // one constant width overlapped the traffic lanes where they converge (measured: up to 1.3 m into
      // a lane) and left bare ground where they diverge. A divider exists only while the local gap is a
      // measurable physical one; where it leaves that range the median ends and a new one may begin.
      const runs = [];
      let run = [];
      for (const item of matched) {
        const widthM = item.distanceM - halfRoadsM - MEDIAN_CLEARANCE_M;
        const previous = run.at(-1);
        if (Number.isFinite(widthM) && widthM >= 0.8 && widthM <= 12 && !crossedByOtherRoad(item.point, widthM, a, b)) {
          if (!previous || Math.hypot(item.point.x - previous.x, item.point.z - previous.z) > 0.25) run.push({ ...item.point, y: item.point.y + ROAD_SURFACE_Y, widthM });
        } else { if (run.length) runs.push(run); run = []; }
      }
      if (run.length) runs.push(run);
      let emitted = false;
      for (const line of runs) {
        const lengthM = line.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - line[index].x, point.z - line[index].z), 0);
        if (line.length < 2 || lengthM < 8) continue;
        const widths = line.map(point => point.widthM), meanM = widths.reduce((x, y) => x + y, 0) / widths.length;
        // Wall from just below the asphalt (so no sliver shows) to the kerb height above it.
        (meanM >= 3 ? grassBatch : concreteTopBatch).ribbonPrism(line, widths, MEDIAN_HEIGHT_M, MEDIAN_HEIGHT_M, { parts: "top", uvScale: 0.6 });
        wallBatch.ribbonPrism(line, widths, -0.01, MEDIAN_HEIGHT_M, { parts: "walls", caps: true, uvScale: 1 });
        for (let i = 1; i < line.length; i++) {
          const p = line[i - 1], q = line[i];
          if (Math.hypot(q.x - p.x, q.z - p.z) < 0.05) continue;
          colliders.push({ ax: p.x, ay: p.y, az: p.z, bx: q.x, by: q.y, bz: q.z, halfWidthM: (p.widthM + q.widthM) / 4, heightM: MEDIAN_HEIGHT_M, kind: "median" });
        }
        emitted = true;
        medianSegments++;
      }
      if (!emitted) continue;
    }
  }
  return medianSegments;
}

/** Offset a boundary polyline horizontally away from the opposite boundary. */
function pushOutward(boundary, opposite, distanceM) {
  return boundary.map((p, i) => {
    const q = opposite[Math.min(i, opposite.length - 1)];
    const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz) || 1;
    return { x: p.x + dx / d * distanceM, y: p.y, z: p.z + dz / d * distanceM };
  });
}

/**
 * Steel guardrail along a boundary: two rails, posts and a wire-mesh infill panel. Registered
 * as colliders on the same line.
 */
function addGuardrail(rails, posts, mesh, colliders, boundary, opposite) {
  const line = pushOutward(boundary, opposite, -GUARDRAIL_INSET_M).map(p => ({ ...p, y: p.y + ROAD_SURFACE_Y }));
  if (line.length < 2) return 0;
  rails.ribbonPrism(line, 0.07, 0.9, GUARDRAIL_HEIGHT_M, { uvScale: 2 });
  rails.ribbonPrism(line, 0.07, 0.5, 0.74, { uvScale: 2 });
  // Wire-mesh infill panel between the rails (double-sided material, tiled uv in metres).
  let along = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (seg < 0.05) continue;
    mesh.quad([a.x, a.y + 0.76, a.z], [b.x, b.y + 0.76, b.z], [b.x, b.y + 0.9, b.z], [a.x, a.y + 0.9, a.z],
      { hint: [-(b.z - a.z), 0, b.x - a.x], uv: [[along / 0.25, 0], [(along + seg) / 0.25, 0], [(along + seg) / 0.25, 0.14 / 0.25], [along / 0.25, 0.14 / 0.25]] });
    along += seg;
    colliders.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, halfWidthM: GUARDRAIL_COLLIDER_HALF_WIDTH_M, heightM: GUARDRAIL_HEIGHT_M, kind: "guardrail" });
  }
  // Posts at fixed arc spacing, standing on the surface and following the slope.
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (seg < 1e-6) continue;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    for (let s = carry === 0 && i === 1 ? 0 : carry; s <= seg; s += GUARDRAIL_POST_SPACING_M) {
      const t = s / seg;
      posts.box(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + 0.5, a.z + (b.z - a.z) * t, 0.1, 1.0, 0.1, yaw);
      carry = s + GUARDRAIL_POST_SPACING_M - seg;
    }
  }
  return 1;
}

/** Lazily builds a repeating paver-tile texture where a canvas exists (browser); null in Node. */
function makeTileTexture(THREE, kind) {
  if (typeof document === "undefined" || !THREE.CanvasTexture) return null;
  try {
    const size = 128, canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const g = canvas.getContext("2d");
    if (kind === "tile") {
      g.fillStyle = "#8a8f91"; g.fillRect(0, 0, size, size);
      g.strokeStyle = "#5d6264"; g.lineWidth = 3; g.strokeRect(1.5, 1.5, size - 3, size - 3);
      g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 2; g.beginPath(); g.moveTo(4, 4); g.lineTo(size - 4, 4); g.stroke();
    } else {
      g.clearRect(0, 0, size, size);
      g.strokeStyle = "#c9ced1"; g.lineWidth = 3;
      for (let i = -size; i < size * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + size, size); g.stroke(); g.beginPath(); g.moveTo(i + size, 0); g.lineTo(i, size); g.stroke(); }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping ?? 1000;
    texture.anisotropy = 4;
    return texture;
  } catch { return null; }
}

export function createRoadMeshes(THREE, network, options = {}) {
  if (!THREE?.BufferGeometry || !THREE?.Mesh || !Array.isArray(network?.edges))
    throw new Error("Three.js and a valid road network are required");
  const group = new THREE.Group();
  const batches = new Map(), marks = new MeshBatch(), junction = new Batch(), verges = new Batch();
  const bridges = new MeshBatch(), medians = new MeshBatch(), medianGrass = new MeshBatch(), medianConcreteTops = new MeshBatch();
  const rails = new MeshBatch(), posts = new MeshBatch(), railMesh = new MeshBatch(), piers = new MeshBatch();
  const ledger = new SurfaceLedger(), colliders = [];
  const nodeEnds = new Map(); // nodeId -> [{left,right}]
  const nodeDegree = new Map();
  const structures = []; // lifted edges, for the pier pass
  let renderedEdges = 0, skippedEdges = 0, markingSegments = 0, stopLines = 0, arrows = 0, bridgeEdges = 0, bridgeLengthM = 0, elevatedEdges = 0, guardrailRuns = 0;
  for (const e of network.edges) {
    nodeDegree.set(e.fromNodeId, (nodeDegree.get(e.fromNodeId) || 0) + 1);
    nodeDegree.set(e.toNodeId, (nodeDegree.get(e.toNodeId) || 0) + 1);
  }

  for (const edge of network.edges) {
    let foundation, surface;
    try {
      foundation = buildRoadFoundation(edge);
      surface = buildRoadSurfaceData(foundation, { surfaceOffsetM: ROAD_SURFACE_Y });
    } catch (error) {
      skippedEdges++;
      continue;
    }
    const type = roadClass(edge);
    if (!batches.has(type)) batches.set(type, new Batch());
    const batch = batches.get(type), base = batch.base;
    batch.positions.push(...surface.positions);
    batch.uvs.push(...surface.uvs);
    for (const index of surface.indices) batch.indices.push(base + index);
    const elevation = edge.elevation; // set only by road-elevation.js, with provenance
    const isStructure = elevation?.role === "structure";
    const thicknessOf = elevation
      ? (isStructure ? () => DECK_THICKNESS_M : y => Math.max(DECK_THICKNESS_M, y - GROUND_Y)) // approach = solid embankment
      : () => 0;
    ledger.addIndexed(surface.positions, surface.indices, 0, thicknessOf);
    renderedEdges++;

    const { left, right } = foundation.boundaries;
    const isBridge = Boolean(edge.osm?.bridge) && edge.osm.bridge !== "no";
    const sameCount = left.length === right.length && left.length >= 2;
    if (isBridge) {
      bridgeEdges++;
      bridgeLengthM += foundation.measurements.horizontalLengthM;
    }

    if (sameCount) {
      const L = left.map(p => ({ ...p, y: p.y + ROAD_SURFACE_Y })), R = right.map(p => ({ ...p, y: p.y + ROAD_SURFACE_Y }));
      if (elevation || isBridge) {
        // Slab: top ledge (visible beyond the carriageway), outer fascias and underside, all from the
        // road's own boundaries. A raised approach is a solid embankment wall to the terrain.
        const outerL = pushOutward(L, R, DECK_OVERHANG_M), outerR = pushOutward(R, L, DECK_OVERHANG_M);
        const embankment = elevation && !isStructure;
        const depthAt = p => embankment ? Math.max(DECK_THICKNESS_M, p.y - GROUND_Y + 0.4) : DECK_THICKNESS_M;
        for (let i = 1; i < L.length; i++) {
          const top = -0.02;
          const lift = (p, dy) => [p.x, p.y + dy, p.z];
          // ledge strips beside the carriageway (upward), listed first so the batch begins with a top face
          bridges.quad(lift(outerL[i - 1], top), lift(L[i - 1], top), lift(L[i], top), lift(outerL[i], top), { hint: [0, 1, 0] });
          bridges.quad(lift(R[i - 1], top), lift(outerR[i - 1], top), lift(outerR[i], top), lift(R[i], top), { hint: [0, 1, 0] });
          // outer fascias
          bridges.quad(lift(outerL[i - 1], top - depthAt(outerL[i - 1])), lift(outerL[i], top - depthAt(outerL[i])), lift(outerL[i], top), lift(outerL[i - 1], top),
            { hint: [outerL[i].x - R[i].x, 0, outerL[i].z - R[i].z] });
          bridges.quad(lift(outerR[i - 1], top - depthAt(outerR[i - 1])), lift(outerR[i], top - depthAt(outerR[i])), lift(outerR[i], top), lift(outerR[i - 1], top),
            { hint: [outerR[i].x - L[i].x, 0, outerR[i].z - L[i].z] });
          // underside (only structures that carry traffic over open space need it)
          if (isStructure || isBridge) bridges.quad(lift(outerL[i - 1], top - depthAt(outerL[i - 1])), lift(outerR[i - 1], top - depthAt(outerR[i - 1])),
            lift(outerR[i], top - depthAt(outerR[i])), lift(outerL[i], top - depthAt(outerL[i])), { hint: [0, -1, 0] });
        }
        if (elevation) { elevatedEdges++; structures.push({ edge, L, R, isStructure }); }
        guardrailRuns += addGuardrail(rails, posts, railMesh, colliders, L, R) + addGuardrail(rails, posts, railMesh, colliders, R, L);
      } else {
        // At-grade: a sloped verge ties the asphalt edge to the terrain instead of a bare cliff.
        for (const [edgeLine, opposite] of [[L, R], [R, L]]) {
          const outer = pushOutward(edgeLine, opposite, VERGE_WIDTH_M).map(p => ({ ...p, y: GROUND_Y }));
          for (let i = 1; i < edgeLine.length; i++) {
            const n = verges.base, quad = [edgeLine[i - 1], edgeLine[i], outer[i], outer[i - 1]];
            for (const p of quad) { verges.positions.push(p.x, p.y, p.z); verges.uvs.push(0, 0); }
            // (A,B,C),(A,C,D) consistent with the ledger; winding chosen so the surface faces up.
            const ux = quad[1].x - quad[0].x, uz = quad[1].z - quad[0].z, vx = quad[2].x - quad[0].x, vz = quad[2].z - quad[0].z;
            const up = uz * vx - ux * vz > 0;
            const tri = up ? [[0, 1, 2], [0, 2, 3]] : [[0, 2, 1], [0, 3, 2]];
            for (const t of tri) verges.indices.push(n + t[0], n + t[1], n + t[2]);
            for (const t of tri) for (const k of t) ledger.triangles.push(quad[k].x, quad[k].y, quad[k].z);
            ledger.thickness.push(0, 0);
          }
        }
      }
    }

    const addEnd = (nodeId, l, r) => {
      if (!nodeEnds.has(nodeId)) nodeEnds.set(nodeId, []);
      nodeEnds.get(nodeId).push({ left: l, right: r });
    };
    addEnd(edge.fromNodeId, left[0], right[0]);
    addEnd(edge.toNodeId, left[left.length - 1], right[right.length - 1]);

    // ---- markings ----
    const lanes = foundation.laneCentrelines;
    const forward = lanes.filter(l => l.direction === "forward").sort((a, b) => b.centreOffsetM - a.centreOffsetM);
    const reverse = lanes.filter(l => l.direction === "reverse").sort((a, b) => a.centreOffsetM - b.centreOffsetM);
    const roundabout = edge.osm?.junction === "roundabout" || edge.osm?.junction === "circular";
    const inner = (a, b) => a.points.map((p, i) => mid(p, b.points[i]));
    const before = marks.indices.length;
    if (forward.length && reverse.length && !roundabout) {
      // opposing flows: solid centre line between the innermost lanes
      const f = forward.reduce((best, l) => Math.abs(l.centreOffsetM) < Math.abs(best.centreOffsetM) ? l : best);
      const r = reverse.reduce((best, l) => Math.abs(l.centreOffsetM) < Math.abs(best.centreOffsetM) ? l : best);
      addRibbon(marks, inner(f, r), LINE_W * 1.3);
    }
    for (const group2 of [forward, reverse]) {
      const sorted = [...group2].sort((a, b) => a.centreOffsetM - b.centreOffsetM);
      for (let i = 1; i < sorted.length; i++) addRibbon(marks, inner(sorted[i - 1], sorted[i]), LINE_W, { dashed: true });
    }
    // edge lines, inset from the carriageway boundary
    const outerLeft = lanes.reduce((best, l) => l.centreOffsetM > best.centreOffsetM ? l : best, lanes[0]);
    const outerRight = lanes.reduce((best, l) => l.centreOffsetM < best.centreOffsetM ? l : best, lanes[0]);
    const inset = (lane, boundary, ratio) => lane.points.map((p, i) => ({
      x: boundary[i].x + (p.x - boundary[i].x) * ratio, y: p.y, z: boundary[i].z + (p.z - boundary[i].z) * ratio }));
    if (!roundabout && left.length === outerLeft.points.length) {
      addRibbon(marks, inset(outerLeft, left, Math.min(0.2, 0.2 / Math.max(0.5, outerLeft.widthM))), LINE_W);
      addRibbon(marks, inset(outerRight, right, Math.min(0.2, 0.2 / Math.max(0.5, outerRight.widthM))), LINE_W);
    }
    markingSegments += (marks.indices.length - before) / 6;

    // stop lines where a lane runs into a real junction (3+ edges at the node)
    for (const lane of lanes) {
      if (lane.direction === "both") continue;
      const pts = lane.points, toEnd = lane.direction === "forward";
      const endNode = toEnd ? edge.toNodeId : edge.fromNodeId;
      // Circulating roundabout traffic has priority: no stop line on the ring itself.
      if (roundabout || (nodeDegree.get(endNode) || 0) < 3 || surface.lengthM < 12) continue;
      const a = toEnd ? pts[pts.length - 2] : pts[1], b = toEnd ? pts[pts.length - 1] : pts[0];
      const len = Math.hypot(b.x - a.x, b.z - a.z); if (len < 1e-6) continue;
      const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len, grade = (b.y - a.y) / len;
      const stop = { x: b.x - dx * 1.5, z: b.z - dz * 1.5 };
      addCross(marks, stop, dx, dz, lane.widthM / 2 - 0.15, STOP_W, b.y - grade * 1.5, grade);
      stopLines++;
    }
    // direction arrows on long edges, one per lane, in the lane's direction of travel
    if (surface.lengthM > 30 && !roundabout) {
      for (const lane of lanes) {
        if (lane.direction === "both") continue;
        const m = polylineMid(lane.points); if (!m) continue;
        const sign = lane.direction === "forward" ? 1 : -1;
        addArrow(marks, m, m.dx * sign, m.dz * sign, m.y, lane.widthM, m.grade * sign);
        arrows++;
      }
    }
  }

  const medianCount = addVerifiedCarriagewayMedians(network.edges, medianGrass, medianConcreteTops, medians, colliders);

  // ---- junction patches (fan around each shared node from real boundary endpoints) ----
  let junctionCount = 0;
  for (const [nodeId, ends] of nodeEnds) {
    if (ends.length < 2) continue;
    if (ends.length === 2) {
      // Degree-2 node (a bend): only patch when the two boundaries do not already meet.
      const [a, b] = ends, gap = Math.max(Math.hypot(a.left.x - b.left.x, a.left.z - b.left.z), Math.hypot(a.right.x - b.right.x, a.right.z - b.right.z));
      const swapped = Math.max(Math.hypot(a.left.x - b.right.x, a.left.z - b.right.z), Math.hypot(a.right.x - b.left.x, a.right.z - b.left.z));
      if (Math.min(gap, swapped) < 0.05) continue;
    }
    const pts = ends.flatMap(e => [e.left, e.right]);
    const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length };
    const sorted = pts.map(p => ({ p, a: Math.atan2(p.z - c.z, p.x - c.x) })).sort((u, v) => u.a - v.a).map(o => o.p);
    const n = junction.base;
    // Same height as the asphalt it joins: separation from the road meshes is by polygon offset.
    junction.positions.push(c.x, c.y + ROAD_SURFACE_Y, c.z);
    junction.uvs.push(.5, .5);
    for (const p of sorted) { junction.positions.push(p.x, p.y + ROAD_SURFACE_Y, p.z); junction.uvs.push(0, 0); }
    const first = junction.indices.length;
    for (let i = 0; i < sorted.length; i++) {
      const j = (i + 1) % sorted.length;
      // normalY of (c, v_i, v_j) = (v_i-c) x (v_j-c) component; require upward winding
      const normalY = (sorted[i].z - c.z) * (sorted[j].x - c.x) - (sorted[i].x - c.x) * (sorted[j].z - c.z);
      if (Math.abs(normalY) < 1e-6) continue;
      if (normalY > 0) junction.indices.push(n, n + 1 + i, n + 1 + j);
      else junction.indices.push(n, n + 1 + j, n + 1 + i);
    }
    for (let k = first; k < junction.indices.length; k += 3) {
      for (let m = 0; m < 3; m++) { const o = junction.indices[k + m] * 3; ledger.triangles.push(junction.positions[o], junction.positions[o + 1], junction.positions[o + 2]); }
      ledger.thickness.push(0);
    }
    junctionCount++;
  }

  // ---- piers: support lifted structures only where no road passes beneath ----
  const roadsOnly = createRoadGround({ triangles: ledger.triangles.slice(), thickness: ledger.thickness.slice(), colliders: [] });
  let pierCount = 0;
  for (const s of structures) {
    let carry = PIER_SPACING_M / 2;
    for (let i = 1; i < s.L.length; i++) {
      const a = s.L[i - 1], b = s.L[i], seg = Math.hypot(b.x - a.x, b.z - a.z);
      carry -= seg;
      if (carry > 0) continue;
      carry += PIER_SPACING_M;
      const centre = { x: (s.L[i].x + s.R[i].x) / 2, y: (s.L[i].y + s.R[i].y) / 2, z: (s.L[i].z + s.R[i].z) / 2 };
      const deckBottom = centre.y - DECK_THICKNESS_M, height = deckBottom - GROUND_Y;
      if (height < 1.5) continue;
      // A road passing beneath (anything well below the deck) needs the headroom, so no pier there.
      const yaw = Math.atan2(s.L[i].x - s.L[i - 1].x, s.L[i].z - s.L[i - 1].z);
      const width = Math.hypot(s.L[i].x - s.R[i].x, s.L[i].z - s.R[i].z);
      const pierWidth = Math.max(2, width * 0.5), pierDepth = 1.2;
      // The whole footprint (not just its centre) must be clear of any road beneath the deck.
      const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
      let blocked = false;
      for (let u = -1; u <= 1 && !blocked; u += 0.5) for (let v = -1; v <= 1 && !blocked; v += 1) {
        const across = u * (pierWidth / 2 + 0.4), along = v * (pierDepth / 2 + 0.4);
        const px = centre.x + cosY * across + sinY * along, pz = centre.z - sinY * across + cosY * along;
        blocked = roadsOnly.surfacesAt(px, pz).some(hit => hit.y < centre.y - 1);
      }
      if (blocked) continue;
      piers.box(centre.x, GROUND_Y + height / 2, centre.z, pierWidth, height + 0.02, pierDepth, yaw);
      pierCount++;
    }
  }

  const textures = { tile: makeTileTexture(THREE, "tile"), mesh: makeTileTexture(THREE, "mesh") };
  const bias = (rank) => DEPTH_BIAS.road(rank);
  const addMesh = (name, batch, material, userData, order = 0) => {
    if (!batch.positions.length) return;
    let geometry;
    if (batch instanceof MeshBatch) geometry = batch.toGeometry(THREE);
    else {
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(batch.positions, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(batch.uvs, 2));
      geometry.setIndex(batch.indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere?.();
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.userData = userData || {};
    mesh.renderOrder = order;
    group.add(mesh);
  };
  for (const [type, batch] of batches) {
    addMesh("osm-roads:" + type, batch, options.roadMaterial ?? new THREE.MeshStandardMaterial({ color: CLASS_COLORS[type] ?? 0x363d41, roughness: 1, metalness: 0, ...bias(roadClassRank(type)) }), { highwayClass: type }, RENDER_ORDER.road);
  }
  addMesh("osm-road-junctions", junction, options.roadMaterial ?? new THREE.MeshStandardMaterial({ color: 0x4a5054, roughness: 1, metalness: 0, ...DEPTH_BIAS.junction }), { junctions: junctionCount }, RENDER_ORDER.road);
  addMesh("osm-road-verges", verges, new THREE.MeshStandardMaterial({ color: 0x6b8a55, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }), { widthM: VERGE_WIDTH_M, drivable: true }, RENDER_ORDER.road);
  addMesh("osm-road-markings", marks, options.markingMaterial ?? new THREE.MeshStandardMaterial({ color: 0xe6e0bc, roughness: .9, metalness: 0, ...DEPTH_BIAS.marking, side: THREE.DoubleSide }), { markings: true }, RENDER_ORDER.marking);
  addMesh("osm-road-medians", medians, options.medianMaterial ?? new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: 1, metalness: 0 }), { medianSegments: medianCount, medianHeightM: MEDIAN_HEIGHT_M, source: "paired-opposing-osm-carriageways" }, RENDER_ORDER.structure);
  addMesh("osm-road-median-grass", medianGrass, options.medianGrassMaterial ?? new THREE.MeshStandardMaterial({ color: 0x557c49, roughness: 1, metalness: 0 }), { medianSegments: medianCount, medianHeightM: MEDIAN_HEIGHT_M, surface: "landscaped-grass" }, RENDER_ORDER.structure);
  addMesh("osm-road-median-concrete-tops", medianConcreteTops, options.medianMaterial ?? new THREE.MeshStandardMaterial({ color: textures.tile ? 0xffffff : 0x777d80, roughness: 1, metalness: 0, map: textures.tile || undefined }), { medianSegments: medianCount, medianHeightM: MEDIAN_HEIGHT_M, surface: "tiled-concrete" }, RENDER_ORDER.structure);
  addMesh("osm-bridge-structures", bridges, options.bridgeMaterial ?? new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: .92, metalness: .04 }), { bridgeEdges, bridgeLengthM: Number(bridgeLengthM.toFixed(1)), elevatedEdges, deckAndParapets: true, deckAndFascia: true }, RENDER_ORDER.structure);
  addMesh("osm-road-piers", piers, options.bridgeMaterial ?? new THREE.MeshStandardMaterial({ color: 0x6f7679, roughness: .95, metalness: 0 }), { piers: pierCount }, RENDER_ORDER.structure);
  const steel = () => new THREE.MeshStandardMaterial({ color: 0xaeb6bb, roughness: .35, metalness: .85 });
  addMesh("osm-road-guardrails", rails, steel(), { runs: guardrailRuns, material: "galvanised-steel" }, RENDER_ORDER.structure);
  addMesh("osm-road-guardrail-posts", posts, steel(), { runs: guardrailRuns }, RENDER_ORDER.structure);
  addMesh("osm-road-guardrail-mesh", railMesh, new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: .5, metalness: .8, side: THREE.DoubleSide, map: textures.mesh || undefined, transparent: Boolean(textures.mesh), alphaTest: textures.mesh ? 0.4 : 0 }), { runs: guardrailRuns, pattern: "wire-mesh" }, RENDER_ORDER.structure);

  const roadSurface = { triangles: ledger.triangles, thickness: ledger.thickness, colliders };
  group.userData = {
    roadMeshCount: batches.size + (junction.positions.length ? 1 : 0) + (bridges.positions.length ? 1 : 0) + (medians.positions.length ? 1 : 0),
    meshCount: group.children.length,
    edgeCount: renderedEdges, skippedEdges, junctionCount, markingSegments, stopLines, arrows,
    bridgeEdges, bridgeLengthM: Number(bridgeLengthM.toFixed(1)), elevatedEdges, medianCount, guardrailRuns, pierCount,
    colliderCount: colliders.length, triangleCount: ledger.thickness.length,
    networkId: network.id, batched: true, roadSurface
  };
  return group;
}
