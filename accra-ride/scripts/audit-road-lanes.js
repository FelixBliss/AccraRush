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
  const corridorMembers = new Map(), corridorSources = {}, corridorSamples = new Map(), corridorRepresentatives = new Map();
  let warningCount = 0, taggedWidthEdges = 0, taggedLaneEdges = 0, inferredLaneEdges = 0;
  for (const edge of edges) {
    const model = edge.roadModel;
    const lanes = Array.isArray(edge.lanes) ? edge.lanes : [];
    if (!model) { errors.push(edge.id + ": missing roadModel"); continue; }
    const sourceWayId = String(edge.osm?.wayId ?? "");
    if (model.carriagewayId !== "osm-carriageway-" + sourceWayId || model.sourceWayId !== sourceWayId)
      errors.push(edge.id + ": unstable carriageway identity");
    if (model.groupingSource === "osm:paired-oneway-carriageways") {
      const paired = Array.isArray(model.pairedWayIds) ? [...model.pairedWayIds].map(String).sort() : [];
      const expectedId = paired.length === 2 ? "osm-corridor-" + paired.join("-") : "";
      if (paired.length !== 2 || !paired.includes(sourceWayId) || model.physicalRoadId !== expectedId)
        errors.push(edge.id + ": invalid paired-corridor identity");
      const evidence = model.groupingEvidence;
      if (!evidence || !(evidence.meanDistanceM >= 4 && evidence.meanDistanceM <= 45 && evidence.overlapRatio >= 0.7))
        errors.push(edge.id + ": paired corridor lacks geometric evidence");
      if (!corridorMembers.has(model.physicalRoadId)) corridorMembers.set(model.physicalRoadId, new Set());
      corridorMembers.get(model.physicalRoadId).add(sourceWayId);
      const currentRepresentative = corridorRepresentatives.get(model.physicalRoadId)?.get(sourceWayId);
      if (!corridorRepresentatives.has(model.physicalRoadId)) corridorRepresentatives.set(model.physicalRoadId, new Map());
      if (!currentRepresentative || (edge.lengthM ?? 0) > (currentRepresentative.lengthM ?? 0)) corridorRepresentatives.get(model.physicalRoadId).set(sourceWayId, edge);
      if (!corridorSamples.has(model.physicalRoadId)) corridorSamples.set(model.physicalRoadId, {
        physicalRoadId: model.physicalRoadId, pairedWayIds: paired,
        name: edge.osm?.name ?? null, ref: edge.osm?.ref ?? null, highway: edge.osm?.highway ?? null,
        meanDistanceM: evidence?.meanDistanceM ?? null, overlapRatio: evidence?.overlapRatio ?? null
      });
    } else if (model.groupingSource === "osm:single-way") {
      if (model.physicalRoadId !== "osm-road-" + sourceWayId || JSON.stringify(model.pairedWayIds) !== JSON.stringify([sourceWayId]) || model.groupingEvidence != null)
        errors.push(edge.id + ": invalid single-way identity");
    } else errors.push(edge.id + ": missing or unknown physical-road grouping provenance");
    corridorSources[model.groupingSource] = (corridorSources[model.groupingSource] || 0) + 1;
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
  const pairedCorridorsWithBothCarriageways = [...corridorMembers.values()].filter(wayIds => wayIds.size === 2).length;
  for (const [corridorId, representatives] of corridorRepresentatives) {
    if (representatives.size !== 2) continue;
    const [a, b] = [...representatives.values()];
    const ta = a.osm || {}, tb = b.osm || {};
    const sameName = ta.name && tb.name && String(ta.name).trim().toLowerCase() === String(tb.name).trim().toLowerCase();
    const sameRef = ta.ref && tb.ref && String(ta.ref).trim().toLowerCase() === String(tb.ref).trim().toLowerCase();
    if (ta.highway !== tb.highway || (!sameName && !sameRef))
      errors.push(corridorId + ": represented carriageways disagree on road class/name/ref");
    for (const key of ["bridge", "tunnel", "layer"]) {
      const av = String(ta[key] ?? (key === "layer" ? "0" : "no"));
      const bv = String(tb[key] ?? (key === "layer" ? "0" : "no"));
      if (av !== bv) errors.push(corridorId + ": represented carriageways disagree on " + key);
    }
    const direction = edge => {
      const points = edge.centerline || [];
      if (points.length < 2) return null;
      const mid = Math.floor(points.length / 2);
      const p = points[Math.max(0, mid - 1)], q = points[Math.min(points.length - 1, mid + 1)];
      const dx = q.x - p.x, dz = q.z - p.z, length = Math.hypot(dx, dz);
      if (!length) return null;
      const sign = String(edge.osm?.oneway ?? "").toLowerCase() === "-1" ? -1 : 1;
      return { x: dx / length * sign, z: dz / length * sign };
    };
    const va = direction(a), vb = direction(b);
    if (!va || !vb || va.x * vb.x + va.z * vb.z > -0.5)
      errors.push(corridorId + ": represented carriageways do not have opposing legal flow vectors");
  }
  const partialPairedCorridors = [...corridorMembers.values()].filter(wayIds => wayIds.size === 1).length;
  for (const [corridorId, wayIds] of corridorMembers) {
    if (wayIds.size > 2) errors.push(corridorId + ": corridor contains more than two represented OSM ways");
  }
  return {
    status: errors.length ? "failed" : "passed", errors,
    metrics: {
      edges: edges.length, uniqueLaneIds: seenLaneIds.size, physicalRoads: physicalRoadIds.size,
      carriageways: carriagewayIds.size, corridorGroupingSourceCounts: corridorSources,
      pairedCorridors: corridorMembers.size, pairedCorridorsWithBothCarriageways, partialPairedCorridors,
      pairedCorridorSamples: [...corridorSamples.values()].slice(0, 20),
      directionalLaneTotals: totals,
      laneLayoutSourceCounts: layoutSources, laneConfidenceCounts: confidence, widthSourceCounts: widthSources,
      taggedLaneEdges, inferredLaneEdges, taggedWidthEdges, classificationWarningCount: warningCount
    }
  };
}

for (const id of AREAS) {
  try {
    const networkFile = id === "lapaz" ? "lapaz-routing.network.json" : id + ".network.json";
    const document = JSON.parse(await readFile(ROOT + "/" + networkFile, "utf8"));
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
