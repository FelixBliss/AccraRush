/**
 * Derived grade separation for bridge-tagged OSM structures.
 *
 * The OSM extracts carry no heights (every centreline point is y = 0), but they do
 * carry `bridge` and `layer` tags. Rendering a layer-1 flyover on the same plane as
 * the road it crosses puts a bridge deck and 1 m parapets across live traffic and makes
 * both roads share one surface. This module lifts a structure only where the data proves
 * it is a real grade separation: its centreline crosses another road that is NOT joined
 * to it at a shared node and that sits on a lower layer.
 *
 * Rules (all deterministic, no randomness, no location-specific values):
 *  - Structures are connected groups of bridge edges with layer >= 1. A group is lifted
 *    only if one of its edges crosses a lower-layer road.
 *  - The deck stands `layerStepM` per layer above the road it crosses.
 *  - Every node that touches an at-grade edge stays at its imported height, so the
 *    lifted structure joins the existing network without a step or a gap.
 *  - Heights rise from those nodes no faster than `maxGrade`, so ramps are drivable.
 *  - Heights are DERIVED, not surveyed. Each lifted edge records its provenance so
 *    nothing downstream can mistake them for measured elevation.
 *
 * Horizontal geometry is never moved: extra vertices are inserted along the original
 * polyline, so x/z of every original point and every node is unchanged.
 */
export const GRADE_SEPARATION = Object.freeze({
  layerStepM: 5.5,
  maxGrade: 0.06,
  subdivisionM: 4,
  smoothingPasses: 6,
  minCrossingClearanceM: 4.5,
  provenance: "derived:osm-layer-grade-separation"
});

const EPSILON = 1e-9;
const parseLayer = value => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};
const isBridge = edge => Boolean(edge.osm?.bridge) && edge.osm.bridge !== "no";
const horizontal = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

function cumulativeLengths(points) {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + horizontal(points[i - 1], points[i]));
  return cumulative;
}

/** Proper intersection of two segments in the x/z plane. Returns {t, u} or null. */
function segmentIntersection(a, b, c, d) {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z;
  const denominator = rx * sz - rz * sx;
  if (Math.abs(denominator) < EPSILON) return null; // parallel or collinear: overlap is not a crossing
  const qx = c.x - a.x, qz = c.z - a.z;
  const t = (qx * sz - qz * sx) / denominator;
  const u = (qx * rz - qz * rx) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
}

function buildSegmentGrid(edges, cell) {
  const grid = new Map();
  edges.forEach((edge, edgeIndex) => {
    for (let i = 1; i < edge.centerline.length; i++) {
      const a = edge.centerline[i - 1], b = edge.centerline[i];
      const minX = Math.floor(Math.min(a.x, b.x) / cell), maxX = Math.floor(Math.max(a.x, b.x) / cell);
      const minZ = Math.floor(Math.min(a.z, b.z) / cell), maxZ = Math.floor(Math.max(a.z, b.z) / cell);
      for (let gx = minX; gx <= maxX; gx++) for (let gz = minZ; gz <= maxZ; gz++) {
        const key = gx + ":" + gz;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push({ edgeIndex, segment: i });
      }
    }
  });
  return grid;
}

function findCrossings(edges, candidates, cell = 60) {
  const grid = buildSegmentGrid(edges, cell);
  const crossings = new Map(); // edge index -> [{ otherIndex, s, layerOther, otherY }]
  for (const index of candidates) {
    const edge = edges[index], cumulative = cumulativeLengths(edge.centerline), layer = parseLayer(edge.osm?.layer);
    const found = [];
    const seen = new Set();
    for (let i = 1; i < edge.centerline.length; i++) {
      const a = edge.centerline[i - 1], b = edge.centerline[i];
      const minX = Math.floor(Math.min(a.x, b.x) / cell), maxX = Math.floor(Math.max(a.x, b.x) / cell);
      const minZ = Math.floor(Math.min(a.z, b.z) / cell), maxZ = Math.floor(Math.max(a.z, b.z) / cell);
      for (let gx = minX; gx <= maxX; gx++) for (let gz = minZ; gz <= maxZ; gz++) {
        for (const item of grid.get(gx + ":" + gz) || []) {
          if (item.edgeIndex === index) continue;
          const other = edges[item.edgeIndex];
          // A shared OSM node is a junction, never a grade separation.
          if (other.fromNodeId === edge.fromNodeId || other.fromNodeId === edge.toNodeId ||
              other.toNodeId === edge.fromNodeId || other.toNodeId === edge.toNodeId) continue;
          const key = index + ":" + i + ":" + item.edgeIndex + ":" + item.segment;
          if (seen.has(key)) continue;
          seen.add(key);
          const c = other.centerline[item.segment - 1], d = other.centerline[item.segment];
          const hit = segmentIntersection(a, b, c, d);
          if (!hit) continue;
          const otherLayer = parseLayer(other.osm?.layer);
          if (otherLayer >= layer) continue;
          found.push({
            otherIndex: item.edgeIndex,
            s: cumulative[i - 1] + hit.t * (cumulative[i] - cumulative[i - 1]),
            layerOther: otherLayer,
            otherY: c.y + (d.y - c.y) * hit.u
          });
        }
      }
    }
    if (found.length) crossings.set(index, found);
  }
  return crossings;
}

function connectedGroups(edges, candidates) {
  const parent = new Map(candidates.map(index => [index, index]));
  const find = index => { while (parent.get(index) !== index) { parent.set(index, parent.get(parent.get(index))); index = parent.get(index); } return index; };
  const byNode = new Map();
  for (const index of candidates) for (const nodeId of [edges[index].fromNodeId, edges[index].toNodeId]) {
    if (!byNode.has(nodeId)) byNode.set(nodeId, []);
    byNode.get(nodeId).push(index);
  }
  for (const members of byNode.values()) for (let i = 1; i < members.length; i++) parent.set(find(members[i]), find(members[0]));
  const groups = new Map();
  for (const index of candidates) {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(index);
  }
  return [...groups.values()];
}

function interpolatePolyline(points, cumulative, s) {
  const total = cumulative[cumulative.length - 1];
  const clamped = Math.max(0, Math.min(total, s));
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < clamped) i++;
  const span = cumulative[i] - cumulative[i - 1] || 1;
  const t = (clamped - cumulative[i - 1]) / span;
  const a = points[i - 1], b = points[i];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * Returns a new network (inputs are never mutated) plus a report of what was lifted.
 * Pass { enabled: false } to keep the imported flat geometry.
 */
export function applyGradeSeparation(network, options = {}) {
  const config = { ...GRADE_SEPARATION, ...options };
  const emptyReport = { enabled: config.enabled !== false, provenance: config.provenance, structureCount: 0, raisedEdgeCount: 0,
    raisedLengthM: 0, crossingCount: 0, unresolvedCrossings: 0, maxGrade: 0, maxHeightM: 0, crossings: [], raisedEdgeIds: [] };
  if (config.enabled === false || !Array.isArray(network?.edges)) return { network, report: { ...emptyReport, enabled: false } };

  const edges = network.edges;
  const candidates = [];
  edges.forEach((edge, index) => {
    if (isBridge(edge) && parseLayer(edge.osm?.layer) >= 1 && edge.centerline?.length >= 2) candidates.push(index);
  });
  if (!candidates.length) return { network, report: emptyReport };

  const crossings = findCrossings(edges, candidates);
  const raised = new Set();
  const capOf = new Map();          // edge index -> highest allowed height (m)
  const roleOf = new Map();         // edge index -> "structure" | "approach"
  const lengthOf = index => cumulativeLengths(edges[index].centerline).at(-1);
  const incident = new Map();   // node id -> edge indices
  edges.forEach((edge, index) => {
    for (const nodeId of new Set([edge.fromNodeId, edge.toNodeId])) {
      if (!incident.has(nodeId)) incident.set(nodeId, []);
      incident.get(nodeId).push(index);
    }
  });
  let structureCount = 0;
  for (const group of connectedGroups(edges, candidates)) {
    if (!group.some(index => crossings.has(index))) continue; // no proven crossing: stays flat
    structureCount++;
    for (const index of group) {
      raised.add(index);
      capOf.set(index, config.layerStepM * parseLayer(edges[index].osm?.layer));
      roleOf.set(index, "structure");
    }
    // A short span cannot climb to deck height inside its own length. Real flyovers climb on
    // embankment approaches, which OSM maps as separate plain ways. Extend the ramp outward
    // through straight continuations (nodes with exactly two edges) until the grade-limited
    // ramp length is reached. Junction nodes always stop the ramp, so no side road is left
    // meeting a raised node.
    const groupCap = Math.max(...group.map(index => capOf.get(index)));
    const rampNeededM = groupCap / config.maxGrade;
    for (const index of group) for (const startNode of [edges[index].fromNodeId, edges[index].toNodeId]) {
      let node = startNode, previous = index, walkedM = 0;
      for (let step = 0; step < 40 && walkedM < rampNeededM; step++) {
        const around = incident.get(node) || [];
        if (around.length !== 2) break;
        const next = around.find(item => item !== previous);
        if (next === undefined || raised.has(next) || candidates.includes(next)) break;
        raised.add(next); capOf.set(next, groupCap); roleOf.set(next, "approach");
        walkedM += lengthOf(next);
        node = edges[next].fromNodeId === node ? edges[next].toNodeId : edges[next].fromNodeId;
        previous = next;
      }
    }
  }
  if (!raised.size) return { network, report: emptyReport };

  const baseY = new Map();      // node id -> imported height, for nodes touched by an at-grade edge
  const targetOf = index => capOf.get(index);
  const record = (nodeId, y, atGrade) => { if (atGrade) baseY.set(nodeId, y); };
  edges.forEach((edge, index) => {
    const atGrade = !raised.has(index);
    record(edge.fromNodeId, edge.centerline[0].y, atGrade);
    record(edge.toNodeId, edge.centerline.at(-1).y, atGrade);
  });
  // Interior nodes start at their target (minimum over incident lifted edges), grade-limited below.
  const height = new Map(baseY);
  for (const index of raised) {
    for (const nodeId of [edges[index].fromNodeId, edges[index].toNodeId]) {
      if (baseY.has(nodeId)) continue;
      height.set(nodeId, Math.min(height.get(nodeId) ?? Infinity, targetOf(index)));
    }
  }
  const lengths = new Map([...raised].map(index => [index, cumulativeLengths(edges[index].centerline).at(-1)]));
  for (let pass = 0; pass < 500; pass++) {
    let changed = false;
    for (const index of raised) {
      const edge = edges[index], reach = config.maxGrade * lengths.get(index);
      const a = height.get(edge.fromNodeId), b = height.get(edge.toNodeId);
      if (a > b + reach + 1e-6 && !baseY.has(edge.fromNodeId)) { height.set(edge.fromNodeId, b + reach); changed = true; }
      if (b > a + reach + 1e-6 && !baseY.has(edge.toNodeId)) { height.set(edge.toNodeId, a + reach); changed = true; }
    }
    if (!changed) break;
  }

  const newCenterlines = new Map();
  let raisedLengthM = 0, maxHeightM = 0, maxGrade = 0;
  for (const index of raised) {
    const edge = edges[index], points = edge.centerline, cumulative = cumulativeLengths(points), total = cumulative.at(-1);
    if (!(total > EPSILON)) continue;
    const ya = height.get(edge.fromNodeId), yb = height.get(edge.toNodeId), cap = targetOf(index);
    const profile = s => Math.min(cap, ya + config.maxGrade * s, yb + config.maxGrade * (total - s));
    // Profile on a UNIFORM grid so smoothing cannot steepen the grade, then read back at
    // every original vertex plus the grid points. Piecewise-linear reads never exceed the
    // steepest grid slope, which the envelope above already limits to maxGrade.
    const cells = Math.max(1, Math.ceil(total / config.subdivisionM)), step = total / cells;
    const grid = Array.from({ length: cells + 1 }, (_, k) => profile(Math.min(total, k * step)));
    for (let pass = 0; pass < config.smoothingPasses; pass++) {
      const next = grid.slice();
      for (let k = 1; k < cells; k++) next[k] = (grid[k - 1] + 2 * grid[k] + grid[k + 1]) / 4;
      for (let k = 0; k <= cells; k++) grid[k] = next[k];
    }
    grid[0] = ya; grid[cells] = yb;
    const heightAt = s => {
      const position = Math.max(0, Math.min(cells, s / step)), k = Math.min(cells - 1, Math.floor(position));
      return grid[k] + (grid[k + 1] - grid[k]) * (position - k);
    };
    const distances = new Set(cumulative);
    for (let k = 1; k < cells; k++) distances.add(k * step);
    const ordered = [...distances].sort((p, q) => p - q);
    const ys = ordered.map(heightAt);
    const lifted = ordered.map((s, i) => {
      const p = interpolatePolyline(points, cumulative, s);
      return { ...p, y: ys[i] };
    });
    for (let i = 1; i < lifted.length; i++) {
      const run = ordered[i] - ordered[i - 1]; // arc length along the original alignment
      if (run > 0.25) maxGrade = Math.max(maxGrade, Math.abs(lifted[i].y - lifted[i - 1].y) / run); // shorter runs are float noise
    }
    for (const point of lifted) maxHeightM = Math.max(maxHeightM, point.y);
    raisedLengthM += total;
    newCenterlines.set(index, lifted);
  }

  const reportCrossings = [];
  for (const [index, found] of crossings) {
    if (!newCenterlines.has(index)) continue;
    const lifted = newCenterlines.get(index), cumulative = cumulativeLengths(lifted);
    for (const crossing of found) {
      const y = interpolatePolyline(lifted, cumulative, crossing.s).y;
      const clearanceM = y - crossing.otherY;
      reportCrossings.push({ structureEdgeId: edges[index].id, crossedEdgeId: edges[crossing.otherIndex].id,
        clearanceM: Number(clearanceM.toFixed(2)), ok: clearanceM >= config.minCrossingClearanceM });
    }
  }

  const nodes = (network.nodes || []).map(node => {
    const y = height.get(node.id);
    return y !== undefined && node.position && Math.abs((node.position.y ?? 0) - y) > 1e-9
      ? { ...node, position: { ...node.position, y } } : node;
  });
  const newEdges = edges.map((edge, index) => newCenterlines.has(index)
    ? { ...edge, centerline: newCenterlines.get(index),
        elevation: { provenance: config.provenance, verified: false, role: roleOf.get(index), layer: parseLayer(edge.osm?.layer), maxGrade: config.maxGrade } }
    : edge);
  return {
    network: { ...network, nodes, edges: newEdges },
    report: {
      enabled: true, provenance: config.provenance, structureCount, raisedEdgeCount: newCenterlines.size,
      raisedLengthM: Number(raisedLengthM.toFixed(1)), crossingCount: reportCrossings.length,
      unresolvedCrossings: reportCrossings.filter(item => !item.ok).length,
      maxGrade: Number(maxGrade.toFixed(4)), maxHeightM: Number(maxHeightM.toFixed(2)),
      crossings: reportCrossings, raisedEdgeIds: [...newCenterlines.keys()].map(index => edges[index].id)
    }
  };
}
