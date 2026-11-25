#!/usr/bin/env node
/**
 * Builds the Lapaz–Madina DEM profile from the public AWS Terrain Tiles SRTM
 * 1-arc-second HGT tile N05W001. No account or API key is required.
 */
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const NETWORK_PATH = "accra-ride/data/osm/lapaz.network.json";
const ROUTE_PATH = "accra-ride/data/osm/lapaz-madina-route.json";
const OUTPUT_PATH = "accra-ride/data/osm/lapaz-elevation.json";
const TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/skadi/N05/N05W001.hgt.gz";
const SIDE = 3601;
const EXPECTED_BYTES = SIDE * SIDE * 2;

async function loadTile() {
  const response = await fetch(TILE_URL);
  if (!response.ok) throw new Error("SRTM tile download failed: HTTP " + response.status);
  const compressed = Buffer.from(await response.arrayBuffer());
  const raw = gunzipSync(compressed);
  if (raw.length !== EXPECTED_BYTES) {
    throw new Error("Unexpected SRTM HGT size: " + raw.length + " bytes; expected " + EXPECTED_BYTES);
  }
  return raw;
}

function readSample(tile, row, column) {
  const r = Math.max(0, Math.min(SIDE - 1, row));
  const c = Math.max(0, Math.min(SIDE - 1, column));
  return tile.readInt16BE((r * SIDE + c) * 2);
}

function validOrNearest(tile, row, column) {
  const value = readSample(tile, row, column);
  if (value !== -32768) return value;
  for (let radius = 1; radius <= 6; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
        const candidate = readSample(tile, row + dr, column + dc);
        if (candidate !== -32768) return candidate;
      }
    }
  }
  throw new Error("SRTM void has no valid neighbour near row " + row + ", column " + column);
}

function sampleBilinear(tile, lat, lon) {
  if (!(lat >= 5 && lat <= 6 && lon >= -1 && lon <= 0)) {
    throw new Error("Lapaz–Madina coordinate falls outside SRTM tile N05W001: " + lat + "," + lon);
  }
  const row = (6 - lat) * 3600;
  const column = (lon + 1) * 3600;
  const r0 = Math.floor(row), c0 = Math.floor(column);
  const r1 = Math.min(SIDE - 1, r0 + 1), c1 = Math.min(SIDE - 1, c0 + 1);
  const fr = row - r0, fc = column - c0;
  const h00 = validOrNearest(tile, r0, c0), h01 = validOrNearest(tile, r0, c1);
  const h10 = validOrNearest(tile, r1, c0), h11 = validOrNearest(tile, r1, c1);
  const north = h00 * (1 - fc) + h01 * fc;
  const south = h10 * (1 - fc) + h11 * fc;
  return Number((north * (1 - fr) + south * fr).toFixed(2));
}

const networkDoc = JSON.parse(await readFile(NETWORK_PATH, "utf8"));
const route = JSON.parse(await readFile(ROUTE_PATH, "utf8"));
const nodeById = new Map(networkDoc.network.nodes.map(node => [node.id, node]));
const orderedIds = [route.startNodeId, ...route.steps.map(step => step.toNodeId)];
const routeNodeIds = [...new Set([
  ...orderedIds,
  ...route.returnSteps.map(step => step.fromNodeId),
  ...route.returnSteps.map(step => step.toNodeId)
])];
const tile = await loadTile();
const elevations = {};
for (const id of routeNodeIds) {
  const node = nodeById.get(id);
  if (!node?.osm || !Number.isFinite(node.osm.lat) || !Number.isFinite(node.osm.lon)) continue;
  elevations[id] = sampleBilinear(tile, node.osm.lat, node.osm.lon);
}
if (Object.keys(elevations).length < 20) throw new Error("Too few route nodes received DEM samples");
const values = Object.values(elevations);
const baseElevationM = Math.min(...values);
const profile = {
  schemaVersion: 1,
  routeId: route.routeId,
  source: {
    dataset: "SRTM 1 arc-second (approximately 30 m) via AWS Open Data Terrain Tiles",
    tile: "N05W001.hgt",
    url: TILE_URL,
    verticalDatum: "EGM96 geoid",
    sampleMethod: "bilinear interpolation",
    voidHandling: "nearest valid sample within 6 cells",
    attribution: "NASA Shuttle Radar Topography Mission; AWS Open Data mirror"
  },
  baseElevationM,
  statistics: {
    sampleCount: values.length,
    minElevationM: Math.min(...values),
    maxElevationM: Math.max(...values),
    elevationRangeM: Math.max(...values) - Math.min(...values)
  },
  elevations
};
await writeFile(OUTPUT_PATH, JSON.stringify(profile) + "\n");
console.log("Lapaz–Madina SRTM profile:", JSON.stringify(profile.statistics));
