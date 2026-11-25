/**
 * Batched road renderer for the selected-road graph.
 *
 * Surfaces come from the RD-03 foundations / RD-04 indexed surface data (fold-free,
 * UV-mapped). Junction nodes get a fan patch built from the real boundary endpoints
 * of the edges that share the node, so connections only exist where OSM shares a
 * node: a bridge or tunnel that merely crosses another road is never joined to it.
 * Markings (lane dividers, centre and edge lines, stop lines, direction arrows)
 * follow the foundation lane geometry. Road elevation remains at imported y because
 * OSM supplies no surveyed heights; only measured median gaps receive a low visual curb.
 */
import { buildRoadFoundation } from "./road-foundations.js";
import { buildRoadSurfaceData } from "./road-surface-geometry.js";

const CLASS_COLORS = {
  motorway: 0x55585a, motorway_link: 0x50565a, trunk: 0x50565a, trunk_link: 0x50565a,
  primary: 0x4a5054, primary_link: 0x4a5054, secondary: 0x454b4f, secondary_link: 0x454b4f,
  tertiary: 0x3e4549, tertiary_link: 0x3e4549, residential: 0x363d41,
  unclassified: 0x363d41, living_street: 0x42484b, service: 0x4a4f52
};
const roadClass = edge => Object.hasOwn(CLASS_COLORS, edge.osm?.highway) ? edge.osm.highway : "residential";
const shoulderWidthForClass = edge => ({
  motorway: 1.0, motorway_link: 0.55, trunk: 0.9, trunk_link: 0.55,
  primary: 0.65, primary_link: 0.45, secondary: 0.45, secondary_link: 0.35,
  tertiary: 0.3, tertiary_link: 0.25, residential: 0.2, unclassified: 0.2, service: 0.15
}[roadClass(edge)] ?? 0);

function resolveRoadShoulders(edge, edges) {
  const width = shoulderWidthForClass(edge);
  if (!width) return { shoulderLeftM: 0, shoulderRightM: 0 };
  const model = edge.roadModel;
  if (model?.groupingSource === "osm:paired-oneway-carriageways" && model.physicalRoadId) {
    const opposite = edges.find(candidate => candidate.id !== edge.id &&
      candidate.roadModel?.physicalRoadId === model.physicalRoadId &&
      candidate.roadModel?.carriagewayId !== model.carriagewayId &&
      candidate.centerline?.length >= 2);
    if (opposite) {
      const a = edge.centerline[0], b = edge.centerline.at(-1);
      const other = opposite.centerline;
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const ox = other.reduce((sum, p) => sum + p.x, 0) / other.length;
      const oz = other.reduce((sum, p) => sum + p.z, 0) / other.length;
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
      const leftDot = (ox - mx) * (-dz / length) + (oz - mz) * (dx / length);
      // Keep the shoulder on the outside of the divided road; the median-facing
      // edge stays reserved for the measured median and junction openings.
      return leftDot >= 0
        ? { shoulderLeftM: 0, shoulderRightM: width }
        : { shoulderLeftM: width, shoulderRightM: 0 };
    }
  }
  return { shoulderLeftM: width * 0.5, shoulderRightM: width * 0.5 };
}

const SURFACE_Y = 0.035, JUNCTION_Y = 0.03, MARK_Y = 0.065;
const LINE_W = 0.14, STOP_W = 0.4, END_CLEAR_M = 3, DASH_M = 3, GAP_M = 6;

class Batch {
  constructor() { this.positions = []; this.uvs = []; this.indices = []; }
  get base() { return this.positions.length / 3; }
}

// Add a closed, rotated concrete box to a batched mesh. Bridge decks and
// parapets are kept in one draw call per area rather than spawning many objects.
function addBox(batch, cx, cy, cz, sx, sy, sz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), base = batch.base;
  for (const dy of [-1, 1]) for (const dz of [-1, 1]) for (const dx of [-1, 1]) {
    const lx = dx * sx / 2, lz = dz * sz / 2;
    batch.positions.push(cx + lx * c + lz * s, cy + dy * sy / 2, cz - lx * s + lz * c);
    batch.uvs.push((dx + 1) / 2, (dz + 1) / 2);
  }
  const face = (a, b, d, e) => batch.indices.push(base + a, base + b, base + d, base + a, base + d, base + e);
  // Outward winding: top faces point up, bottom faces down, and parapet sides out.
  face(4, 6, 7, 5); face(0, 1, 3, 2);
  face(0, 4, 5, 1); face(2, 3, 7, 6); face(0, 2, 6, 4); face(1, 5, 7, 3);
}

// Flat ribbon (quad strip) along a polyline, optionally dashed, skipping the ends.
function addRibbon(batch, points, width, { dashed = false, clearM = END_CLEAR_M } = {}) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const total = cum[cum.length - 1];
  if (total < clearM * 2 + 2) return;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    let s0 = Math.max(cum[i - 1], clearM), s1 = Math.min(cum[i], total - clearM);
    if (s1 - s0 < 0.2) continue;
    const len = cum[i] - cum[i - 1];
    if (len < 1e-6) continue;
    const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len, nx = -dz * width / 2, nz = dx * width / 2;
    const emit = (t0, t1) => {
      const p0 = { x: a.x + dx * (t0 - cum[i - 1]), y: a.y, z: a.z + dz * (t0 - cum[i - 1]) };
      const p1 = { x: a.x + dx * (t1 - cum[i - 1]), y: a.y, z: a.z + dz * (t1 - cum[i - 1]) };
      const n = batch.base;
      batch.positions.push(p0.x + nx, p0.y + MARK_Y, p0.z + nz, p0.x - nx, p0.y + MARK_Y, p0.z - nz,
        p1.x + nx, p1.y + MARK_Y, p1.z + nz, p1.x - nx, p1.y + MARK_Y, p1.z - nz);
      batch.uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
      // upward-facing winding (matches the surface builder: normalY > 0)
      batch.indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    };
    if (!dashed) { emit(s0, s1); continue; }
    const period = DASH_M + GAP_M;
    for (let s = Math.floor(s0 / period) * period; s < s1; s += period) {
      const t0 = Math.max(s, s0), t1 = Math.min(s + DASH_M, s1);
      if (t1 - t0 > 0.3) emit(t0, t1);
    }
  }
}

function addRaisedMedian(grassBatch, concreteTopBatch, curbBatch, points, width, height = 0.28) {
  const clean = [];
  for (const point of points) {
    const previous = clean.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.z - previous.z) > 0.25) clean.push(point);
  }
  if (clean.length < 2 || width < 0.8) return;
  const topBatch = width >= 3 ? grassBatch : concreteTopBatch;
  for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1], b = clean[i], dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 1) continue;
    const nx = -dz / length * width / 2, nz = dx / length * width / 2;
    const baseA = a.y + SURFACE_Y - 0.01, baseB = b.y + SURFACE_Y - 0.01;
    const leftA = [a.x + nx, baseA, a.z + nz], rightA = [a.x - nx, baseA, a.z - nz];
    const leftB = [b.x + nx, baseB, b.z + nz], rightB = [b.x - nx, baseB, b.z - nz];
    const topLeftA = [leftA[0], baseA + height, leftA[2]], topRightA = [rightA[0], baseA + height, rightA[2]];
    const topLeftB = [leftB[0], baseB + height, leftB[2]], topRightB = [rightB[0], baseB + height, rightB[2]];

    const topBase = topBatch.base;
    for (const vertex of [topLeftA,topRightA,topLeftB,topRightB]) topBatch.positions.push(...vertex);
    topBatch.uvs.push(0,0,1,0,0,1,1,1);
    topBatch.indices.push(topBase,topBase+2,topBase+1, topBase+1,topBase+2,topBase+3);

    const curbBase = curbBatch.base;
    for (const vertex of [leftA,rightA,leftB,rightB,topLeftA,topRightA,topLeftB,topRightB]) curbBatch.positions.push(...vertex);
    curbBatch.uvs.push(0,0,1,0,0,1,1,1,0,0,1,0,0,1,1,1);
    curbBatch.indices.push(
      curbBase+0,curbBase+4,curbBase+2, curbBase+2,curbBase+4,curbBase+6,
      curbBase+1,curbBase+3,curbBase+5, curbBase+3,curbBase+7,curbBase+5,
      curbBase+0,curbBase+1,curbBase+4, curbBase+1,curbBase+5,curbBase+4,
      curbBase+2,curbBase+6,curbBase+3, curbBase+3,curbBase+6,curbBase+7
    );
  }
}

function addCross(batch, centre, dirX, dirZ, halfLength, width, y) {
  // Ribbon across the lane (perpendicular to travel) for stop lines.
  const nx = -dirZ, nz = dirX, hl = halfLength, hw = width / 2;
  const corners = [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl]].map(([along, across]) => [
    centre.x + dirX * along + nx * across, centre.z + dirZ * along + nz * across]);
  const n = batch.base;
  for (const [x, z] of corners) batch.positions.push(x, y + MARK_Y, z);
  batch.uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
  batch.indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
}

function addArrow(batch, centre, dirX, dirZ, y, laneWidth) {
  const shaft = Math.min(0.2, laneWidth * 0.07), head = Math.min(0.9, laneWidth * 0.28), len = 3.2, headLen = 1.2;
  const nx = -dirZ, nz = dirX;
  const P = (along, across) => [centre.x + dirX * along + nx * across, y + MARK_Y, centre.z + dirZ * along + nz * across];
  const verts = [
    P(-len / 2, -shaft), P(-len / 2, shaft), P(len / 2 - headLen, -shaft), P(len / 2 - headLen, shaft),
    P(len / 2 - headLen, -head), P(len / 2 - headLen, head), P(len / 2, 0)
  ];
  const n = batch.base;
  for (const v of verts) batch.positions.push(...v);
  for (let i = 0; i < verts.length; i++) batch.uvs.push(0, 0);
  batch.indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2, n + 4, n + 5, n + 6);
}

function polylineMid(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const half = cum[cum.length - 1] / 2;
  for (let i = 1; i < points.length; i++) {
    if (cum[i] >= half) {
      const t = (half - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      const a = points[i - 1], b = points[i], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x: a.x + (b.x - a.x) * t, y: a.y, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len };
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
    const t = length2 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length2)) : 0;
    const candidate = { x: a.x + dx * t, y: a.y + (b.y - a.y) * t, z: a.z + dz * t };
    const distanceM = Math.hypot(point.x - candidate.x, point.z - candidate.z);
    if (!best || distanceM < best.distanceM) best = { ...candidate, distanceM };
  }
  return best;
}

function addMedianDetail(batch, points, width, { tiles = false, metal = false, flowers = false, flowerStemsBatch, flowerHeadsBatch, flowerHeadsAltBatch } = {}) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (length < 1.2) continue;
    const yaw = Math.atan2(dx, dz), nx = -dz / length, nz = dx / length;
    const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, cy = (a.y + b.y) / 2 + 0.29;
    if (tiles) {
      // Modular paving slabs with narrow expansion joints; slabs follow each
      // measured median segment instead of forming one featureless green strip.
      const tileLength = 1.45, count = Math.max(1, Math.floor(length / tileLength));
      for (let k = 0; k < count; k++) {
        const along = -length / 2 + (k + 0.5) * length / count;
        addBox(batch, cx + dx / length * along, cy + 0.035, cz + dz / length * along,
          Math.max(0.45, width - 0.18), 0.07, Math.max(0.25, length / count - 0.055), yaw);
      }
    }
    if (metal && width >= 1.6) {
      // Two metallic guardrails with concrete block plinths and mesh infill.
      for (const side of [-1, 1]) {
        const ox = nx * side * (width * 0.34), oz = nz * side * (width * 0.34);
        addBox(batch, cx + ox, cy + 0.12, cz + oz, 0.22, 0.24, length, yaw);
        addBox(batch, cx + ox, cy + 0.67, cz + oz, 0.08, 0.09, length, yaw);
        addBox(batch, cx + ox, cy + 0.38, cz + oz, 0.055, 0.055, length, yaw);
        const postCount = Math.max(1, Math.floor(length / 2.4));
        for (let k = 0; k <= postCount; k++) {
          const along = -length / 2 + k * length / postCount;
          addBox(batch, cx + ox + dx / length * along, cy + 0.42,
            cz + oz + dz / length * along, 0.065, 0.62, 0.075, yaw);
        }
      }
      if (width >= 2.6) {
        // A central metallic mesh-block divider is represented by close-set
        // vertical bars and two horizontal rails, not a solid opaque wall.
        addBox(batch, cx, cy + 0.43, cz, 0.06, 0.06, length, yaw);
        addBox(batch, cx, cy + 0.78, cz, 0.06, 0.06, length, yaw);
        const count = Math.max(2, Math.floor(length / 0.32));
        for (let k = 0; k <= count; k++) {
          const along = -length / 2 + k * length / count;
          addBox(batch, cx + dx / length * along, cy + 0.60,
            cz + dz / length * along, 0.045, 0.38, 0.045, yaw);
        }
      }
    }
    if (flowers && width >= 3.2) {
      const count = Math.max(1, Math.floor(length / 3.5));
      for (let k = 0; k < count; k++) {
        const along = -length / 2 + (k + 0.5) * length / count;
        const fx = cx + dx / length * along, fz = cz + dz / length * along;
        // Raised soil planter plus individual stems and alternating flower heads.
        addBox(batch, fx, cy + 0.12, fz, 0.62, 0.2, 0.62, yaw);
        for (let plant = 0; plant < 3; plant++) {
          const lateral = (plant - 1) * 0.19;
          const px = fx + nx * lateral, pz = fz + nz * lateral;
          addBox(flowerStemsBatch, px, cy + 0.52, pz, 0.055, 0.62, 0.055, yaw);
          const headBatch = plant % 2 ? flowerHeadsAltBatch : flowerHeadsBatch;
          addBox(headBatch, px, cy + 0.86, pz, 0.24, 0.18, 0.24, yaw);
          for (let petal = 0; petal < 4; petal++) {
            const angle = petal * Math.PI / 2;
            addBox(headBatch, px + Math.cos(angle) * 0.12, cy + 0.86,
              pz + Math.sin(angle) * 0.12, 0.14, 0.11, 0.14, yaw);
          }
        }
      }
    }
  }
}

function addVerifiedCarriagewayMedians(edges, grassBatch, concreteTopBatch, curbBatch, medianTiles, medianMetal, medianFlowers, medianFlowerStems, medianFlowerHeads, medianFlowerHeadsAlt) {
  const physicalRoads = new Map();
  for (const edge of edges) {
    const model = edge.roadModel;
    if (model?.groupingSource !== "osm:paired-oneway-carriageways" || !model.physicalRoadId || !model.carriagewayId) continue;
    if (!physicalRoads.has(model.physicalRoadId)) physicalRoads.set(model.physicalRoadId, new Map());
    const carriageways = physicalRoads.get(model.physicalRoadId);
    if (!carriageways.has(model.carriagewayId)) carriageways.set(model.carriagewayId, []);
    carriageways.get(model.carriagewayId).push(edge);
  }
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
      const matched = a.centerline.map(point => {
        const nearest = nearestPointOnPolyline(point, b.centerline);
        return nearest && nearest.distanceM >= 4 && nearest.distanceM <= 45
          ? { point: { x: (point.x + nearest.x) / 2, y: (point.y + nearest.y) / 2, z: (point.z + nearest.z) / 2 }, distanceM: nearest.distanceM }
          : null;
      }).filter(Boolean);
      if (matched.length < 2) continue;
      const separationM = matched.reduce((sum, item) => sum + item.distanceM, 0) / matched.length;
      const widthA = (a.lanes || []).reduce((sum, lane) => sum + (lane.widthM || 0), 0);
      const widthB = (b.lanes || []).reduce((sum, lane) => sum + (lane.widthM || 0), 0);
      const medianWidthM = separationM - (widthA + widthB) / 2;
      // A divider is emitted only when paired, opposite-flow OSM carriageways
      // leave a measurable physical gap after both carriageway widths are accounted for.
      if (!Number.isFinite(medianWidthM) || medianWidthM < 0.8 || medianWidthM > 12) continue;
      const medianLine = matched.map(item => ({ ...item.point, y: item.point.y + 0.025 }));
      const lengthM = medianLine.slice(1).reduce((sum, point, index) =>
        sum + Math.hypot(point.x - medianLine[index].x, point.z - medianLine[index].z), 0);
      if (lengthM < 8) continue;
      addRaisedMedian(grassBatch, concreteTopBatch, curbBatch, medianLine, medianWidthM, 0.28);
      addMedianDetail(medianTiles, medianLine, medianWidthM, { tiles: true });
      addMedianDetail(medianMetal, medianLine, medianWidthM, { metal: true });
      addMedianDetail(medianFlowers, medianLine, medianWidthM, { flowers: true, flowerStemsBatch: medianFlowerStems, flowerHeadsBatch: medianFlowerHeads, flowerHeadsAltBatch: medianFlowerHeadsAlt });
      medianSegments++;
    }
  }
  return medianSegments;
}


function createProceduralAsphaltTexture(THREE) {
  if (!THREE?.DataTexture || !THREE.RGBAFormat || !THREE.UnsignedByteType) return null;
  const size = 128, data = new Uint8Array(size * size * 4);
  let seed = 0x4a17c3;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const grain = (random() - 0.5) * 22;
    const speckle = random() > 0.992 ? (random() > 0.5 ? 18 : -20) : 0;
    const value = Math.max(28, Math.min(108, 66 + grain + speckle));
    data[i] = value;
    data[i + 1] = value + 1;
    data[i + 2] = value + 2;
    data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat?.set?.(1, 28);
  if (THREE.LinearFilter) texture.magFilter = THREE.LinearFilter;
  if (THREE.LinearMipmapLinearFilter) texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export function createRoadMeshes(THREE, network, options = {}) {
  if (!THREE?.BufferGeometry || !THREE?.Mesh || !Array.isArray(network?.edges))
    throw new Error("Three.js and a valid road network are required");
  const group = new THREE.Group();
  const asphaltTexture = options.asphaltTexture ?? createProceduralAsphaltTexture(THREE);
  const batches = new Map(), marks = new Batch(), junction = new Batch(), bridges = new Batch(), medians = new Batch(), medianGrass = new Batch(), medianConcreteTops = new Batch(), medianTiles = new Batch(), medianMetal = new Batch(), medianFlowers = new Batch(), medianFlowerStems = new Batch(), medianFlowerHeads = new Batch(), medianFlowerHeadsAlt = new Batch(), signalPoles = new Batch(), signalHeads = new Batch(), signalRed = new Batch(), signalAmber = new Batch(), signalGreen = new Batch();
  const nodeEnds = new Map(); // nodeId -> [{left,right,y}]
  const nodeDegree = new Map(), incidentEdges = new Map(), foundations = new Map();
  let renderedEdges = 0, skippedEdges = 0, markingSegments = 0, stopLines = 0, arrows = 0, bridgeEdges = 0, bridgeLengthM = 0;
  for (const e of network.edges) {
    if (["bus-stop-bay", "pickup-bay"].includes(e.selection?.role)) continue;
    nodeDegree.set(e.fromNodeId, (nodeDegree.get(e.fromNodeId) || 0) + 1);
    nodeDegree.set(e.toNodeId, (nodeDegree.get(e.toNodeId) || 0) + 1);
    for (const nodeId of [e.fromNodeId, e.toNodeId]) {
      if (!incidentEdges.has(nodeId)) incidentEdges.set(nodeId, []);
      incidentEdges.get(nodeId).push(e);
    }
  }

  for (const edge of network.edges) {
    let foundation, surface;
    try {
      foundation = buildRoadFoundation(edge, resolveRoadShoulders(edge, network.edges));
      surface = buildRoadSurfaceData(foundation, { surfaceOffsetM: SURFACE_Y });
      foundations.set(edge.id, foundation);
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
    renderedEdges++;

    // Bridge-tagged OSM ways receive a visible concrete deck and side parapets.
    // The deck follows the imported vertical coordinates exactly: OSM bridge=yes
    // alone does not provide a metric elevation, so no artificial rise is added.
    if (edge.osm?.bridge && edge.osm.bridge !== "no") {
      bridgeEdges++;
      const widthM = foundation.crossSection.laneWidthM;
      const alignment = foundation.alignment;
      for (let i = 1; i < alignment.length; i++) {
        const a = alignment[i - 1], b = alignment[i];
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
        if (len < 0.5) continue;
        bridgeLengthM += len;
        const yaw = Math.atan2(dx, dz), nx = -dz / len, nz = dx / len;
        const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, cy = (a.y + b.y) / 2;
        addBox(bridges, cx, cy - 0.16, cz, widthM + 1.0, 0.34, len + 0.12, yaw);
        for (const side of [-1, 1]) {
          const offset = side * (widthM / 2 + 0.24);
          const rx = cx + nx * offset, rz = cz + nz * offset;
          addBox(bridges, rx, cy + 0.48, rz, 0.22, 0.96, len + 0.12, yaw);
          addBox(bridges, rx, cy + 1.0, rz, 0.32, 0.12, len + 0.12, yaw);
        }
      }
    }

    const { left, right } = foundation.boundaries;
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
      const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
      const stop = { x: b.x - dx * 1.5, z: b.z - dz * 1.5 };
      addCross(marks, stop, dx, dz, lane.widthM / 2 - 0.15, STOP_W, b.y);
      stopLines++;
    }
    // direction arrows on long edges, one per lane, in the lane's direction of travel
    if (surface.lengthM > 30 && !roundabout) {
      for (const lane of lanes) {
        if (lane.direction === "both") continue;
        const m = polylineMid(lane.points); if (!m) continue;
        const sign = lane.direction === "forward" ? 1 : -1;
        addArrow(marks, m, m.dx * sign, m.dz * sign, m.y, lane.widthM);
        arrows++;
      }
    }
  }

  // Authored vehicle signals at significant branch-road junctions when OSM
  // has not already mapped a signal node. Small residential access points are
  // deliberately excluded to avoid turning every driveway into a signal.
  let generatedJunctionSignalHeads = 0;
  const majorClasses = new Set(["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link"]);
  const branchClasses = new Set(["tertiary", "tertiary_link", "residential", "unclassified", "service"]);
  for (const [nodeId, incident] of incidentEdges) {
    if (incident.length < 3 || options.signalNodeIds?.has(nodeId)) continue;
    const hasMajor = incident.some(edge => majorClasses.has(edge.osm?.highway));
    const hasBranch = incident.some(edge => branchClasses.has(edge.osm?.highway));
    if (!hasMajor || !hasBranch) continue;
    for (const edge of incident) {
      const foundation = foundations.get(edge.id);
      if (!foundation) continue;
      for (const lane of foundation.laneCentrelines) {
        if (lane.direction === "both") continue;
        const incoming = lane.direction === "forward" ? edge.toNodeId === nodeId : edge.fromNodeId === nodeId;
        if (!incoming || lane.points.length < 2) continue;
        const endIndex = lane.direction === "forward" ? lane.points.length - 1 : 0;
        const prevIndex = lane.direction === "forward" ? endIndex - 1 : 1;
        const end = lane.points[endIndex], prev = lane.points[prevIndex];
        const vx = end.x - prev.x, vz = end.z - prev.z, len = Math.hypot(vx, vz);
        if (len < 0.5) continue;
        const tx = vx / len, tz = vz / len, rightX = tz, rightZ = -tx;
        const stopX = end.x - tx * 4.5, stopZ = end.z - tz * 4.5;
        const signalX = stopX + rightX * (lane.widthM / 2 + 0.8);
        const signalZ = stopZ + rightZ * (lane.widthM / 2 + 0.8);
        const yaw = Math.atan2(tx, tz), y = end.y || 0;
        addBox(signalPoles, signalX, y + 2.5, signalZ, 0.14, 5.0, 0.14, yaw);
        addBox(signalHeads, signalX, y + 4.25, signalZ, 0.5, 0.92, 0.36, yaw);
        addBox(signalRed, signalX, y + 4.53, signalZ - tz * 0.19, 0.18, 0.16, 0.06, yaw);
        addBox(signalAmber, signalX, y + 4.25, signalZ - tz * 0.19, 0.18, 0.16, 0.06, yaw);
        addBox(signalGreen, signalX, y + 3.97, signalZ - tz * 0.19, 0.18, 0.16, 0.06, yaw);
        generatedJunctionSignalHeads++;
        break; // one correctly placed head per incoming road approach
      }
    }
  }

  const medianCount = addVerifiedCarriagewayMedians(network.edges, medianGrass, medianConcreteTops, medians, medianTiles, medianMetal, medianFlowers, medianFlowerStems, medianFlowerHeads, medianFlowerHeadsAlt);

  // ---- junction patches (fan around each shared node from real boundary endpoints) ----
  let junctionCount = 0;
  for (const [nodeId, ends] of nodeEnds) {
    if (ends.length < 2) continue;
    if (ends.length === 2) {
      // Degree-2 node (a bend): only patch when the two boundaries do not already meet.
      const [a, b] = ends, gap = Math.max(Math.hypot(a.left.x - b.left.x, a.left.z - b.left.z), Math.hypot(a.right.x - b.right.x, a.right.z - b.right.z),
        Math.hypot(a.left.x - b.right.x, a.left.z - b.right.z) * 0, 0);
      const swapped = Math.max(Math.hypot(a.left.x - b.right.x, a.left.z - b.right.z), Math.hypot(a.right.x - b.left.x, a.right.z - b.left.z));
      if (Math.min(gap, swapped) < 0.05) continue;
    }
    const pts = ends.flatMap(e => [e.left, e.right]);
    const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length };
    const sorted = pts.map(p => ({ p, a: Math.atan2(p.z - c.z, p.x - c.x) })).sort((u, v) => u.a - v.a).map(o => o.p);
    const n = junction.base;
    junction.positions.push(c.x, c.y + JUNCTION_Y, c.z);
    junction.uvs.push(.5, .5);
    for (const p of sorted) { junction.positions.push(p.x, p.y + JUNCTION_Y, p.z); junction.uvs.push(0, 0); }
    for (let i = 0; i < sorted.length; i++) {
      const j = (i + 1) % sorted.length;
      const a = { x: sorted[i].x - c.x, z: sorted[i].z - c.z }, b = { x: sorted[j].x - c.x, z: sorted[j].z - c.z };
      // normalY of (c, v_i, v_j) = (v_i-c) x (v_j-c) component; require upward winding
      const normalY = (sorted[i].z - c.z) * (sorted[j].x - c.x) - (sorted[i].x - c.x) * (sorted[j].z - c.z);
      if (Math.abs(normalY) < 1e-6) continue;
      if (normalY > 0) junction.indices.push(n, n + 1 + i, n + 1 + j);
      else junction.indices.push(n, n + 1 + j, n + 1 + i);
    }
    junctionCount++;
  }

  const addMesh = (name, batch, material, userData) => {
    if (!batch.positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(batch.positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(batch.uvs, 2));
    geometry.setIndex(batch.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere?.();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.userData = userData || {};
    group.add(mesh);
  };
  for (const [type, batch] of batches) {
    addMesh("osm-roads:" + type, batch, options.roadMaterial ?? new THREE.MeshStandardMaterial({ color: CLASS_COLORS[type] ?? 0x363d41, map: asphaltTexture || undefined, roughness: 0.96, metalness: 0 }), { highwayClass: type });
  }
  addMesh("osm-road-junctions", junction, options.roadMaterial ?? new THREE.MeshStandardMaterial({ color: 0x4a5054, map: asphaltTexture || undefined, roughness: 0.96, metalness: 0 }), { junctions: junctionCount });
  addMesh("osm-road-markings", marks, options.markingMaterial ?? new THREE.MeshStandardMaterial({ color: 0xe6e0bc, roughness: .9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }), { markings: true });
  addMesh("osm-road-medians", medians, options.medianMaterial ?? new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: 1, metalness: 0, side: THREE.DoubleSide }), { medianSegments: medianCount, medianHeightM: 0.28, source: "paired-opposing-osm-carriageways" });
  addMesh("osm-road-median-grass", medianGrass, options.medianGrassMaterial ?? new THREE.MeshStandardMaterial({ color: 0x557c49, roughness: 1, metalness: 0 }), { medianSegments: medianCount, medianHeightM: 0.28, surface: "landscaped-grass" });
  addMesh("osm-road-median-concrete-tops", medianConcreteTops, options.medianMaterial ?? new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: 1, metalness: 0 }), { medianSegments: medianCount, medianHeightM: 0.28, surface: "concrete" });
  addMesh("osm-road-median-tiles", medianTiles, options.medianTileMaterial ?? new THREE.MeshStandardMaterial({ color: 0xaaa69a, roughness: 0.92, metalness: 0 }), { medianSegments: medianCount, surface: "modular-tiled-paving" });
  addMesh("osm-road-median-metal-guards", medianMetal, options.medianMetalMaterial ?? new THREE.MeshStandardMaterial({ color: 0x737d83, roughness: 0.48, metalness: 0.82 }), { medianSegments: medianCount, guardrails: true, meshInfill: true, blockPlinths: true });
  addMesh("osm-road-median-flowers", medianFlowers, options.medianFlowerBedMaterial ?? new THREE.MeshStandardMaterial({ color: 0x6d5844, roughness: 0.96, metalness: 0 }), { medianSegments: medianCount, landscaped: true, flowerBeds: true });
  addMesh("osm-road-median-flower-stems", medianFlowerStems, options.medianFlowerStemMaterial ?? new THREE.MeshStandardMaterial({ color: 0x2e7d43, roughness: 0.9, metalness: 0 }), { medianSegments: medianCount, stems: true });
  addMesh("osm-road-median-flower-heads", medianFlowerHeads, options.medianFlowerMaterial ?? new THREE.MeshStandardMaterial({ color: 0xc65b8b, roughness: 0.82, metalness: 0 }), { medianSegments: medianCount, blossoms: true });
  addMesh("osm-road-median-flower-heads-alt", medianFlowerHeadsAlt, options.medianFlowerAltMaterial ?? new THREE.MeshStandardMaterial({ color: 0xe2b84f, roughness: 0.82, metalness: 0 }), { medianSegments: medianCount, blossoms: true });
  addMesh("osm-generated-junction-signal-poles", signalPoles, options.signalPoleMaterial ?? new THREE.MeshStandardMaterial({ color: 0x343a3d, roughness: 0.75, metalness: 0.3 }), { generatedJunctionSignalHeads });
  addMesh("osm-generated-junction-signal-heads", signalHeads, options.signalHeadMaterial ?? new THREE.MeshStandardMaterial({ color: 0x101416, roughness: 0.6, metalness: 0.1 }), { generatedJunctionSignalHeads });
  addMesh("osm-generated-junction-signal-red", signalRed, options.signalRedMaterial ?? new THREE.MeshStandardMaterial({ color: 0xd91f1f, roughness: 0.45, emissive: 0x4a0000 }), { generatedJunctionSignalHeads });
  addMesh("osm-generated-junction-signal-amber", signalAmber, options.signalAmberMaterial ?? new THREE.MeshStandardMaterial({ color: 0xf3a712, roughness: 0.45, emissive: 0x4a2800 }), { generatedJunctionSignalHeads });
  addMesh("osm-generated-junction-signal-green", signalGreen, options.signalGreenMaterial ?? new THREE.MeshStandardMaterial({ color: 0x22a85a, roughness: 0.45, emissive: 0x003b12 }), { generatedJunctionSignalHeads });
  addMesh("osm-bridge-structures", bridges, options.bridgeMaterial ?? new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: .92, metalness: .04 }), { bridgeEdges, bridgeLengthM: Number(bridgeLengthM.toFixed(1)), deckAndParapets: true });

  group.userData = {
    roadMeshCount: batches.size + [junction, bridges, medians, medianGrass, medianConcreteTops, medianTiles, medianMetal, medianFlowers, medianFlowerStems, medianFlowerHeads, medianFlowerHeadsAlt, signalPoles, signalHeads, signalRed, signalAmber, signalGreen].filter(batch => batch.positions.length).length,
    edgeCount: renderedEdges, skippedEdges, junctionCount, markingSegments, stopLines, arrows,
    bridgeEdges, bridgeLengthM: Number(bridgeLengthM.toFixed(1)), medianCount, medianTileSegments: medianTiles.indices.length / 36, medianMetalTriangles: medianMetal.indices.length / 3, medianFlowerTriangles: medianFlowers.indices.length / 3, medianFlowerHeadTriangles: (medianFlowerHeads.indices.length + medianFlowerHeadsAlt.indices.length) / 3, generatedJunctionSignalHeads,
    networkId: network.id, batched: true
  };
  return group;
}
