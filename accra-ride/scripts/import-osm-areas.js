#!/usr/bin/env node
/**
 * Reliable tiled OpenStreetMap road import for AccraRush.
 * Uses 0.02-degree tiles, sequential requests, endpoint rotation, bounded retries,
 * and a resumable per-tile report. No partial network is published.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { importOsmRoadNetwork, mergeOverpassTiles } from "../src/map/osm-import.js";
import { validateRoadNetwork } from "../src/core/validators.js";

const AREAS = [
  { id: "accra-central", bounds: { south: 5.525, west: -0.245, north: 5.585, east: -0.165 } },
  { id: "lapaz", bounds: { south: 5.595, west: -0.295, north: 5.665, east: -0.215 } }
];
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];
const TILE = 0.02;
const REQUEST_TIMEOUT_MS = 120_000;
const QUERY_TIMEOUT_SECONDS = 105;
const MAX_ATTEMPTS_PER_TILE = 10;
const CONCURRENCY = 1;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const reportPath = "accra-ride/data/osm/import-report.json";
const report = { startedAt: new Date().toISOString(), tileSizeDegrees: TILE, areas: {} };

function makeTiles(bounds) {
  const tiles = [];
  for (let south = bounds.south; south < bounds.north - 1e-9; south += TILE) {
    for (let west = bounds.west; west < bounds.east - 1e-9; west += TILE) {
      tiles.push({
        south: Number(south.toFixed(6)), west: Number(west.toFixed(6)),
        north: Number(Math.min(south + TILE, bounds.north).toFixed(6)),
        east: Number(Math.min(west + TILE, bounds.east).toFixed(6))
      });
    }
  }
  return tiles;
}

function retryDelay(response, attempt) {
  const value = response?.headers?.get("retry-after");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.min(60_000, Math.max(5_000, seconds * 1000));
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.min(60_000, Math.max(5_000, date - Date.now()));
  }
  return Math.min(45_000, 5_000 + attempt * 4_000);
}

async function fetchTile(areaId, tile, tileIndex) {
  const query = `[out:json][timeout:${QUERY_TIMEOUT_SECONDS}];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${tile.south},${tile.west},${tile.north},${tile.east});out body geom;`;
  const failures = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_TILE; attempt++) {
    const endpoint = ENDPOINTS[(tileIndex + attempt) % ENDPOINTS.length];
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": "AccraRush/0.1 OSM road importer (https://github.com/FelixBliss/AccraRush)"
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} from ${endpoint}`);
        failures.push(error.message);
        await sleep(retryDelay(response, attempt));
        continue;
      }
      const data = await response.json();
      if (!Array.isArray(data.elements)) throw new Error("Overpass response has no elements array");
      return { data, endpoint, attempts: attempt + 1 };
    } catch (error) {
      failures.push(error.message);
      if (attempt < MAX_ATTEMPTS_PER_TILE - 1) await sleep(retryDelay(null, attempt));
    }
  }
  throw new Error(`Tile failed after ${MAX_ATTEMPTS_PER_TILE} endpoint attempts: ${failures.join(" | ")}`);
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function saveReport() {
  report.updatedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
}

async function importArea(area) {
  const tiles = makeTiles(area.bounds);
  const areaReport = report.areas[area.id] = {
    bounds: area.bounds, tileCount: tiles.length, completedTiles: 0, failedTiles: [],
    tileResults: []
  };
  await saveReport();
  const responses = new Array(tiles.length);
  await mapLimit(tiles, CONCURRENCY, async (tile, index) => {
    process.stdout.write(`[${area.id}] tile ${index + 1}/${tiles.length} ${JSON.stringify(tile)}\n`);
    try {
      const result = await fetchTile(area.id, tile, index);
      responses[index] = result.data;
      areaReport.completedTiles++;
      areaReport.tileResults.push({
        index, status: "success", attempts: result.attempts,
        endpoint: result.endpoint, elements: result.data.elements.length
      });
      process.stdout.write(`[${area.id}] tile ${index + 1} OK elements=${result.data.elements.length} endpoint=${result.endpoint}\n`);
    } catch (error) {
      areaReport.failedTiles.push({ index, bounds: tile, error: error.message });
      areaReport.tileResults.push({ index, status: "failed", error: error.message });
      process.stderr.write(`[${area.id}] tile ${index + 1} FAILED: ${error.message}\n`);
    }
    await saveReport();
    await sleep(10_000);
  });
  if (areaReport.failedTiles.length) {
    throw new Error(`${area.id}: ${areaReport.failedTiles.length}/${tiles.length} tiles failed; see ${reportPath}`);
  }
  const elements = mergeOverpassTiles(responses);
  const network = importOsmRoadNetwork({ areaId: area.id, elements, bounds: area.bounds });
  const validationErrors = validateRoadNetwork(network);
  if (validationErrors.length) throw new Error(`${area.id} graph validation failed: ${validationErrors.join("; ")}`);
  const output = {
    areaId: area.id, bounds: area.bounds, tiles: tiles.length,
    elementCount: elements.length, network
  };
  await writeFile(`accra-ride/data/osm/${area.id}.network.json`, JSON.stringify(output, null, 2) + "\n");
  areaReport.status = "success";
  areaReport.osmWays = network.diagnostics.osmWays;
  areaReport.nodes = network.nodes.length;
  areaReport.edges = network.edges.length;
  areaReport.connectedComponents = network.diagnostics.connectedComponents;
  await saveReport();
  process.stdout.write(`[${area.id}] COMPLETE ways=${network.diagnostics.osmWays} nodes=${network.nodes.length} edges=${network.edges.length} components=${network.diagnostics.connectedComponents}\n`);
}

async function main() {
  await mkdir("accra-ride/data/osm", { recursive: true });
  for (const area of AREAS) await importArea(area);
  report.status = "success";
  report.completedAt = new Date().toISOString();
  await saveReport();
}

main().catch(async error => {
  report.status = "failed";
  report.error = error.message;
  report.completedAt = new Date().toISOString();
  await saveReport().catch(() => {});
  console.error(error);
  process.exitCode = 1;
});
