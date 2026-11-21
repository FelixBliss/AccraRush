#!/usr/bin/env node
/**
 * AccraRush OSM road importer.
 * Downloads OSM highway ways for a configured area, normalises them into a
 * stable node/segment graph, validates the result, and writes roads.json.
 *
 * Usage: node scripts/import-osm-areas.mjs [accra-central|lapaz|all]
 * Source: OpenStreetMap contributors (ODbL 1.0).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AREAS = {
  "accra-central": {
    id: "accra-central",
    name: "Accra Central",
    // south, west, north, east
    bbox: [5.525, -0.245, 5.585, -0.165],
  },
  lapaz: {
    id: "lapaz",
    name: "Lapaz",
    bbox: [5.595, -0.295, 5.665, -0.215],
  },
};
const ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const ROAD_TAGS = new Set([
  "motorway", "motorway_link", "trunk", "trunk_link", "primary",
  "primary_link", "secondary", "secondary_link", "tertiary",
  "tertiary_link", "unclassified", "residential", "living_street",
  "service", "road", "track",
]);

const inside = (lat, lon, [s, w, n, e]) =>
  lat >= s && lat <= n && lon >= w && lon <= e;

async function downloadOsm(area) {
  const [s, w, n, e] = area.bbox;
  const query = `[out:json][timeout:180];(way[highway](${s},${w},${n},${e}););out body geom;`;
  let lastError;
  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": "AccraRush/0.1 (OSM road-data import; contact: project maintainers)",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(210_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      if (!Array.isArray(data.elements)) throw new Error("Overpass response has no elements array");
      return { data, endpoint };
    } catch (error) {
      lastError = error;
      console.warn(`[OSM] ${endpoint} failed: ${error.message}`);
    }
  }
  throw new Error(`All Overpass endpoints failed: ${lastError?.message ?? "unknown error"}`);
}

function normalise(area, osm, endpoint) {
  const nodes = new Map();
  const edges = [];
  const ways = [];
  for (const way of osm.elements) {
    if (way.type !== "way" || !way.tags?.highway || !ROAD_TAGS.has(way.tags.highway)) continue;
    if (!Array.isArray(way.nodes) || !Array.isArray(way.geometry) ||
        way.nodes.length !== way.geometry.length || way.nodes.length < 2) continue;

    const tags = way.tags;
    const wayRecord = {
      id: String(way.id),
      highway: tags.highway,
      name: tags.name ?? null,
      ref: tags.ref ?? null,
      lanes: tags.lanes ? Number.parseInt(tags.lanes, 10) || null : null,
      maxspeed: tags.maxspeed ?? null,
      oneway: tags.oneway ?? "no",
      surface: tags.surface ?? null,
      access: tags.access ?? null,
    };
    ways.push(wayRecord);

    for (let i = 0; i < way.nodes.length; i++) {
      const nodeId = String(way.nodes[i]);
      const point = way.geometry[i];
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
      if (!nodes.has(nodeId)) nodes.set(nodeId, {
        id: nodeId, lat: point.lat, lon: point.lon,
      });
      if (i === 0) continue;
      const previous = way.geometry[i - 1];
      const current = point;
      const midpoint = {
        lat: (previous.lat + current.lat) / 2,
        lon: (previous.lon + current.lon) / 2,
      };
      if (!inside(midpoint.lat, midpoint.lon, area.bbox)) continue;
      const from = String(way.nodes[i - 1]);
      const to = nodeId;
      if (from === to) continue;
      const edgeId = `osm-way-${way.id}-segment-${i - 1}`;
      edges.push({
        id: edgeId,
        wayId: String(way.id),
        segmentIndex: i - 1,
        from,
        to,
        highway: tags.highway,
        name: tags.name ?? null,
        ref: tags.ref ?? null,
        lanes: wayRecord.lanes,
        maxspeed: wayRecord.maxspeed,
        oneway: wayRecord.oneway,
        surface: wayRecord.surface,
        access: wayRecord.access,
        direction: wayRecord.oneway === "yes" || wayRecord.oneway === "1" ? "forward"
          : wayRecord.oneway === "-1" ? "reverse" : "both",
      });
    }
  }

  const degree = new Map();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from).push(edge.to);
    adjacency.get(edge.to).push(edge.from);
  }
  const visited = new Set();
  const components = [];
  for (const nodeId of adjacency.keys()) {
    if (visited.has(nodeId)) continue;
    const stack = [nodeId];
    let count = 0;
    visited.add(nodeId);
    while (stack.length) {
      const current = stack.pop();
      count++;
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    components.push(count);
  }
  components.sort((a, b) => b - a);
  const inAreaNodeCount = [...nodes.values()].filter(n => inside(n.lat, n.lon, area.bbox)).length;
  const junctionNodeCount = [...degree.values()].filter(d => d >= 3).length;
  const isolatedRoadNodeCount = [...nodes.keys()].filter(id => !degree.has(id)).length;
  const report = {
    source: "OpenStreetMap",
    endpoint,
    importedAt: new Date().toISOString(),
    bbox: { south: area.bbox[0], west: area.bbox[1], north: area.bbox[2], east: area.bbox[3] },
    counts: {
      ways: ways.length, nodes: nodes.size, nodesInsideArea: inAreaNodeCount,
      segments: edges.length, junctionNodes: junctionNodeCount,
      connectedComponents: components.length, largestComponentNodes: components[0] ?? 0,
      isolatedRoadNodes: isolatedRoadNodeCount,
    },
    connectivity: {
      largestComponentShare: adjacency.size ? (components[0] ?? 0) / adjacency.size : 0,
      componentSizes: components,
    },
  };
  return {
    schemaVersion: 1,
    area: { id: area.id, name: area.name, bbox: report.bbox },
    attribution: "© OpenStreetMap contributors",
    licence: "Open Database Licence (ODbL) 1.0",
    source: { provider: "OpenStreetMap Overpass API", endpoint, importedAt: report.importedAt },
    nodes: [...nodes.values()],
    edges,
    ways,
    validation: report,
  };
}

function validate(area, graph) {
  const errors = [];
  if (graph.edges.length === 0) errors.push("No road segments were imported");
  if (graph.validation.counts.nodesInsideArea < 20) errors.push("Fewer than 20 road nodes fall inside the configured area");
  if (graph.validation.connectivity.largestComponentShare < 0.5) errors.push("Largest connected component covers less than 50% of graph nodes");
  for (const edge of graph.edges) {
    if (!graph.nodes.some(node => node.id === edge.from) || !graph.nodes.some(node => node.id === edge.to)) {
      errors.push(`Edge ${edge.id} references a missing node`);
      break;
    }
  }
  if (errors.length) {
    console.error(`[FAIL] ${area.name}: ${errors.join("; ")}`);
    return false;
  }
  console.log(`[PASS] ${area.name}: ${graph.validation.counts.ways} ways, ${graph.validation.counts.nodes} nodes, ${graph.validation.counts.segments} segments, ${graph.validation.counts.junctionNodes} junction nodes, ${graph.validation.counts.connectedComponents} components`);
  return true;
}

async function importArea(area) {
  console.log(`[OSM] Importing ${area.name}...`);
  const { data, endpoint } = await downloadOsm(area);
  const graph = normalise(area, data, endpoint);
  const passed = validate(area, graph);
  const outputDir = path.join(ROOT, "data", "areas", area.id);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "roads.json"), JSON.stringify(graph, null, 2) + "\n");
  await fs.writeFile(path.join(outputDir, "validation.json"), JSON.stringify({
    ...graph.validation,
    status: passed ? "STRUCTURAL_CHECKS_PASS" : "FAIL",
    acceptance: "OSM import and structural validation only; visual, route, Three.js and Android gameplay checks remain required.",
  }, null, 2) + "\n");
  if (!passed) process.exitCode = 1;
}

const requested = process.argv[2] ?? "all";
const selected = requested === "all" ? Object.values(AREAS) : [AREAS[requested]];
if (selected.some(area => !area)) {
  console.error(`Unknown area "${requested}". Choose: ${Object.keys(AREAS).join(", ")}, all`);
  process.exit(2);
}
for (const area of selected) await importArea(area);
