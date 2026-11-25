#!/usr/bin/env node
/**
 * Produce an auditable road-section inventory for the approved Lapaz–Madina route.
 * Sections are split only where the source OSM road name/highway class changes.
 * Geometry, lane layout and infrastructure are copied from OSM-derived inputs.
 */
import { readFile, writeFile } from "node:fs/promises";
import { selectRoadFeatures } from "../src/map/road-features.js";

const DIR = "accra-ride/data/osm";
const sourceDoc = JSON.parse(await readFile(DIR + "/lapaz-routing.network.json", "utf8"));
const route = JSON.parse(await readFile(DIR + "/lapaz-madina-route.json", "utf8"));
const graphDoc = JSON.parse(await readFile(DIR + "/lapaz.network.json", "utf8"));
const source = sourceDoc.network;
const graph = graphDoc.network;
const edgeById = new Map(source.edges.map(edge => [edge.id, edge]));
const nodeById = new Map(source.nodes.map(node => [node.id, node]));
const degreeByNode = new Map();
for (const edge of source.edges) { degreeByNode.set(edge.fromNodeId, (degreeByNode.get(edge.fromNodeId) || 0) + 1); degreeByNode.set(edge.toNodeId, (degreeByNode.get(edge.toNodeId) || 0) + 1); }
const graphEdgeIds = new Set(graph.edges.map(edge => edge.id));
const featuresDoc = JSON.parse(await readFile(DIR + "/lapaz.features.json", "utf8"));
const matchedFeatures = selectRoadFeatures(featuresDoc, graph);
const connectorEdgesByZone = new Map();
for (const edge of graph.edges.filter(edge => edge.selection?.role === "connector")) {
  const zoneId = edge.selection.zoneId || "unnamed-zone";
  if (!connectorEdgesByZone.has(zoneId)) connectorEdgesByZone.set(zoneId, []);
  connectorEdgesByZone.get(zoneId).push(edge);
}
const featuresByEdge = new Map();
for (const feature of matchedFeatures) {
  if (!featuresByEdge.has(feature.edgeId)) featuresByEdge.set(feature.edgeId, []);
  featuresByEdge.get(feature.edgeId).push(feature);
}
const medianTagKeys = ["median", "divider", "separation", "dual_carriageway"];
const pairedWidths = new Map();
for (const edge of graph.edges) {
  const model = edge.roadModel;
  if (model?.groupingSource !== "osm:paired-oneway-carriageways" || !model.physicalRoadId) continue;
  if (!pairedWidths.has(model.physicalRoadId)) pairedWidths.set(model.physicalRoadId, new Map());
  pairedWidths.get(model.physicalRoadId).set(model.carriagewayId, model.carriagewayWidthM || (edge.lanes || []).reduce((sum, lane) => sum + lane.widthM, 0));
}
const medianWidthByPhysicalRoad = new Map();
const carriagewaysByPhysicalRoad = new Map();
for (const edge of graph.edges) {
  const model = edge.roadModel;
  if (model?.groupingSource !== "osm:paired-oneway-carriageways" || !model.physicalRoadId || !model.carriagewayId) continue;
  if (!carriagewaysByPhysicalRoad.has(model.physicalRoadId)) carriagewaysByPhysicalRoad.set(model.physicalRoadId, new Map());
  const map = carriagewaysByPhysicalRoad.get(model.physicalRoadId);
  if (!map.has(model.carriagewayId)) map.set(model.carriagewayId, []);
  map.get(model.carriagewayId).push(edge);
}
for (const edge of graph.edges) {
  const model = edge.roadModel;
  if (model?.groupingSource !== "osm:paired-oneway-carriageways" || !model.physicalRoadId) continue;
  const widths = [...(pairedWidths.get(model.physicalRoadId)?.values() || [])];
  const separation = model.groupingEvidence?.meanDistanceM;
  if (widths.length === 2 && Number.isFinite(separation)) {
    const medianWidth = separation - (widths[0] + widths[1]) / 2;
    if (medianWidth >= 0.8 && medianWidth <= 12) medianWidthByPhysicalRoad.set(model.physicalRoadId, medianWidth);
  }
}
const sections = [];
let current = null;
let previousTo = null;
let totalDistanceM = 0;
const roadKey = edge => (edge.osm?.name || "Unnamed " + (edge.osm?.highway || "road")) + "|" + (edge.osm?.highway || "unknown");
const coord = nodeId => {
  const node = nodeById.get(nodeId);
  return node?.osm ? { lat: node.osm.lat, lon: node.osm.lon } : null;
};
for (let i = 0; i < route.steps.length; i++) {
  const step = route.steps[i], edge = edgeById.get(step.edgeId);
  if (!edge) throw new Error("Route references missing OSM source edge " + step.edgeId);
  if (!graphEdgeIds.has(step.edgeId)) throw new Error("Route edge is absent from the playable corridor graph: " + step.edgeId);
  if (step.fromNodeId !== edge.fromNodeId && step.fromNodeId !== edge.toNodeId) throw new Error("Route starts outside source edge " + step.edgeId);
  if (previousTo && previousTo !== step.fromNodeId) throw new Error("Disconnected outbound corridor before step " + i);
  previousTo = step.toNodeId;
  totalDistanceM += edge.lengthM;
  const key = roadKey(edge);
  if (!current || current.key !== key) {
    current = {
      id: "section-" + String(sections.length + 1).padStart(2, "0"),
      key, name: edge.osm?.name || "Unnamed " + edge.osm?.highway,
      highway: edge.osm?.highway || "unknown",
      firstStep: i, lastStep: i, edgeIds: [], osmWayIds: new Set(),
      startNodeId: step.fromNodeId, endNodeId: step.toNodeId,
      distanceM: 0, laneLayouts: {}, oneWayEdges: 0, bridgeEdges: 0, tunnelEdges: 0,
      medianTagEdges: 0, pairedCarriagewayEdges: 0, pairedMedianEvidenceEdges: 0, pairedWayIds: new Set(), junctionNodes: new Set(), featureCounts: {},
      widthSources: {}, laneConfidence: {}, roadRefs: {}, surfaces: {}, speedLimits: {}, layerValues: {}, sidewalkTags: {}, cyclewayTags: {}, physicalRoadIds: new Set(), carriagewayIds: new Set()
    };
    sections.push(current);
  }
  current.lastStep = i;
  current.edgeIds.push(edge.id);
  if (edge.roadModel?.physicalRoadId) current.physicalRoadIds.add(edge.roadModel.physicalRoadId);
  if (edge.roadModel?.carriagewayId) current.carriagewayIds.add(edge.roadModel.carriagewayId);
  current.osmWayIds.add(edge.osm?.wayId || edge.id.match(/osm-way-(w\\d+)/)?.[1] || edge.id);
  current.endNodeId = step.toNodeId;
  current.distanceM += edge.lengthM;
  const lanes = edge.lanes || [];
  const layout = lanes.reduce((acc, lane) => (acc[lane.direction] = (acc[lane.direction] || 0) + 1, acc), {});
  const layoutKey = "forward:" + (layout.forward || 0) + ",reverse:" + (layout.reverse || 0) + ",shared:" + (layout.both || 0);
  current.laneLayouts[layoutKey] = (current.laneLayouts[layoutKey] || 0) + 1;
  if (edge.roadModel?.oneWay || edge.osm?.oneway === "yes" || edge.osm?.junction === "roundabout") current.oneWayEdges++;
  if (edge.osm?.bridge && edge.osm.bridge !== "no") current.bridgeEdges++;
  if (edge.osm?.tunnel && edge.osm.tunnel !== "no") current.tunnelEdges++;
  if (medianTagKeys.some(key => edge.osm?.[key] && !["no", "none", "0"].includes(String(edge.osm[key]).toLowerCase()))) current.medianTagEdges++;
  if (edge.roadModel?.groupingSource === "osm:paired-oneway-carriageways") {
    current.pairedCarriagewayEdges++;
    for (const id of edge.roadModel.pairedWayIds || []) current.pairedWayIds.add(id);
    if (medianWidthByPhysicalRoad.has(edge.roadModel.physicalRoadId)) current.pairedMedianEvidenceEdges++;
  }
  for (const [field, value] of [["ref", edge.osm?.ref], ["surface", edge.osm?.surface], ["maxspeed", edge.osm?.maxspeed], ["layer", edge.osm?.layer], ["sidewalk", edge.osm?.sidewalk], ["cycleway", edge.osm?.cycleway]]) {
    if (value == null || value === "") continue;
    const target = field === "ref" ? current.roadRefs : field === "surface" ? current.surfaces : field === "maxspeed" ? current.speedLimits : field === "layer" ? current.layerValues : field === "sidewalk" ? current.sidewalkTags : current.cyclewayTags;
    target[value] = (target[value] || 0) + 1;
  }
  const widthSource = edge.roadModel?.widthSource || (edge.osm?.width ? "osm:width" : "not-recorded");
  current.widthSources[widthSource] = (current.widthSources[widthSource] || 0) + 1;
  const confidence = edge.roadModel?.laneLayoutConfidence || "not-recorded";
  current.laneConfidence[confidence] = (current.laneConfidence[confidence] || 0) + 1;
  const node = nodeById.get(step.toNodeId);
  if (node && (degreeByNode.get(node.id) || 0) >= 3) current.junctionNodes.add(node.id);
  for (const feature of featuresByEdge.get(edge.id) || []) current.featureCounts[feature.kind] = (current.featureCounts[feature.kind] || 0) + 1;
}
for (const section of sections) {
  section.edgeCount = section.edgeIds.length;
  section.osmWayIds = [...section.osmWayIds];
  section.pairedWayIds = [...section.pairedWayIds];
  section.physicalRoadIds = [...section.physicalRoadIds];
  section.carriagewayIds = [...section.carriagewayIds];
  const outboundEdges = section.edgeIds.map(id => edgeById.get(id)).filter(Boolean);
  const outboundCarriagewaysByRoad = new Map();
  for (const edge of outboundEdges) {
    const model = edge.roadModel;
    if (!model?.physicalRoadId || !model.carriagewayId) continue;
    if (!outboundCarriagewaysByRoad.has(model.physicalRoadId)) outboundCarriagewaysByRoad.set(model.physicalRoadId, new Set());
    outboundCarriagewaysByRoad.get(model.physicalRoadId).add(model.carriagewayId);
  }
  const opposingEdgeIds = new Set(), opposingWayIds = new Set(), opposingLaneLayouts = {};
  const carriagewayPairs = [];
  for (const [physicalRoadId, usedCarriageways] of outboundCarriagewaysByRoad) {
    const allCarriageways = carriagewaysByPhysicalRoad.get(physicalRoadId);
    if (!allCarriageways || allCarriageways.size !== 2) continue;
    for (const [carriagewayId, edges] of allCarriageways) {
      if (usedCarriageways.has(carriagewayId)) continue;
      const wayIds = new Set();
      for (const edge of edges) {
        opposingEdgeIds.add(edge.id);
        const wayId = edge.roadModel?.sourceWayId || edge.osm?.wayId;
        if (wayId) { opposingWayIds.add(wayId); wayIds.add(wayId); }
        const layout = (edge.lanes || []).reduce((acc, lane) => (acc[lane.direction] = (acc[lane.direction] || 0) + 1, acc), {});
        const layoutKey = "forward:" + (layout.forward || 0) + ",reverse:" + (layout.reverse || 0) + ",shared:" + (layout.both || 0);
        opposingLaneLayouts[layoutKey] = (opposingLaneLayouts[layoutKey] || 0) + 1;
      }
      carriagewayPairs.push({ physicalRoadId, carriagewayId, wayIds: [...wayIds] });
    }
  }
  section.opposingEdgeCount = opposingEdgeIds.size;
  section.opposingWayIds = [...opposingWayIds];
  section.opposingLaneLayouts = opposingLaneLayouts;
  section.carriagewayPairs = carriagewayPairs;
  const pairedCoverage = outboundEdges.length ? outboundEdges.filter(edge => edge.roadModel?.groupingSource === "osm:paired-oneway-carriageways").length / outboundEdges.length : 0;
  const sharedTwoWay = outboundEdges.some(edge => (edge.lanes || []).some(lane => lane.direction === "both") ||
    ((edge.lanes || []).some(lane => lane.direction === "forward") && (edge.lanes || []).some(lane => lane.direction === "reverse")));
  section.roadArrangement = opposingEdgeIds.size && pairedCoverage >= 0.5 ? "divided-dual-carriageway" :
    opposingEdgeIds.size && pairedCoverage > 0 ? "mixed-carriageway" : sharedTwoWay ? "shared-two-way-carriageway" : "single-direction-carriageway";
  section.junctionCount = section.junctionNodes.size;
  section.junctionNodes = [...section.junctionNodes];
  section.start = coord(section.startNodeId);
  section.end = coord(section.endNodeId);
  section.medianStatus = section.medianTagEdges ? "explicitly-tagged-in-source" : section.pairedMedianEvidenceEdges ? "measured-from-opposing-paired-carriageways" : "not-mapped-in-source";
  const zone = (route.renderZones || []).find(item => item.name === section.name);
  const zoneOwner = zone ? sections.find(item => item.name === zone.name) : null;
  const zoneConnectors = zone && zoneOwner === section ? (connectorEdgesByZone.get(zone.id) || []) : [];
  section.connectorEdgeIds = zoneConnectors.map(edge => edge.id);
  section.connectorCount = zoneConnectors.length;
  section.connectorRoadNames = [...new Set(zoneConnectors.map(edge => edge.osm?.name).filter(Boolean))];
  section.connectorHighwayCounts = zoneConnectors.reduce((acc, edge) => (acc[edge.osm?.highway || "unknown"] = (acc[edge.osm?.highway || "unknown"] || 0) + 1, acc), {});
  section.connectorFeatureCounts = {};
  section.connectorBridgeEdges = zoneConnectors.filter(edge => edge.osm?.bridge && edge.osm.bridge !== "no").length;
  section.connectorPairedCarriagewayEdges = zoneConnectors.filter(edge => edge.roadModel?.groupingSource === "osm:paired-oneway-carriageways").length;
  section.connectorMedianEvidenceEdges = zoneConnectors.filter(edge => medianWidthByPhysicalRoad.has(edge.roadModel?.physicalRoadId)).length;
  section.connectorRoadArrangement = section.connectorMedianEvidenceEdges ? "divided-interchange-context" : zoneConnectors.length ? "interchange-connectors" : "none";
  section.connectorJunctionNodes = [];
  for (const edge of zoneConnectors) {
    const nodeIds = [edge.fromNodeId, edge.toNodeId];
    for (const nodeId of nodeIds) if ((degreeByNode.get(nodeId) || 0) >= 3) { section.junctionNodes.push(nodeId); section.connectorJunctionNodes.push(nodeId); }
    for (const feature of featuresByEdge.get(edge.id) || []) {
      section.connectorFeatureCounts[feature.kind] = (section.connectorFeatureCounts[feature.kind] || 0) + 1;
      section.featureCounts[feature.kind] = (section.featureCounts[feature.kind] || 0) + 1;
    }
  }
  section.junctionNodes = [...new Set(section.junctionNodes)];
  section.connectorJunctionNodes = [...new Set(section.connectorJunctionNodes)];
  section.junctionCount = section.junctionNodes.length;
  section.infrastructureStatus = Object.keys(section.featureCounts).length ? "OSM-features-matched-to-selected-edges" : "no-mapped-features-on-section";
  delete section.key;
}
if (!sections.length || Math.abs(totalDistanceM - route.distanceM) > Math.max(2, route.distanceM * 0.001)) {
  throw new Error("Section distances do not reconcile with the approved route distance");
}
const output = {
  schemaVersion: 2,
  routeId: route.routeId,
  source: "Geofabrik Ghana OSM PBF via Osmium; route edges are exact source OSM edges",
  alignment: {
    closed: false, start: route.waypoints[0], end: route.waypoints.at(-1),
    distanceM: Math.round(totalDistanceM), stepCount: route.steps.length,
    namedRoads: route.namedRoads
  },
  sectionCount: sections.length,
  sections,
  infrastructureTotals: matchedFeatures.reduce((acc, f) => (acc[f.kind] = (acc[f.kind] || 0) + 1, acc), {}),
  limitations: [
    "OSM does not supply metric elevation in this import; grades and bridge heights are not inferred.",
    "Medians are confirmed only by explicit OSM divider tags or paired opposing carriageways whose measured gap remains after both carriageway widths; no median is invented.",
    "Only OSM-mapped signs, crossings, signals, stops, lamps and barriers are counted as verified infrastructure.",
    "Visual comparison against Street View or field imagery remains a separate validation step."
  ]
};
await writeFile(DIR + "/lapaz-madina-sections.json", JSON.stringify(output, null, 2) + "\n");
console.log("Lapaz–Madina sections:", sections.length, "sections,", route.steps.length, "route edges,", Math.round(totalDistanceM), "m,", JSON.stringify(output.infrastructureTotals));
