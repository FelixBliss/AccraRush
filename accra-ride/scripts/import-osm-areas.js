#!/usr/bin/env node
/**
 * Build both AccraRush road networks from one Geofabrik Ghana PBF extract.
 * Osmium performs bounded complete-way extracts locally; no Overpass requests.
 */
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { importOsmRoadNetwork, mergeOsmElements } from "../src/map/osm-import.js";
import { validateRoadNetwork } from "../src/core/validators.js";

const AREAS = [
  { id: "accra-central", bounds: { south: 5.525, west: -0.245, north: 5.585, east: -0.165 } },
  { id: "lapaz", bounds: { south: 5.595, west: -0.295, north: 5.665, east: -0.215 } }
];
const PBF = process.env.OSM_PBF_PATH || "accra-ride/data/osm/ghana-latest.osm.pbf";
const OUT = "accra-ride/data/osm";
const report = {
  source: { provider: "Geofabrik", url: "https://download.geofabrik.de/africa/ghana-latest.osm.pbf", format: "OSM PBF" },
  startedAt: new Date().toISOString(),
  areas: {}
};

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(command + " " + args.join(" ") + " failed (exit " + result.status + "): " + (result.stderr || result.stdout));
  }
  return result.stdout;
}

async function readGeoJsonSeq(path) {
  const source = await readFile(path, "utf8");
  const elements = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim().replace(/^\u001e/, "");
    if (!line) continue;
    const feature = JSON.parse(line);
    if (feature.geometry?.type !== "LineString" || !Array.isArray(feature.geometry.coordinates)) continue;
    const props = feature.properties ?? {};
    if (!props.highway) continue;
    const rawId = props["@id"] ?? feature.id ?? props.id;
    if (rawId == null) throw new Error("Osmium GeoJSONSeq feature is missing its OSM ID");
    const id = String(rawId).replace(/^(way|node|relation)\//, "");
    const geometry = feature.geometry.coordinates
      .filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
      .map(([lon, lat]) => ({ lat, lon }));
    if (geometry.length < 2) continue;
    const tags = Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith("@") && key !== "id"));
    elements.push({ type: "way", id, tags, geometry });
  }
  return elements;
}

async function saveReport() {
  report.updatedAt = new Date().toISOString();
  await writeFile(OUT + "/import-report.json", JSON.stringify(report, null, 2) + "\n");
}

async function importArea(area) {
  const bounds = area.bounds;
  const bbox = [bounds.west, bounds.south, bounds.east, bounds.north].join(",");
  const extractPath = OUT + "/" + area.id + ".osm.pbf";
  const geojsonPath = OUT + "/" + area.id + ".geojsonseq";
  process.stdout.write("[" + area.id + "] extracting complete OSM ways from Ghana PBF\n");
  run("osmium", ["extract", "-b", bbox, "--strategy=complete_ways", "--overwrite", "-o", extractPath, PBF]);
  run("osmium", ["export", "-f", "geojsonseq", "--add-unique-id=type_id", "--overwrite", "-o", geojsonPath, extractPath]);

  const elements = await readGeoJsonSeq(geojsonPath);
  const uniqueElements = mergeOsmElements([{ elements }]);
  const network = importOsmRoadNetwork({ areaId: area.id, elements: uniqueElements, bounds });
  const validationErrors = validateRoadNetwork(network);
  if (validationErrors.length) {
    throw new Error(area.id + " graph validation failed: " + validationErrors.join("; "));
  }

  const output = {
    areaId: area.id,
    bounds,
    source: report.source,
    elementCount: uniqueElements.length,
    network
  };
  await writeFile(OUT + "/" + area.id + ".network.json", JSON.stringify(output, null, 2) + "\n");

  const diagnostics = {
    status: "success",
    bounds,
    osmWays: network.diagnostics.osmWays,
    nodes: network.nodes.length,
    edges: network.edges.length,
    connectedComponents: network.diagnostics.connectedComponents,
    junctions: network.diagnostics.junctionNodeCount,
    deadEnds: network.diagnostics.deadEndNodeCount,
    highwayClassCounts: network.diagnostics.highwayClassCounts
  };
  report.areas[area.id] = diagnostics;
  await saveReport();
  process.stdout.write("[" + area.id + "] COMPLETE ways=" + diagnostics.osmWays +
    " nodes=" + diagnostics.nodes + " edges=" + diagnostics.edges +
    " components=" + diagnostics.connectedComponents + "\n");
}

async function main() {
  await mkdir(OUT, { recursive: true });
  run("osmium", ["fileinfo", PBF]);
  const pbfStat = await stat(PBF);
  report.source.pbfBytes = pbfStat.size;
  report.source.pbfSha256 = await sha256File(PBF);
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
