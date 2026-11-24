#!/usr/bin/env node
/**
 * Build the user-approved Lapaz–Madina highway corridor from the imported OSM graph.
 * Every route step is an existing legal directed OSM lane edge; no geometry is drawn
 * between checkpoints. Waypoints are map anchors used only to select nearby graph nodes.
 */
import { readFile, writeFile } from "node:fs/promises";
import { buildNavigationIndex } from "../src/map/road-navigation.js";

const NETWORK_PATH = "accra-ride/data/osm/lapaz.network.json";
const WAYPOINT_PATH = "accra-ride/data/osm/lapaz-madina-waypoints.json";
const OUTPUT_PATH = "accra-ride/data/osm/lapaz-madina-route.json";
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

function nearestRoadNode(network, waypoint, maxDistanceM = 1400) {
  const roadNodes = new Set();
  for (const edge of network.edges) {
    if (!Object.hasOwn(CLASS_FACTOR, edge.osm?.highway)) continue;
    roadNodes.add(edge.fromNodeId); roadNodes.add(edge.toNodeId);
  }
  let best = null;
  for (const node of network.nodes) {
    if (!roadNodes.has(node.id) || !Number.isFinite(node.osm?.lat) || !Number.isFinite(node.osm?.lon)) continue;
    const d = distanceM({ lat: node.osm.lat, lon: node.osm.lon }, waypoint);
    if (!best || d < best.distanceM) best = { node, distanceM: d };
  }
  if (!best || best.distanceM > maxDistanceM) {
    throw new Error("No drivable OSM node within " + maxDistanceM + " m of checkpoint " + waypoint.name +
      " (nearest: " + (best ? Math.round(best.distanceM) + " m" : "none") + ")");
  }
  return best;
}

function weightedRoute(index, startNodeId, endNodeId) {
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
  if (!source?.nodes?.length || !source?.edges?.length) throw new Error("Lapaz OSM corridor network is empty");
  const waypointDoc = JSON.parse(await readFile(WAYPOINT_PATH, "utf8"));
  const waypoints = waypointDoc.waypoints;
  if (!Array.isArray(waypoints) || waypoints.length < 2) throw new Error("At least two ordered corridor checkpoints are required");
  const snapped = waypoints.map(waypoint => {
    const result = nearestRoadNode(source, waypoint);
    return { ...waypoint, nodeId: result.node.id, snapDistanceM: Math.round(result.distanceM) };
  });
  const index = buildNavigationIndex(source);
  const steps = [];
  const waypointAfterSteps = [0];
  let totalDistanceM = 0;
  for (let i = 0; i < snapped.length - 1; i++) {
    const leg = weightedRoute(index, snapped[i].nodeId, snapped[i + 1].nodeId);
    if (!leg?.length) throw new Error("No legal directed OSM route from " + snapped[i].name + " to " + snapped[i + 1].name);
    if (steps.length && steps[steps.length - 1].toNodeId !== leg[0].fromNodeId) {
      throw new Error("Disconnected route at " + snapped[i].name);
    }
    steps.push(...leg);
    waypointAfterSteps.push(steps.length);
    for (const step of leg) totalDistanceM += source.edges.find(edge => edge.id === step.edgeId).lengthM;
  }
  const namedRoads = [...new Set(steps.map(step => step.name).filter(Boolean))];
  const route = {
    schemaVersion: 1, routeId: "lapaz-madina-highway", networkId: source.id,
    title: "Lapaz to Madina Highway", direction: "Lapaz → Madina",
    closed: false, startNodeId: snapped[0].nodeId, endNodeId: snapped.at(-1).nodeId,
    distanceM: Math.round(totalDistanceM), stepCount: steps.length, namedRoads,
    waypoints: snapped.map((waypoint, i) => ({ order: i + 1, name: waypoint.name,
      nodeId: waypoint.nodeId, lat: waypoint.lat, lon: waypoint.lon, snapDistanceM: waypoint.snapDistanceM,
      afterStep: waypointAfterSteps[i] })),
    steps
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(route, null, 2) + "\n");
  process.stdout.write("Lapaz–Madina route built: " + route.stepCount + " directed OSM steps, " +
    (route.distanceM / 1000).toFixed(2) + " km, " + route.waypoints.length + " checkpoints.\n");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
