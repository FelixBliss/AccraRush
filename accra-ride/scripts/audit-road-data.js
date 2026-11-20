#!/usr/bin/env node
/**
 * RD-01 read-only audit of the committed OSM road-network datasets.
 * Does not mutate source datasets or infer missing OSM tags.
 */
import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../data/osm/", import.meta.url);
const AREAS = ["accra-central", "lapaz"];
const round = value => Number(value.toFixed(3));
const histogram = values => values.reduce((out, value) => {
  const key = String(value);
  out[key] = (out[key] || 0) + 1;
  return out;
}, {});
const pointKey = p => [p.x,p.y,p.z].map(v => Number(v).toFixed(3)).join(",");
function canonicalGeometry(points) {
  const forward = points.map(pointKey).join(";");
  const reverse = [...points].reverse().map(pointKey).join(";");
  return forward < reverse ? forward : reverse;
}

export function auditRoadNetwork(document) {
  const network = document?.network;
  if (!network || !Array.isArray(network.nodes) || !Array.isArray(network.edges)) {
    throw new Error("Dataset must contain network.nodes and network.edges arrays");
  }
  const edges = network.edges;
  const nodes = network.nodes;
  const classCounts = {};
  const laneRecordCounts = [];
  const laneDirectionPatterns = {};
  const directionalWidthSums = [];
  const retainedTagCounts = {};
  const oneWayCounts = {};
  const geometryPointCounts = [];
  const yValues = [];
  const geometryKeys = new Map();
  const wayIds = new Set();
  let exactDuplicateGeometryEdges = 0;
  const sampleEdgesByClass = {};
  const sampleEdgesByLanePattern = {};
  const sampleEdgesByOneWay = {};
  let edgesWithSummedWidthUnder3m = 0;
  let missingOsmMetadata = 0;
  let missingCenterlines = 0;
  let totalGeometryPoints = 0;
  let totalLaneRecords = 0;

  for (const edge of edges) {
    const osm = edge.osm || {};
    const highway = osm.highway || "unknown";
    classCounts[highway] = (classCounts[highway] || 0) + 1;
    if (osm.wayId != null) wayIds.add(String(osm.wayId));
    if (!osm.highway || osm.wayId == null) missingOsmMetadata++;
    if (osm.oneway != null) oneWayCounts[String(osm.oneway)] = (oneWayCounts[String(osm.oneway)] || 0) + 1;
    for (const key of ["name","ref","surface","maxspeed","oneway","highway","wayId"]) {
      if (osm[key] != null && osm[key] !== "") retainedTagCounts[key] = (retainedTagCounts[key] || 0) + 1;
    }

    const lanes = Array.isArray(edge.lanes) ? edge.lanes : [];
    laneRecordCounts.push(lanes.length);
    totalLaneRecords += lanes.length;
    const directions = lanes.map(lane => lane.direction).sort();
    const pattern = directions.join("+") || "none";
    laneDirectionPatterns[pattern] = (laneDirectionPatterns[pattern] || 0) + 1;
    const summedWidth = round(lanes.reduce((sum,lane) => sum + (Number.isFinite(lane.widthM) ? lane.widthM : 0),0));
    directionalWidthSums.push(summedWidth);
    if (summedWidth > 0 && summedWidth < 3) edgesWithSummedWidthUnder3m++;
    const sample = { edgeId: edge.id, osmWayId: osm.wayId ?? null, highway, name: osm.name ?? null, ref: osm.ref ?? null, oneway: osm.oneway ?? null, laneRecords: lanes.map(lane => ({ direction: lane.direction, widthM: lane.widthM })), summedDirectionalWidthM: summedWidth, lengthM: edge.lengthM, centerlinePointCount: Array.isArray(edge.centerline) ? edge.centerline.length : 0 };
    if (!sampleEdgesByClass[highway]) sampleEdgesByClass[highway] = sample;
    if (!sampleEdgesByLanePattern[pattern]) sampleEdgesByLanePattern[pattern] = sample;
    if (osm.oneway != null && !sampleEdgesByOneWay[String(osm.oneway)]) sampleEdgesByOneWay[String(osm.oneway)] = sample;

    const points = Array.isArray(edge.centerline) ? edge.centerline : [];
    geometryPointCounts.push(points.length);
    totalGeometryPoints += points.length;
    if (points.length < 2) { missingCenterlines++; continue; }
    for (const point of points) if (Number.isFinite(point.y)) yValues.push(point.y);
    const key = canonicalGeometry(points);
    if (geometryKeys.has(key)) {
      exactDuplicateGeometryEdges++;
      geometryKeys.set(key, geometryKeys.get(key) + 1);
    } else geometryKeys.set(key, 1);
  }

  const uniqueGeometry = geometryKeys.size;
  const sortedY = [...yValues].sort((a,b)=>a-b);
  const minY = sortedY.length ? sortedY[0] : null;
  const maxY = sortedY.length ? sortedY[sortedY.length-1] : null;
  return {
    areaId: document.areaId || network.id,
    source: network.source?.provider || null,
    projection: network.projection?.type || null,
    bounds: document.bounds || network.source?.bounds || null,
    counts: {
      sourceElements: Number.isFinite(document.elementCount) ? document.elementCount : null,
      nodes: nodes.length,
      edges: edges.length,
      uniqueOsmWayIds: wayIds.size,
      laneRecords: totalLaneRecords,
      centerlineGeometryPoints: totalGeometryPoints,
      edgesMissingCenterline: missingCenterlines,
      edgesMissingCoreOsmMetadata: missingOsmMetadata,
      exactDuplicateCenterlineEdges: exactDuplicateGeometryEdges
    },
    roadClasses: classCounts,
    laneModel: {
      laneRecordsPerEdge: histogram(laneRecordCounts),
      directionalRecordPatterns: laneDirectionPatterns,
      summedDirectionalWidthMetres: histogram(directionalWidthSums),
      interpretation: "Lane records describe directional movement/width in the current importer; they are not guaranteed to represent one individual traffic lane each."
    },
    retainedOsmMetadata: {
      fieldPresenceCounts: retainedTagCounts,
      oneWayValues: oneWayCounts,
      knownNotPreservedByCurrentImporter: [
        "lanes:forward","lanes:backward","lanes","width","bridge","tunnel","layer",
        "junction","sidewalk","cycleway","access","service","smoothness","maxspeed:advisory"
      ]
    },
    geometry: {
      centerlinePointsPerEdge: {
        min: geometryPointCounts.length ? Math.min(...geometryPointCounts) : 0,
        max: geometryPointCounts.length ? Math.max(...geometryPointCounts) : 0,
        average: edges.length ? round(totalGeometryPoints / edges.length) : 0
      },
      worldY: { min: minY, max: maxY, distinctValues: new Set(yValues).size },
      elevationInterpretation: minY === 0 && maxY === 0
        ? "All sampled road centreline vertices are at y=0; the committed network contains no vertical road profile."
        : "Non-zero vertical coordinates exist; their provenance must be checked before treating them as terrain elevation."
    },
    physicalRoadModel: {
      explicitCarriagewayIdentity: false,
      explicitIndividualLaneCenterlines: false,
      explicitMedianGeometry: false,
      interpretation: "The committed graph does not expose a canonical physical-road/carriageway object or explicit median geometry. These must be designed in RD-02/RD-03 rather than guessed by the renderer."
    },
    representativeEdgeFixtures: { byHighwayClass: sampleEdgesByClass, byLaneDirectionPattern: sampleEdgesByLanePattern, byOneWayTag: sampleEdgesByOneWay },
    existingImporterDiagnostics: network.diagnostics || null
  };
}

async function main() {
  const report = {
    audit: "AccraRush RD-01 committed OSM road-data audit",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    areas: {}
  };
  for (const area of AREAS) {
    const path = new URL(area + ".network.json", ROOT);
    const document = JSON.parse(await readFile(path, "utf8"));
    report.areas[area] = auditRoadNetwork(document);
  }
  const output = new URL("road-data-audit.json", ROOT);
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
