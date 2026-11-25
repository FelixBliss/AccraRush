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
const featuresByEdge = new Map();
for (const feature of matchedFeatures) {
  if (!featuresByEdge.has(feature.edgeId)) featuresByEdge.set(feature.edgeId, []);
  featuresByEdge.get(feature.edgeId).push(feature);
}
const medianTagKeys = ["median", "divider", "separation", "dual_carriageway"];
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
      medianTagEdges: 0, junctionNodes: new Set(), featureCounts: {},
      widthSources: {}, laneConfidence: {}
    };
    sections.push(current);
  }
  current.lastStep = i;
  current.edgeIds.push(edge.id);
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
  section.junctionCount = section.junctionNodes.size;
  section.junctionNodes = [...section.junctionNodes];
  section.start = coord(section.startNodeId);
  section.end = coord(section.endNodeId);
  section.medianStatus = section.medianTagEdges ? "explicitly-tagged-in-source" : "not-mapped-in-source";
  section.infrastructureStatus = Object.keys(section.featureCounts).length ? "OSM-features-matched-to-route" : "no-mapped-features-on-section";
  delete section.key;
}
if (!sections.length || Math.abs(totalDistanceM - route.distanceM) > Math.max(2, route.distanceM * 0.001)) {
  throw new Error("Section distances do not reconcile with the approved route distance");
}
const output = {
  schemaVersion: 1,
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
    "Medians are only confirmed where explicit OSM divider/median tags exist; no median is invented.",
    "Only OSM-mapped signs, crossings, signals, stops, lamps and barriers are counted as verified infrastructure.",
    "Visual comparison against Street View or field imagery remains a separate validation step."
  ]
};
await writeFile(DIR + "/lapaz-madina-sections.json", JSON.stringify(output, null, 2) + "\n");
console.log("Lapaz–Madina sections:", sections.length, "sections,", route.steps.length, "route edges,", Math.round(totalDistanceM), "m,", JSON.stringify(output.infrastructureTotals));
