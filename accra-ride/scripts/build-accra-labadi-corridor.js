#!/usr/bin/env node
/**
 * Build the user-approved Accra–Labadi corridor from the imported OSM graph.
 * Every route step is an existing legal directed OSM lane edge; no geometry is drawn
 * between checkpoints. Google Maps supplies endpoint pins and named-road preference;
 * the OSM graph supplies the exact connected road geometry.
 */
import { readFile, writeFile } from "node:fs/promises";
import { buildNavigationIndex } from "../src/map/road-navigation.js";
import { selectHighwayRouteGraph } from "../src/map/selected-road-graph.js";

const NETWORK_PATH = "accra-ride/data/osm/accra-central-routing.network.json";
const WAYPOINT_PATH = "accra-ride/data/osm/accra-labadi-waypoints.json";
const OUTPUT_PATH = "accra-ride/data/osm/accra-labadi-route.json";
const EARTH_RADIUS_M = 6371008.8;

const CLASS_FACTOR = Object.freeze({
  motorway: 1, motorway_link: 1.12, trunk: 1.04, trunk_link: 1.16,
  primary: 1.08, primary_link: 1.2, secondary: 1.22, secondary_link: 1.35,
  tertiary: 1.55, tertiary_link: 1.7, unclassified: 2.8,
  residential: 4.5, living_street: 7
});

function distanceM(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const lat1 = a.lat * rad, lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq));
  return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
}

function isInsideApprovedCorridor(edge, outboundEdges, radiusM = 85) {
  // The reverse journey must use the opposite carriageway of the SAME selected
  // Google Maps corridor, not a fresh shortest path through unrelated streets.
  const line = edge.centerline || [];
  if (line.length < 2) return false;
  const reference = outboundEdges.flatMap(item => item.centerline || []);
  if (!reference.length) return false;
  return line.every(point => reference.some((candidate, i) => {
    if (i === 0) return false;
    const previous = reference[i - 1];
    return pointSegmentDistance(point, previous, candidate) <= radiusM;
  }));
}

function nearestRoadNodes(network, waypoint, maxDistanceM = 1400, limit = 40) {
  const roadNodes = new Set();
  for (const edge of network.edges) {
    if (!Object.hasOwn(CLASS_FACTOR, edge.osm?.highway)) continue;
    roadNodes.add(edge.fromNodeId); roadNodes.add(edge.toNodeId);
  }
  const candidates = [];
  for (const node of network.nodes) {
    if (!roadNodes.has(node.id) || !Number.isFinite(node.osm?.lat) || !Number.isFinite(node.osm?.lon)) continue;
    const d = distanceM({ lat: node.osm.lat, lon: node.osm.lon }, waypoint);
    if (d <= maxDistanceM) candidates.push({ node, distanceM: d });
  }
  candidates.sort((a, b) => a.distanceM - b.distanceM);
  return candidates.slice(0, limit);
}

function nearestRoadNode(network, waypoint, maxDistanceM = 1400) {
  const candidates = nearestRoadNodes(network, waypoint, maxDistanceM, 1);
  if (!candidates.length) throw new Error("No drivable OSM node within " + maxDistanceM + " m of checkpoint " + waypoint.name);
  return candidates[0];
}

function nearestBidirectionallyConnectedRoadNode(network, index, waypoint, previousNodeId, maxDistanceM = 1400) {
  const candidates = nearestRoadNodes(network, waypoint, maxDistanceM);
  for (const candidate of candidates) {
    const outbound = weightedRoute(index, previousNodeId, candidate.node.id);
    if (!outbound?.length) continue;
    const returning = weightedRoute(index, candidate.node.id, previousNodeId);
    if (!returning?.length) continue;
    return candidate;
  }
  const nearest = candidates[0];
  throw new Error("No bidirectionally connected OSM node within " + maxDistanceM + " m of checkpoint " + waypoint.name +
    " from the previous checkpoint (nearest: " + (nearest ? Math.round(nearest.distanceM) + " m" : "none") + ")");
}

function weightedRoute(index, startNodeId, endNodeId, allowedEdgeIds = null) {
  const distance = new Map([[startNodeId, 0]]), previous = new Map(), heap = [];
  const push = item => {
    heap.push(item); let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p].cost <= item.cost) break; heap[i] = heap[p]; i = p; }
    heap[i] = item;
  };
  const pop = () => {
    if (!heap.length) return null;
    const root = heap[0], last = heap.pop();
    if (heap.length) { let i = 0; while (true) { let c = i * 2 + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1].cost < heap[c].cost) c++; if (heap[c].cost >= last.cost) break; heap[i] = heap[c]; i = c; } heap[i] = last; }
    return root;
  };
  push({ id: startNodeId, cost: 0 });
  const settled = new Set();
  while (heap.length) {
    const current = pop();
    if (settled.has(current.id)) continue;
    settled.add(current.id);
    if (current.id === endNodeId) break;
    for (const arc of index.outgoing.get(current.id) || []) {
      if (allowedEdgeIds && !allowedEdgeIds.has(arc.edge.id)) continue;
      if (settled.has(arc.to)) continue;
      const factor = CLASS_FACTOR[arc.edge.osm?.highway] ?? 5.5;
      const cost = current.cost + arc.edge.lengthM * factor;
      if (cost < (distance.get(arc.to) ?? Infinity)) {
        distance.set(arc.to, cost);
        previous.set(arc.to, { from: current.id, arc });
        push({ id: arc.to, cost });
      }
    }
  }
  if (!distance.has(endNodeId)) return null;
  const steps = [];
  for (let node = endNodeId; node !== startNodeId;) {
    const prev = previous.get(node);
    if (!prev) return null;
    steps.push({ edgeId: prev.arc.edge.id, laneId: prev.arc.lane.id, direction: prev.arc.direction,
      fromNodeId: prev.from, toNodeId: node, name: prev.arc.edge.osm?.name || null,
      highway: prev.arc.edge.osm?.highway || null });
    node = prev.from;
  }
  steps.reverse();
  return steps;
}

async function main() {
  const document = JSON.parse(await readFile(NETWORK_PATH, "utf8"));
  const source = document.network;
  if (!source?.nodes?.length || !source?.edges?.length) throw new Error("Accra–Labadi OSM corridor network is empty");
  const waypointDoc = JSON.parse(await readFile(WAYPOINT_PATH, "utf8"));
  const waypoints = waypointDoc.waypoints;
  if (!Array.isArray(waypoints) || waypoints.length < 2) throw new Error("At least two ordered corridor checkpoints are required");
  const index = buildNavigationIndex(source);
  const snapped = [];
  for (const waypoint of waypoints) {
    const result = snapped.length
      ? nearestBidirectionallyConnectedRoadNode(source, index, waypoint, snapped.at(-1).nodeId)
      : nearestRoadNode(source, waypoint);
    snapped.push({ ...waypoint, nodeId: result.node.id, snapDistanceM: Math.round(result.distanceM) });
  }
  const steps = [], waypointAfterSteps = [0];
  let totalDistanceM = 0;
  for (let i = 0; i < snapped.length - 1; i++) {
    const leg = weightedRoute(index, snapped[i].nodeId, snapped[i + 1].nodeId);
    if (!leg?.length) throw new Error("No legal directed OSM route from " + snapped[i].name + " to " + snapped[i + 1].name);
    if (steps.length && steps.at(-1).toNodeId !== leg[0].fromNodeId) throw new Error("Disconnected route at " + snapped[i].name);
    steps.push(...leg); waypointAfterSteps.push(steps.length);
    for (const step of leg) totalDistanceM += source.edges.find(edge => edge.id === step.edgeId).lengthM;
  }
  // Build the return direction only from OSM carriageways physically adjacent
  // to the exact outbound corridor. Do not calculate an independent city route.
  const outboundEdgeIds = new Set(steps.map(step => step.edgeId));
  const outboundEdges = source.edges.filter(edge => outboundEdgeIds.has(edge.id));
  const corridorEdgeIds = new Set(source.edges
    .filter(edge => isInsideApprovedCorridor(edge, outboundEdges, 85))
    .map(edge => edge.id));
  for (const id of outboundEdgeIds) corridorEdgeIds.add(id);
  const returnSteps = [], returnWaypointAfterSteps = [0];
  let returnDistanceM = 0;
  for (let i = snapped.length - 1; i > 0; i--) {
    const leg = weightedRoute(index, snapped[i].nodeId, snapped[i - 1].nodeId, corridorEdgeIds);
    if (!leg?.length) throw new Error("No legal return OSM route from " + snapped[i].name + " to " + snapped[i - 1].name);
    if (returnSteps.length && returnSteps.at(-1).toNodeId !== leg[0].fromNodeId) throw new Error("Disconnected return route at " + snapped[i].name);
    returnSteps.push(...leg); returnWaypointAfterSteps.push(returnSteps.length);
    for (const step of leg) returnDistanceM += source.edges.find(edge => edge.id === step.edgeId).lengthM;
  }
  const namedRoads = [...new Set(steps.map(step => step.name).filter(Boolean))];
  const returnNamedRoads = [...new Set(returnSteps.map(step => step.name).filter(Boolean))];
  const route = {
    schemaVersion: 1, routeId: "accra-labadi-highway", networkId: source.id,
    title: "Accra to Labadi", direction: "Accra → Labadi",
    closed: false, startNodeId: snapped[0].nodeId, endNodeId: snapped.at(-1).nodeId,
    routeReference: waypointDoc.routeReference || null,
    distanceM: Math.round(totalDistanceM), stepCount: steps.length, namedRoads,
    returnRouteId: "labadi-accra-highway", returnDistanceM: Math.round(returnDistanceM),
    returnStepCount: returnSteps.length, returnNamedRoads, returnSteps,
    returnWaypoints: [...snapped].reverse().map((waypoint, i) => ({ order: i + 1, name: waypoint.name,
      nodeId: waypoint.nodeId, lat: waypoint.lat, lon: waypoint.lon, snapDistanceM: waypoint.snapDistanceM,
      afterStep: returnWaypointAfterSteps[i] })),
    waypoints: snapped.map((waypoint, i) => ({ order: i + 1, name: waypoint.name,
      nodeId: waypoint.nodeId, lat: waypoint.lat, lon: waypoint.lon, snapDistanceM: waypoint.snapDistanceM,
      afterStep: waypointAfterSteps[i] })),
    steps
  };
  const requiredRoads = waypointDoc.routeReference?.requiredRoadNames || [];
  const normalise = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const required of requiredRoads) {
    if (!namedRoads.some(name => normalise(name).includes(normalise(required)))) {
      throw new Error("Google Maps primary corridor road is missing from generated OSM route: " + required +
        "; generated roads: " + namedRoads.join(", "));
    }
  }
  await writeFile(OUTPUT_PATH, JSON.stringify(route, null, 2) + "\n");
  const { network: selectedNetwork, report: selectionReport } = selectHighwayRouteGraph(source, route);
  const routeNetwork = {
    ...selectedNetwork,
    diagnostics: {
      ...(selectedNetwork.diagnostics || {}),
      sourceEdgeCount: source.edges.length,
      selectedRouteEdgeCount: selectionReport.routeEdgeCount + selectionReport.returnRouteEdgeCount,
      selectedConnectorEdgeCount: selectionReport.connectorEdgeCount,
      selectedRouteNodeCount: selectedNetwork.nodes.length,
      selectedRouteRetainedRatio: source.edges.length
        ? (selectionReport.routeEdgeCount + selectionReport.returnRouteEdgeCount) / source.edges.length : 0
    }
  };
  await writeFile("accra-ride/data/osm/accra-central.network.json", JSON.stringify({
    areaId: document.areaId, bounds: document.bounds, source: document.source,
    elementCount: document.elementCount, network: routeNetwork
  }, null, 2) + "\n");
  process.stdout.write("Accra–Labadi corridor built: outbound " + route.stepCount + " steps / " +
    (route.distanceM / 1000).toFixed(2) + " km; return " + route.returnStepCount + " steps / " +
    (route.returnDistanceM / 1000).toFixed(2) + " km; " + route.waypoints.length +
    " checkpoints; " + routeNetwork.edges.length + " OSM edges.\n");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
