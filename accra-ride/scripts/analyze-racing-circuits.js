#!/usr/bin/env node
/**
 * Finds real, legally directed racing circuits in an imported OSM network.
 * This is an analysis/proposal tool: it never adds, snaps, or invents roads.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectRoadGraph } from "../src/map/selected-road-graph.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AREA_PREFERENCES = {
  "accra-central": { lat: 5.569, lon: -0.207 },
  "lapaz": { lat: 5.630, lon: -0.250 }
};
const MAJOR_CLASSES = new Set(["motorway","motorway_link","trunk","trunk_link","primary","primary_link","secondary","secondary_link","tertiary","tertiary_link"]);
function nodeCoordinates(id) {
  const match = String(id).match(/^osm-node-(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)$/);
  return match ? { lat: Number(match[1]), lon: Number(match[2]) } : null;
}
function distanceFromCenter(nodeId, center) {
  const point = nodeCoordinates(nodeId);
  if (!point || !center) return Infinity;
  const north = (point.lat - center.lat) * 111320;
  const east = (point.lon - center.lon) * 111320 * Math.cos(center.lat * Math.PI / 180);
  return Math.hypot(north, east);
}
const AREAS = [
  { id: "accra-central", file: "data/osm/accra-central.network.json" },
  { id: "lapaz", file: "data/osm/lapaz.network.json" }
];

function directedArcs(network) {
  const nodes = new Set(network.nodes.map(n => n.id));
  const outgoing = new Map(network.nodes.map(n => [n.id, []]));
  const incoming = new Map(network.nodes.map(n => [n.id, []]));
  for (const edge of network.edges) {
    if (!nodes.has(edge.fromNodeId) || !nodes.has(edge.toNodeId)) continue;
    const directions = new Set((edge.lanes || []).flatMap(l =>
      l.direction === "both" ? ["forward", "reverse"] :
      l.direction === "backward" ? ["reverse"] : [l.direction]
    ));
    for (const direction of directions) {
      if (direction !== "forward" && direction !== "reverse") continue;
      const from = direction === "forward" ? edge.fromNodeId : edge.toNodeId;
      const to = direction === "forward" ? edge.toNodeId : edge.fromNodeId;
      const arc = { edgeId: edge.id, laneId: (edge.lanes || []).find(l =>
        l.direction === direction || l.direction === "both" ||
        (direction === "reverse" && l.direction === "backward"))?.id,
        from, to, direction, lengthM: Number(edge.lengthM) || 0,
        name: edge.osm?.junction ? null : edge.osm?.name || null, highway: edge.osm?.highway || null };
      if (!arc.laneId || arc.lengthM <= 0) continue;
      outgoing.get(from).push(arc);
      incoming.get(to).push(arc);
    }
  }
  return { outgoing, incoming };
}

// Iterative Kosaraju avoids recursion limits on the full city graph.
function stronglyConnectedComponents(outgoing, incoming) {
  const visited = new Set(), order = [];
  for (const root of outgoing.keys()) {
    if (visited.has(root)) continue;
    const stack = [[root, false]];
    while (stack.length) {
      const [v, done] = stack.pop();
      if (done) { order.push(v); continue; }
      if (visited.has(v)) continue;
      visited.add(v); stack.push([v, true]);
      for (const arc of outgoing.get(v) || []) if (!visited.has(arc.to)) stack.push([arc.to, false]);
    }
  }
  visited.clear();
  const components = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const root = order[i];
    if (visited.has(root)) continue;
    const component = [], stack = [root]; visited.add(root);
    while (stack.length) {
      const v = stack.pop(); component.push(v);
      for (const arc of incoming.get(v) || []) if (!visited.has(arc.from)) {
        visited.add(arc.from); stack.push(arc.from);
      }
    }
    components.push(component);
  }
  return components.sort((a, b) => b.length - a.length);
}

function seededRandom(seed) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

function findCircuit(network, graph, component, options = {}) {
  const allowed = new Set(component);
  const minEdges = options.minEdges ?? 18;
  const maxEdges = options.maxEdges ?? 260;
  const minDistanceM = options.minDistanceM ?? 1800;
  const maxDistanceM = options.maxDistanceM ?? 18000;
  const minNamedRoads = options.minNamedRoads ?? 3;
  const random = seededRandom(options.seed ?? 41041);
  const starts = component.filter(id => (graph.outgoing.get(id) || []).some(a => allowed.has(a.to)));
  if (!starts.length) return null;
  let best = null;
  const attempts = Math.min(12000, starts.length * 8);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const start = searchStarts[Math.floor(random() * searchStarts.length)];
    let current = start, distanceM = 0;
    const steps = [], names = new Set(), majorNames = new Set(), visitedTransitions = new Set();
    for (let step = 0; step < maxEdges; step++) {
      let choices = (graph.outgoing.get(current) || []).filter(a =>
        allowed.has(a.to) && !visitedTransitions.has(a.edgeId + ":" + a.direction));
      if (choices.length > 1 && steps.length) {
        const nonBacktrack = choices.filter(a => a.to !== steps[steps.length - 1].from);
        if (nonBacktrack.length) choices = nonBacktrack;
      }
      if (!choices.length) break;
      // Deterministic pseudo-random exploration with a mild preference for named roads.
      choices.sort((a, b) => Number(Boolean(b.name)) - Number(Boolean(a.name)) || a.lengthM - b.lengthM);
      const pool = choices.slice(0, Math.min(8, choices.length));
      const arc = pool[Math.floor(random() * pool.length)];
      steps.push(arc); visitedTransitions.add(arc.edgeId + ":" + arc.direction);
      distanceM += arc.lengthM;
      if (arc.name) { names.add(arc.name); if (MAJOR_CLASSES.has(arc.highway)) majorNames.add(arc.name); }
      current = arc.to;
      if (current === start && steps.length >= minEdges) {
        if (distanceM >= minDistanceM && distanceM <= maxDistanceM && names.size >= minNamedRoads && majorNames.size >= (options.minMajorRoads ?? 3)) {
          const candidate = { startNodeId: start, endNodeId: current, closed: true,
            edgeCount: steps.length, distanceM: Math.round(distanceM),
            namedRoads: [...names], majorRoads: [...majorNames], startDistanceFromPreferredM: Math.round(distanceFromCenter(start, center)), steps: steps.map(({edgeId,laneId,direction,from,to,name}) =>
              ({edgeId,laneId,direction,fromNodeId:from,toNodeId:to,name})) };
          const score = Math.abs(distanceM - 7000) + Math.max(0, 6 - names.size) * 1500 + distanceFromCenter(start, center) * 3 + Math.max(0, 3 - majorNames.size) * 2000;
          if (!best || score < best.score) best = { ...candidate, score };
        }
        break;
      }
    }
  }
  if (best) delete best.score;
  return best;
}

export function analyzeNetwork(network, areaId) {
  if (!network || !Array.isArray(network.nodes) || !Array.isArray(network.edges)) {
    throw new Error(areaId + ": invalid OSM network document");
  }
  const graph = directedArcs(network);
  const components = stronglyConnectedComponents(graph.outgoing, graph.incoming);
  const cyclic = components.filter(c => c.length > 1 || (graph.outgoing.get(c[0]) || []).some(a => a.to === c[0]));
  const circuit = cyclic.length ? findCircuit(network, graph, cyclic[0], { seed: areaId === "lapaz" ? 41042 : 41041, preferredCenter: AREA_PREFERENCES[areaId], preferredRadiusM: 3000, minMajorRoads: 3 }) : null;
  return {
    areaId, networkId: network.id, counts: {
      nodes: network.nodes.length, edges: network.edges.length,
      directedArcs: [...graph.outgoing.values()].reduce((n, a) => n + a.length, 0),
      stronglyConnectedComponents: components.length,
      cyclicComponents: cyclic.length,
      largestCyclicComponentNodes: cyclic[0]?.length || 0
    },
    circuit
  };
}

function main() {
  const reports = [];
  for (const area of AREAS) {
    const file = path.join(ROOT, area.file);
    const document = JSON.parse(fs.readFileSync(file, "utf8"));
    const network = document.network;
    const report = analyzeNetwork(network, area.id);
    reports.push(report);
    console.log(JSON.stringify(report, null, 2));
    if (!report.circuit) {
      console.error("NO ACCEPTABLE SIX-ROAD CIRCUIT FOUND for " + area.id);
    } else {
      const candidate = {
        schemaVersion: 1, areaId: area.id, networkId: network.id,
        startNodeId: report.circuit.startNodeId, endNodeId: report.circuit.endNodeId,
        closed: report.circuit.closed, distanceM: report.circuit.distanceM,
        edgeCount: report.circuit.edgeCount, namedRoads: report.circuit.namedRoads,
        steps: report.circuit.steps
      };
      fs.writeFileSync(path.join(ROOT, "data/osm/" + area.id + ".candidate-race-circuit.json"),
        JSON.stringify(candidate, null, 2) + "\n");
    }
  }
  const output = path.join(ROOT, "data/osm/closed-loop-circuit-analysis.json");
  fs.writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2) + "\n");
  if (reports.some(r => !r.circuit || r.circuit.namedRoads.length < 6)) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
