/**
 * Batched road renderer for the selected-road graph.
 *
 * Surfaces come from the RD-03 foundations / RD-04 indexed surface data (fold-free,
 * UV-mapped). Junction nodes get a fan patch built from the real boundary endpoints
 * of the edges that share the node, so connections only exist where OSM shares a
 * node: a bridge or tunnel that merely crosses another road is never joined to it.
 * Markings (lane dividers, centre and edge lines, stop lines, direction arrows)
 * follow the foundation lane geometry. No height is invented: the source data has
 * no elevation, so every road is drawn at its imported y.
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

const SURFACE_Y = 0.035, JUNCTION_Y = 0.03, MARK_Y = 0.065;
const LINE_W = 0.14, STOP_W = 0.4, END_CLEAR_M = 3, DASH_M = 3, GAP_M = 6;

class Batch {
  constructor() { this.positions = []; this.uvs = []; this.indices = []; }
  get base() { return this.positions.length / 3; }
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

export function createRoadMeshes(THREE, network, options = {}) {
  if (!THREE?.BufferGeometry || !THREE?.Mesh || !Array.isArray(network?.edges))
    throw new Error("Three.js and a valid road network are required");
  const group = new THREE.Group();
  const batches = new Map(), marks = new Batch(), junction = new Batch();
  const nodeEnds = new Map(); // nodeId -> [{left,right,y}]
  const nodeDegree = new Map();
  let renderedEdges = 0, skippedEdges = 0, markingSegments = 0, stopLines = 0, arrows = 0;
  for (const e of network.edges) {
    nodeDegree.set(e.fromNodeId, (nodeDegree.get(e.fromNodeId) || 0) + 1);
    nodeDegree.set(e.toNodeId, (nodeDegree.get(e.toNodeId) || 0) + 1);
  }

  for (const edge of network.edges) {
    let foundation, surface;
    try {
      foundation = buildRoadFoundation(edge);
      surface = buildRoadSurfaceData(foundation, { surfaceOffsetM: SURFACE_Y });
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
      if ((nodeDegree.get(endNode) || 0) < 3 || surface.lengthM < 12) continue;
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
    addMesh("osm-roads:" + type, batch, options.roadMaterial ?? new THREE.MeshStandardMaterial({ color: CLASS_COLORS[type] ?? 0x363d41, roughness: 1, metalness: 0 }), { highwayClass: type });
  }
  addMesh("osm-road-junctions", junction, options.roadMaterial ?? new THREE.MeshStandardMaterial({ color: 0x4a5054, roughness: 1, metalness: 0 }), { junctions: junctionCount });
  addMesh("osm-road-markings", marks, options.markingMaterial ?? new THREE.MeshStandardMaterial({ color: 0xe6e0bc, roughness: .9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }), { markings: true });

  group.userData = {
    roadMeshCount: batches.size + (junction.positions.length ? 1 : 0),
    edgeCount: renderedEdges, skippedEdges, junctionCount, markingSegments, stopLines, arrows,
    networkId: network.id, batched: true
  };
  return group;
}
