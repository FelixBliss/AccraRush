/**
 * RD-02 conservative physical-road corridor grouping.
 *
 * Only pairs independently mapped as one-way carriageways are grouped.
 * Name/ref, highway class, bridge/tunnel/layer, geometric proximity,
 * longitudinal overlap and opposing legal flow must all agree.
 * Uncertain ways remain separate rather than being guessed together.
 */
const R = 6371008.8;
const rad = Math.PI / 180;
const oneWayDirection = tags => {
  const value = String(tags?.oneway ?? "").toLowerCase();
  if (value === "-1") return -1;
  if (["yes", "1", "true"].includes(value) || String(tags?.junction ?? "").toLowerCase() === "roundabout") return 1;
  return 0;
};
const pointXY = (p, lat0, lon0) => ({
  x: R * (p.lon - lon0) * rad * Math.cos(lat0 * rad),
  y: R * (p.lat - lat0) * rad
});
const vector = way => {
  const points = way.geometry || [];
  if (points.length < 2) return null;
  const a = points[0], b = points[points.length - 1];
  const lat0 = (a.lat + b.lat) / 2;
  const dx = R * (b.lon - a.lon) * rad * Math.cos(lat0 * rad);
  const dy = R * (b.lat - a.lat) * rad;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;
  const sign = oneWayDirection(way.tags) || 1;
  return { x: dx / length * sign, y: dy / length * sign };
};
const bounds = way => {
  const points = way.geometry || [];
  return points.reduce((b, p) => ({
    minLat: Math.min(b.minLat, p.lat), maxLat: Math.max(b.maxLat, p.lat),
    minLon: Math.min(b.minLon, p.lon), maxLon: Math.max(b.maxLon, p.lon)
  }), { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity });
};
const bboxGapM = (a, b) => {
  const lat0 = (a.minLat + a.maxLat + b.minLat + b.maxLat) / 4;
  const dx = Math.max(0, a.minLon - b.maxLon, b.minLon - a.maxLon) * R * rad * Math.cos(lat0 * rad);
  const dy = Math.max(0, a.minLat - b.maxLat, b.minLat - a.maxLat) * R * rad;
  return Math.hypot(dx, dy);
};
function sample(points, maxSamples = 80) {
  if (points.length <= maxSamples) return points;
  const result = [];
  for (let i = 0; i < maxSamples; i++) result.push(points[Math.round(i * (points.length - 1) / (maxSamples - 1))]);
  return result;
}
function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy) / length2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function directedOverlap(samples, segments, origin) {
  const projected = segments.map(p => pointXY(p, origin.lat, origin.lon));
  let matched = 0, sum = 0;
  for (const point of samples) {
    const p = pointXY(point, origin.lat, origin.lon);
    let nearest = Infinity;
    for (let i = 1; i < projected.length; i++) nearest = Math.min(nearest, pointSegmentDistance(p, projected[i-1], projected[i]));
    if (nearest >= 4 && nearest <= 45) { matched++; sum += nearest; }
  }
  return { ratio: samples.length ? matched / samples.length : 0, mean: matched ? sum / matched : Infinity };
}
function compatible(a, b) {
  const ta = a.tags || {}, tb = b.tags || {};
  if (!oneWayDirection(ta) || !oneWayDirection(tb)) return false;
  if (ta.highway !== tb.highway) return false;
  const sameRef = ta.ref && tb.ref && String(ta.ref).trim().toLowerCase() === String(tb.ref).trim().toLowerCase();
  const sameName = ta.name && tb.name && String(ta.name).trim().toLowerCase() === String(tb.name).trim().toLowerCase();
  if (!sameRef && !sameName) return false;
  for (const key of ["bridge", "tunnel", "layer"]) {
    const av = String(ta[key] ?? (key === "layer" ? "0" : "no"));
    const bv = String(tb[key] ?? (key === "layer" ? "0" : "no"));
    if (av !== bv) return false;
  }
  const va = vector(a), vb = vector(b);
  if (!va || !vb || va.x * vb.x + va.y * vb.y > -0.5) return false;
  return true;
}
function pairEvidence(a, b) {
  if (!compatible(a, b)) return null;
  const ba = bounds(a), bb = bounds(b);
  if (bboxGapM(ba, bb) > 45) return null;
  const origin = { lat: (ba.minLat + ba.maxLat + bb.minLat + bb.maxLat) / 4,
    lon: (ba.minLon + ba.maxLon + bb.minLon + bb.maxLon) / 4 };
  const ab = directedOverlap(sample(a.geometry), b.geometry, origin);
  const baResult = directedOverlap(sample(b.geometry), a.geometry, origin);
  if (ab.ratio < 0.7 || baResult.ratio < 0.7) return null;
  const meanDistanceM = (ab.mean + baResult.mean) / 2;
  if (!(meanDistanceM >= 4 && meanDistanceM <= 45)) return null;
  return { meanDistanceM, overlapRatio: Math.min(ab.ratio, baResult.ratio) };
}

/**
 * Returns Map<sourceWayId, {physicalRoadId, carriagewayId, pairedWayIds, groupingSource}>.
 * Greedy pairing is deterministic and each OSM way can join at most one corridor.
 */
export function groupPhysicalRoadWays(ways) {
  const sorted = [...ways].sort((a, b) => String(a.osmWayId ?? a.id).localeCompare(String(b.osmWayId ?? b.id)));
  const candidates = [];
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    const a = sorted[i], b = sorted[j];
    const evidence = pairEvidence(a, b);
    if (evidence) candidates.push({ a, b, evidence, score: evidence.overlapRatio - evidence.meanDistanceM / 1000 });
  }
  candidates.sort((a, b) => b.score - a.score ||
    String(a.a.osmWayId ?? a.a.id).localeCompare(String(b.a.osmWayId ?? b.a.id)) ||
    String(a.b.osmWayId ?? a.b.id).localeCompare(String(b.b.osmWayId ?? b.b.id)));
  const assigned = new Map();
  for (const candidate of candidates) {
    const aId = String(candidate.a.osmWayId ?? candidate.a.id);
    const bId = String(candidate.b.osmWayId ?? candidate.b.id);
    if (assigned.has(aId) || assigned.has(bId)) continue;
    const ids = [aId, bId].sort();
    const physicalRoadId = "osm-corridor-" + ids.join("-");
    const evidence = { ...candidate.evidence, pairedWayIds: ids };
    assigned.set(aId, { physicalRoadId, evidence, pairedWayIds: ids });
    assigned.set(bId, { physicalRoadId, evidence, pairedWayIds: ids });
  }
  const result = new Map();
  for (const way of sorted) {
    const id = String(way.osmWayId ?? way.id);
    const pair = assigned.get(id);
    result.set(id, {
      physicalRoadId: pair?.physicalRoadId ?? "osm-road-" + id,
      carriagewayId: "osm-carriageway-" + id,
      pairedWayIds: pair?.pairedWayIds ?? [id],
      groupingSource: pair ? "osm:paired-oneway-carriageways" : "osm:single-way",
      groupingEvidence: pair?.evidence ?? null
    });
  }
  return result;
}
