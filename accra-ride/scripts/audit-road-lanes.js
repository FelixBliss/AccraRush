#!/usr/bin/env node
/**
 * Independent RD-02 audit. Does not import the production lane classifier.
 */
import { readFile, writeFile } from "node:fs/promises";

const ROOT = "accra-ride/data/osm";
const AREAS = ["accra-central", "lapaz"];
const report = { validator: "independent-rd-02-lane-audit", generatedAt: new Date().toISOString(), areas: {} };

function audit(id, document) {
  const errors = [];
  const edges = document?.network?.edges;
  if (!Array.isArray(edges) || !edges.length) return { status: "failed", errors: ["network edges are missing or empty"] };
  const layoutSources = {}, confidence = {}, widthSources = {};
  const totals = { forward: 0, reverse: 0, shared: 0, total: 0 };
  const seenLaneIds = new Set(), physicalRoadIds = new Set(), carriagewayIds = new Set();
  let warningCount = 0, taggedWidthEdges = 0, taggedLaneEdges = 0, inferredLaneEdges = 0;
  for (const edge of edges) {
    const model = edge.roadModel;
    const lanes = Array.isArray(edge.lanes) ? edge.lanes : [];
    if (!model) { errors.push(edge.id + ": missing roadModel"); continue; }
    const sourceWayId = String(edge.osm?.wayId ?? "");
    if (model.physicalRoadId !== "osm-road-" + sourceWayId || model.carriagewayId !== "osm-carriageway-" + sourceWayId || model.sourceWayId !== sourceWayId)
      errors.push(edge.id + ": unstable physical-road/carriageway identity");
    const expectedCarriagewayDirection = model.oneWay ? model.oneWayDirection : "bidirectional";
    if (model.carriagewayDirection !== expectedCarriagewayDirection)
      errors.push(edge.id + ": carriageway direction disagrees with legal lane directions");
    physicalRoadIds.add(model.physicalRoadId); carriagewayIds.add(model.carriagewayId);
    if (!["tagged", "mixed", "inferred"].includes(model.laneLayoutConfidence)) errors.push(edge.id + ": invalid lane confidence");
    if (typeof model.laneLayoutSource !== "string" || !model.laneLayoutSource) errors.push(edge.id + ": missing lane source");
    if (!["osm:width", "inferred:default-lane-width"].includes(model.widthSource)) errors.push(edge.id + ": invalid width source");
    layoutSources[model.laneLayoutSource] = (layoutSources[model.laneLayoutSource] || 0) + 1;
    confidence[model.laneLayoutConfidence] = (confidence[model.laneLayoutConfidence] || 0) + 1;
    widthSources[model.widthSource] = (widthSources[model.widthSource] || 0) + 1;
    warningCount += model.classificationWarnings?.length || 0;
    if (model.laneLayoutConfidence === "inferred") inferredLaneEdges++;
    if (edge.osm?.lanes != null || edge.osm?.lanesForward != null || edge.osm?.lanesBackward != null) taggedLaneEdges++;
    if (model.widthSource === "osm:width") taggedWidthEdges++;
    const forward = lanes.filter(lane => lane.direction === "forward").length;
    const reverse = lanes.filter(lane => lane.direction === "reverse").length;
    const shared = lanes.filter(lane => lane.direction === "both").length;
    if (!lanes.length) errors.push(edge.id + ": no lanes");
    if (model.totalLaneCount !== lanes.length || model.forwardLaneCount !== forward ||
        model.reverseLaneCount !== reverse || model.sharedLaneCount !== shared)
      errors.push(edge.id + ": lane records disagree with classified directional/shared counts");
    if (model.totalLaneCount !== forward + reverse + shared) errors.push(edge.id + ": total lane count does not reconcile");
    if (model.oneWay && lanes.some(lane => lane.direction !== model.oneWayDirection))
      errors.push(edge.id + ": one-way road contains an opposing/shared lane");
    if (!model.oneWay && model.oneWayDirection !== null) errors.push(edge.id + ": two-way road has a one-way direction");
    totals.forward += forward; totals.reverse += reverse; totals.shared += shared; totals.total += lanes.length;
    for (const lane of lanes) {
      if (!lane.id || seenLaneIds.has(lane.id)) errors.push(edge.id + ": missing or duplicate lane ID");
      seenLaneIds.add(lane.id);
      if (!["forward", "reverse", "both"].includes(lane.direction)) errors.push(edge.id + ": invalid lane direction");
      if (!(Number.isFinite(lane.widthM) && lane.widthM > 0 && lane.widthM <= 30)) errors.push(edge.id + ": invalid lane width");
    }
    if (model.widthSource === "osm:width") {
      if (!(Number.isFinite(model.carriagewayWidthM) && model.carriagewayWidthM > 0)) errors.push(edge.id + ": tagged width missing");
      else if (Math.abs(model.laneWidthM * model.totalLaneCount - model.carriagewayWidthM) > 0.05)
        errors.push(edge.id + ": tagged width does not reconcile with lane widths");
    }
    const oneway = String(edge.osm?.oneway ?? "").toLowerCase();
    const explicitTwoWay = ["no", "0", "false"].includes(oneway);
    const expectedOneWay = !explicitTwoWay && (["yes", "1", "true", "-1"].includes(oneway) || edge.osm?.junction === "roundabout");
    if (expectedOneWay !== Boolean(model.oneWay)) errors.push(edge.id + ": OSM one-way tags disagree with roadModel");
    if (oneway === "-1" && model.oneWayDirection !== "reverse") errors.push(edge.id + ": reverse-only direction was lost");
  }
  return {
    status: errors.length ? "failed" : "passed", errors,
    metrics: {
      edges: edges.length, uniqueLaneIds: seenLaneIds.size, physicalRoads: physicalRoadIds.size,
      carriageways: carriagewayIds.size, directionalLaneTotals: totals,
      laneLayoutSourceCounts: layoutSources, laneConfidenceCounts: confidence, widthSourceCounts: widthSources,
      taggedLaneEdges, inferredLaneEdges, taggedWidthEdges, classificationWarningCount: warningCount
    }
  };
}

for (const id of AREAS) {
  try {
    const document = JSON.parse(await readFile(ROOT + "/" + id + ".network.json", "utf8"));
    const result = audit(id, document);
    const lanes = document.network.edges.flatMap(edge => edge.lanes || []);
    result.metrics.directionalLaneTotals = {
      forward: lanes.filter(lane => lane.direction === "forward").length,
      reverse: lanes.filter(lane => lane.direction === "reverse").length,
      shared: lanes.filter(lane => lane.direction === "both").length,
      total: lanes.length
    };
    report.areas[id] = result;
  } catch (error) {
    report.areas[id] = { status: "failed", errors: [error.message] };
  }
}
report.status = AREAS.every(id => report.areas[id]?.status === "passed") ? "passed" : "failed";
report.completedAt = new Date().toISOString();
await writeFile(ROOT + "/lane-architecture-report.json", JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (report.status !== "passed") process.exitCode = 1;
