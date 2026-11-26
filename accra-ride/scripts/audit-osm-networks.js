#!/usr/bin/env node
/**
 * Independent audit of generated OSM road networks.
 * Deliberately does not call the importer or validateRoadNetwork implementation.
 */
import { readFile, writeFile } from "node:fs/promises";

const ROOT = "accra-ride/data/osm";
const AREAS = {
  "accra-central": { south: 5.535, west: -0.215, north: 5.585, east: -0.125 },
  "lapaz": { south: 5.595, west: -0.295, north: 5.7, east: -0.145 }
};
const EPS = 1e-7;
const fail = (errors, message) => errors.push(message);
const key = (a, b) => a + "|" + b;

function auditNetwork(id, expectedBounds, document) {
  const errors = [];
  const net = document?.network;
  if (!net || !Array.isArray(net.nodes) || !Array.isArray(net.edges)) {
    return { status: "failed", errors: ["Missing network/nodes/edges arrays"] };
  }
  if (document.areaId !== id) fail(errors, "areaId does not match expected area");
  if (JSON.stringify(document.bounds) !== JSON.stringify(expectedBounds)) fail(errors, "dataset bounds differ from approved area bounds");
  if (!net.source?.attribution?.includes("OpenStreetMap") && !net.source?.attribution?.includes("OSM")) fail(errors, "OSM attribution metadata missing");

  const origin = net.projection?.origin;
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lon)) fail(errors, "local projection origin missing or invalid");
  const toGeographic = point => {
    if (!origin) return null;
    const rad = Math.PI / 180, radius = 6371008.8;
    return {
      lat: origin.lat - (point.z / radius) / rad,
      lon: origin.lon + (point.x / (radius * Math.cos(origin.lat * rad))) / rad
    };
  };

  const nodes = new Map();
  const duplicateNodeIds = [];
  const cells = new Set();
  const bounds = expectedBounds;
  for (const n of net.nodes) {
    if (!n || typeof n.id !== "string" || !n.id) { fail(errors, "node with missing ID"); continue; }
    if (nodes.has(n.id)) duplicateNodeIds.push(n.id);
    nodes.set(n.id, n);
    const p = n.osm;
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) {
      fail(errors, "node " + n.id + " missing valid source coordinates");
      continue;
    }
    if (p.lat < bounds.south - EPS || p.lat > bounds.north + EPS || p.lon < bounds.west - EPS || p.lon > bounds.east + EPS) {
      fail(errors, "node " + n.id + " lies outside approved geographic bounds");
    }
    const gx = Math.min(3, Math.max(0, Math.floor((p.lon - bounds.west) / (bounds.east - bounds.west) * 4)));
    const gy = Math.min(3, Math.max(0, Math.floor((p.lat - bounds.south) / (bounds.north - bounds.south) * 4)));
    cells.add(gx + ":" + gy);
  }
  if (duplicateNodeIds.length) fail(errors, "duplicate node IDs: " + duplicateNodeIds.length);

  const edgeIds = new Set(), laneIds = new Set();
  const degree = new Map([...nodes.keys()].map(id => [id, 0]));
  const undirected = new Map([...nodes.keys()].map(id => [id, []]));
  const directed = new Map([...nodes.keys()].map(id => [id, []]));
  const classes = {};
  let totalGeometryPoints = 0, maxGeometryOutside = 0;
  for (const e of net.edges) {
    if (!e || typeof e.id !== "string" || !e.id) { fail(errors, "edge with missing ID"); continue; }
    if (edgeIds.has(e.id)) fail(errors, "duplicate edge ID " + e.id);
    edgeIds.add(e.id);
    const a = nodes.get(e.fromNodeId), b = nodes.get(e.toNodeId);
    if (!a || !b) { fail(errors, "edge " + e.id + " has dangling endpoint"); continue; }
    degree.set(a.id, degree.get(a.id) + 1);
    degree.set(b.id, degree.get(b.id) + 1);
    undirected.get(a.id).push(b.id); undirected.get(b.id).push(a.id);
    if (!Array.isArray(e.centerline) || e.centerline.length < 2) { fail(errors, "edge " + e.id + " lacks centreline geometry"); continue; }
    totalGeometryPoints += e.centerline.length;
    const first = e.centerline[0], last = e.centerline[e.centerline.length - 1];
    const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    if (dist(first, a.position) > 0.05 || dist(last, b.position) > 0.05) fail(errors, "edge " + e.id + " centreline endpoints do not meet graph nodes");
    for (const p of e.centerline) {
      if (![p.x, p.y, p.z].every(Number.isFinite)) {
        fail(errors, "edge " + e.id + " has non-finite geometry");
        continue;
      }
      const geographic = toGeographic(p);
      if (geographic && (geographic.lat < bounds.south - 1e-6 || geographic.lat > bounds.north + 1e-6 ||
          geographic.lon < bounds.west - 1e-6 || geographic.lon > bounds.east + 1e-6)) {
        fail(errors, "edge " + e.id + " centreline point lies outside approved geographic bounds");
      }
    }
    if (!(Number.isFinite(e.lengthM) && e.lengthM > 0)) fail(errors, "edge " + e.id + " has invalid length");
    const highway = e.osm?.highway || "unknown";
    classes[highway] = (classes[highway] || 0) + 1;
    const lanes = Array.isArray(e.lanes) ? e.lanes : [];
    if (!lanes.length) fail(errors, "edge " + e.id + " has no directional lanes");
    for (const lane of lanes) {
      if (!lane?.id || laneIds.has(lane.id)) fail(errors, "missing/duplicate lane ID on edge " + e.id);
      laneIds.add(lane?.id);
      if (!(Number.isFinite(lane.widthM) && lane.widthM > 0 && lane.widthM <= 30)) fail(errors, "invalid lane width on edge " + e.id);
      if (lane.direction === "forward") directed.get(a.id).push({ to: b.id, edge: e.id });
      else if (lane.direction === "reverse") directed.get(b.id).push({ to: a.id, edge: e.id });
      else if (lane.direction === "both") {
        directed.get(a.id).push({ to: b.id, edge: e.id });
        directed.get(b.id).push({ to: a.id, edge: e.id });
      } else fail(errors, "invalid lane direction on edge " + e.id);
    }
    const oneway = e.osm?.oneway;
    const explicitTwoWay = ["no", "0", "false"].includes(String(oneway ?? "").toLowerCase());
    if (!explicitTwoWay && (oneway === "yes" || oneway === "1" || oneway === "true" || oneway === "-1" || e.osm?.junction === "roundabout") &&
        lanes.some(l => l.direction !== (oneway === "-1" ? "reverse" : "forward")))
      fail(errors, "one-way OSM edge incorrectly permits travel in an opposing/shared direction: " + e.id);
    if (oneway === "-1" && lanes.some(l => l.direction === "forward")) fail(errors, "reverse-only OSM edge incorrectly permits forward travel: " + e.id);
  }

  let components = 0, largestComponent = 0;
  const visited = new Set();
  for (const id of nodes.keys()) {
    if (visited.has(id)) continue;
    components++;
    const stack = [id]; visited.add(id); let size = 0;
    while (stack.length) {
      const current = stack.pop(); size++;
      for (const next of undirected.get(current) || []) if (!visited.has(next)) { visited.add(next); stack.push(next); }
    }
    largestComponent = Math.max(largestComponent, size);
  }

  let bestReachable = 0, longestShortestRoute = 0;
  const sampleStarts = [...nodes.keys()]
    .filter(id => (directed.get(id) || []).length > 0)
    .sort((a, b) => (directed.get(b) || []).length - (directed.get(a) || []).length)
    .slice(0, 32);
  for (const start of sampleStarts) {
    const distances = new Map([[start, 0]]), queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i], d = distances.get(current);
      for (const arc of directed.get(current) || []) if (!distances.has(arc.to)) {
        distances.set(arc.to, d + 1); queue.push(arc.to);
      }
    }
    bestReachable = Math.max(bestReachable, distances.size);
    for (const d of distances.values()) longestShortestRoute = Math.max(longestShortestRoute, d);
  }

  const junctions = [...degree.values()].filter(d => d >= 3).length;
  const deadEnds = [...degree.values()].filter(d => d === 1).length;
  const largestRatio = nodes.size ? largestComponent / nodes.size : 0;
  if (!nodes.size || !edgeIds.size) fail(errors, "network is empty");
  if (cells.size < 4) fail(errors, "geographic coverage too sparse: fewer than 4 of 16 grid cells occupied");
  if (junctions < 3) fail(errors, "fewer than 3 graph junctions found");
  if (bestReachable < 10 || longestShortestRoute < 5) fail(errors, "directed graph does not support a meaningful multi-junction route");
  if (largestRatio < 0.5) fail(errors, "largest connected component contains less than half of all nodes");

  return {
    status: errors.length ? "failed" : "passed",
    errors,
    metrics: {
      sourceWays: document.elementCount,
      nodes: nodes.size,
      edges: edgeIds.size,
      lanes: laneIds.size,
      connectedComponents: components,
      largestComponentNodes: largestComponent,
      largestComponentRatio: Number(largestRatio.toFixed(4)),
      junctions,
      deadEnds,
      occupiedCoverageCells: cells.size,
      coverageGridCells: 16,
      directedMaxReachableNodes: bestReachable,
      directedLongestShortestRouteEdges: longestShortestRoute,
      directedReachabilitySampleStarts: sampleStarts.length,
      centerlineGeometryPoints: totalGeometryPoints,
      highwayClassCounts: classes
    }
  };
}

async function main() {
  const report = {
    validator: "independent-osm-network-audit",
    generatedAt: new Date().toISOString(),
    source: "Geofabrik Ghana OSM PBF; ODbL",
    areas: {}
  };
  for (const [id, bounds] of Object.entries(AREAS)) {
    try {
      const networkFile = id + "-routing.network.json";
      const raw = await readFile(ROOT + "/" + networkFile, "utf8");
      report.areas[id] = auditNetwork(id, bounds, JSON.parse(raw));
    } catch (error) {
      report.areas[id] = { status: "failed", errors: [error.message] };
    }
  }
  const passed = Object.keys(AREAS).every(id => report.areas[id]?.status === "passed");
  report.status = passed ? "passed" : "failed";
  report.completedAt = new Date().toISOString();
  await writeFile(ROOT + "/independent-validation-report.json", JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!passed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
