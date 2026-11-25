/**
 * Applies a versioned DEM elevation profile to the selected OSM road graph.
 * Elevations are stored as metres above a local base to keep Three.js world
 * coordinates small. Missing nodes remain at their imported height.
 */
const finite = value => typeof value === "number" && Number.isFinite(value);
const gradeLimitFor = edge => ({
  motorway: 0.06, motorway_link: 0.06, trunk: 0.06, trunk_link: 0.06,
  primary: 0.07, primary_link: 0.07, secondary: 0.08, secondary_link: 0.08,
  tertiary: 0.09, tertiary_link: 0.09, residential: 0.10, unclassified: 0.10, service: 0.08
}[edge.osm?.highway] ?? 0.08);

function polylineLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return length;
}

function constrainNodeGrades(edges, nodeHeights) {
  const adjusted = new Map(nodeHeights);
  for (let iteration = 0; iteration < 24; iteration++) {
    const corrections = new Map();
    for (const edge of edges) {
      const from = adjusted.get(edge.fromNodeId), to = adjusted.get(edge.toNodeId);
      if (!finite(from) || !finite(to)) continue;
      const length = polylineLength(edge.centerline || []);
      if (!(length > 0)) continue;
      const delta = to - from, allowed = gradeLimitFor(edge) * length;
      if (Math.abs(delta) <= allowed + 0.001) continue;
      const sign = Math.sign(delta), correction = (Math.abs(delta) - allowed) * 0.5;
      for (const [id, value] of [[edge.fromNodeId, sign * correction], [edge.toNodeId, -sign * correction]]) {
        const item = corrections.get(id) || { sum: 0, count: 0 };
        item.sum += value; item.count++;
        corrections.set(id, item);
      }
    }
    if (!corrections.size) break;
    for (const [id, item] of corrections) adjusted.set(id, adjusted.get(id) + item.sum / item.count);
  }
  return adjusted;
}

export function applyRoadElevationProfile(network, profile) {
  if (!network || !Array.isArray(network.nodes) || !Array.isArray(network.edges)) {
    throw new Error("A road network is required for elevation application");
  }
  if (profile?.schemaVersion !== 1 || !profile.elevations || typeof profile.elevations !== "object") {
    throw new Error("A supported DEM elevation profile is required");
  }
  const entries = Object.entries(profile.elevations).filter(([, value]) => finite(value));
  if (!entries.length) throw new Error("The DEM elevation profile contains no valid node samples");
  const sourceHeights = entries.map(([, value]) => value);
  const rawBaseElevationM = finite(profile.baseElevationM) ? profile.baseElevationM : Math.min(...sourceHeights);
  const rawLocalY = new Map(entries.map(([id, value]) => [id, value - rawBaseElevationM]));
  const constrained = constrainNodeGrades(network.edges, rawLocalY);
  const constrainedMin = Math.min(...constrained.values());
  const baseElevationM = rawBaseElevationM + constrainedMin;
  const localY = new Map([...constrained].map(([id, value]) => [id, value - constrainedMin]));
  let appliedNodes = 0, appliedEdges = 0, minGrade = Infinity, maxGrade = -Infinity, ascentM = 0, descentM = 0, gradeLimitExceededEdges = 0;

  for (const node of network.nodes) {
    const y = localY.get(node.id);
    if (!finite(y)) continue;
    node.position.y = y;
    appliedNodes++;
  }

  for (const edge of network.edges) {
    const fromY = localY.get(edge.fromNodeId), toY = localY.get(edge.toNodeId);
    if (!finite(fromY) || !finite(toY) || !Array.isArray(edge.centerline) || edge.centerline.length < 2) continue;
    const points = edge.centerline;
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
    }
    const lengthM = cumulative.at(-1);
    if (!(lengthM > 0)) continue;
    for (let i = 0; i < points.length; i++) {
      const t = cumulative[i] / lengthM;
      points[i].y = fromY + (toY - fromY) * t;
    }
    const grade = (toY - fromY) / lengthM;
    const gradeLimit = gradeLimitFor(edge);
    if (Math.abs(grade) > gradeLimit + 0.005) gradeLimitExceededEdges++;
    minGrade = Math.min(minGrade, grade);
    maxGrade = Math.max(maxGrade, grade);
    ascentM += Math.max(0, toY - fromY);
    descentM += Math.max(0, fromY - toY);
    edge.elevation = { source: profile.source?.dataset ?? "DEM", verified: true, grade, gradeLimit, ascentM: Math.max(0, toY - fromY), descentM: Math.max(0, fromY - toY) };
    appliedEdges++;
  }
  return {
    available: true,
    source: profile.source ?? null,
    baseElevationM,
    appliedNodes,
    appliedEdges,
    ascentM,
    descentM,
    minGrade: minGrade === Infinity ? 0 : minGrade,
    maxGrade: maxGrade === -Infinity ? 0 : maxGrade,
    gradeLimitExceededEdges
  };
}
