import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const routeUrl = new URL("../data/osm/lapaz-madina-route.json", import.meta.url);
const sectionsUrl = new URL("../data/osm/lapaz-madina-sections.json", import.meta.url);
const networkUrl = new URL("../data/osm/lapaz.network.json", import.meta.url);
const masterRouteBlobSha = "7001ebe510b3253a9d373b9be887c1c4dfef0006";
const masterSectionsBlobSha = "4d32154a74e508c86f90f4f099d7b92dad61d986";

function gitBlobSha(bytes) {
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest("hex");
}

function assertContinuous(steps, startNodeId, endNodeId, label) {
  assert.ok(steps.length > 0, `${label} must contain route steps`);
  assert.equal(steps[0].fromNodeId, startNodeId, `${label} must start at its declared node`);
  assert.equal(steps.at(-1).toNodeId, endNodeId, `${label} must end at its declared node`);
  for (let index = 1; index < steps.length; index++) {
    assert.equal(
      steps[index - 1].toNodeId,
      steps[index].fromNodeId,
      `${label} is disconnected between steps ${index} and ${index + 1}`
    );
  }
}

test("Lapaz–Madina route and sections remain byte-identical to accepted master", async () => {
  const [routeBytes, sectionsBytes] = await Promise.all([
    readFile(routeUrl),
    readFile(sectionsUrl)
  ]);
  assert.equal(gitBlobSha(routeBytes), masterRouteBlobSha,
    "Do not change the accepted master route manifest without an explicit route-owner decision");
  assert.equal(gitBlobSha(sectionsBytes), masterSectionsBlobSha,
    "Route sections must remain aligned to the complete accepted master corridor");
});

test("approved Lapaz–Madina outbound and return paths remain complete and connected", async () => {
  const [routeBytes, networkBytes] = await Promise.all([
    readFile(routeUrl),
    readFile(networkUrl)
  ]);
  const route = JSON.parse(routeBytes.toString("utf8"));
  const networkDocument = JSON.parse(networkBytes.toString("utf8"));
  const network = networkDocument.network ?? networkDocument;
  const networkEdgeIds = new Set((network.edges ?? []).map(edge => edge.id));

  assert.equal(route.startNodeId, "osm-node-5.6095021_-0.2507127");
  assert.equal(route.endNodeId, "osm-node-5.6732173_-0.1661282");
  assert.equal(route.distanceM, 18738);
  assert.equal(route.stepCount, 125);
  assert.equal(route.returnDistanceM, 16716);
  assert.equal(route.returnStepCount, 112);
  assert.equal(route.routeReference.distanceKm, 18.7);
  assert.ok(route.namedRoads.includes("Mampon Okai Avenue"));
  assert.ok(route.returnNamedRoads.includes("Mampon Okai Avenue"));

  assert.deepEqual(route.steps.slice(0, 5).map(step => step.edgeId), [
    "osm-way-w509040213-segment-0",
    "osm-way-w509040213-segment-1",
    "osm-way-w42781657-segment-0",
    "osm-way-w42781657-segment-1",
    "osm-way-w42781657-segment-2"
  ]);
  assert.deepEqual(route.returnSteps.slice(-5).map(step => step.edgeId), [
    "osm-way-w42781657-segment-2",
    "osm-way-w42781657-segment-1",
    "osm-way-w42781657-segment-0",
    "osm-way-w509040213-segment-1",
    "osm-way-w509040213-segment-0"
  ]);

  assertContinuous(route.steps, route.startNodeId, route.endNodeId, "Outbound route");
  assertContinuous(route.returnSteps, route.endNodeId, route.startNodeId, "Return route");
  for (const step of [...route.steps, ...route.returnSteps]) {
    assert.ok(networkEdgeIds.has(step.edgeId), `Route edge ${step.edgeId} must exist in the selected OSM network`);
  }
});
