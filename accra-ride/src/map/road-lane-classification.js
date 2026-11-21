/**
 * RD-02 OSM lane interpretation.
 * Keeps source-tagged values distinct from conservative gameplay fallbacks.
 */
const MAJOR = new Set(["motorway","trunk","primary","secondary"]);
const INTEGER = value => {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(n) && n > 0 && String(n) === String(value).trim() ? n : null;
};
const truthyOneWay = value => ["yes","1","true"].includes(String(value ?? "").toLowerCase());
const parseWidthM = value => {
  if (value == null) return null;
  const text = String(value).trim().toLowerCase();
  const n = Number.parseFloat(text.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/\b(ft|feet|foot)\b|['′]/.test(text)) return n * 0.3048;
  return n;
};

export function classifyOsmLanes(tags = {}) {
  const highway = String(tags.highway ?? "unclassified");
  const oneWayReverse = String(tags.oneway ?? "").toLowerCase() === "-1";
  const roundabout = String(tags.junction ?? "").toLowerCase() === "roundabout";
  const oneWay = oneWayReverse || truthyOneWay(tags.oneway) || roundabout;
  const direction = oneWayReverse ? "reverse" : "forward";
  const fallbackTotal = MAJOR.has(highway) ? 4 : 2;
  const fallbackPerDirection = fallbackTotal / 2;
  const totalTagged = INTEGER(tags.lanes);
  const forwardTagged = INTEGER(tags["lanes:forward"]);
  const backwardTagged = INTEGER(tags["lanes:backward"]);
  const warnings = [];
  let forward = 0, reverse = 0, shared = 0, layoutSource = "inferred:highway-class", confidence = "inferred";

  if (oneWay) {
    const explicitDirectional = direction === "forward" ? forwardTagged : backwardTagged;
    const oppositeDirectional = direction === "forward" ? backwardTagged : forwardTagged;
    const count = explicitDirectional ?? totalTagged ?? fallbackTotal;
    if (oppositeDirectional != null && oppositeDirectional > 0) warnings.push("opposite-direction lane tag conflicts with one-way semantics");
    if (forwardTagged != null || backwardTagged != null || totalTagged != null) {
      layoutSource = explicitDirectional != null ? "osm:directional-lanes" : "osm:lanes";
      confidence = "tagged";
    }
    if (direction === "forward") forward = count; else reverse = count;
  } else if (forwardTagged != null && backwardTagged != null) {
    forward = forwardTagged; reverse = backwardTagged;
    layoutSource = "osm:lanes:forward+backward"; confidence = "tagged";
  } else if (totalTagged != null) {
    if (forwardTagged != null) { forward = forwardTagged; reverse = Math.max(0, totalTagged - forward); }
    else if (backwardTagged != null) { reverse = backwardTagged; forward = Math.max(0, totalTagged - backwardTagged); }
    else if (totalTagged === 1) { shared = 1; }
    else { forward = Math.ceil(totalTagged / 2); reverse = Math.floor(totalTagged / 2); }
    layoutSource = forwardTagged != null || backwardTagged != null ? "osm:lanes+directional" :
      totalTagged === 1 ? "osm:lanes+shared-bidirectional" : "osm:lanes+inferred:direction-split";
    confidence = totalTagged === 1 && forwardTagged == null && backwardTagged == null ? "tagged" : "mixed";
  } else if (forwardTagged != null || backwardTagged != null) {
    forward = forwardTagged ?? fallbackPerDirection;
    reverse = backwardTagged ?? fallbackPerDirection;
    layoutSource = "mixed:directional-tag+class-fallback"; confidence = "mixed";
  } else {
    forward = fallbackPerDirection; reverse = fallbackPerDirection;
  }

  if (!oneWay && forward + reverse === 0) warnings.push("no usable directional lanes");
  if (totalTagged != null && forwardTagged != null && backwardTagged != null && totalTagged !== forwardTagged + backwardTagged)
    warnings.push("lanes total disagrees with lanes:forward plus lanes:backward");
  if (oneWay && totalTagged != null && (forward + reverse) !== totalTagged)
    warnings.push("one-way directional lane count differs from lanes total");

  const laneCount = forward + reverse + shared;
  const taggedWidthM = parseWidthM(tags.width);
  const widthSource = taggedWidthM == null ? "inferred:default-lane-width" : "osm:width";
  const laneWidthM = taggedWidthM != null && laneCount > 0 ? taggedWidthM / laneCount : 3.5;
  const lanes = [
    ...Array.from({length: forward}, (_, i) => ({direction:"forward", index:i+1, widthM:laneWidthM})),
    ...Array.from({length: reverse}, (_, i) => ({direction:"reverse", index:i+1, widthM:laneWidthM})),
    ...Array.from({length: shared}, (_, i) => ({direction:"both", index:i+1, widthM:laneWidthM}))
  ];
  return {
    lanes, forwardLaneCount:forward, reverseLaneCount:reverse, sharedLaneCount:shared, totalLaneCount:laneCount,
    oneWay, oneWayDirection:oneWay ? direction : null,
    layoutSource, confidence, widthSource, carriagewayWidthM:taggedWidthM,
    laneWidthM, warnings
  };
}
