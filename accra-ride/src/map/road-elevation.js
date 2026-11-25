/**
 * Applies a versioned DEM elevation profile to the selected OSM road graph.
 * Elevations are stored as metres above a local base to keep Three.js world
 * coordinates small. Missing nodes remain at their imported height.
 */
const finite = value => typeof value === "number" && Number.isFinite(value);

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
  const baseElevationM = finite(profile.baseElevationM) ? profile.baseElevationM : Math.min(...sourceHeights);
  const localY = new Map(entries.map(([id, value]) => [id, value - baseElevationM]));
  let appliedNodes = 0, appliedEdges = 0, minGrade = Infinity, maxGrade = -Infinity, ascentM = 0, descentM = 0;

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
    minGrade = Math.min(minGrade, grade);
    maxGrade = Math.max(maxGrade, grade);
    ascentM += Math.max(0, toY - fromY);
    descentM += Math.max(0, fromY - toY);
    edge.elevation = { source: profile.source?.dataset ?? "DEM", verified: true, grade, ascentM: Math.max(0, toY - fromY), descentM: Math.max(0, fromY - toY) };
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
    maxGrade: maxGrade === -Infinity ? 0 : maxGrade
  };
}
