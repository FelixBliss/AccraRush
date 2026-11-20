import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildNavigationIndex, createRandomDirectedRoute, sampleDirectedRoute } from "../src/map/road-navigation.js";

for (const areaId of ["accra-central", "lapaz"]) {
  test(areaId + " generated OSM dataset supports real directed player and AI routes", async () => {
    const document = JSON.parse(await readFile(new URL("../data/osm/" + areaId + ".network.json", import.meta.url), "utf8"));
    const network = document.network;
    const index = buildNavigationIndex(network);
    const playerRoute = createRandomDirectedRoute(index, { stepCount: 100 });
    assert.ok(playerRoute.steps.length >= 50, "player route must traverse many real OSM edges");
    assert.ok(playerRoute.distanceM > 1000, "player route must span a meaningful driving distance");
    const playerPose = sampleDirectedRoute(playerRoute, playerRoute.distanceM * 0.4);
    assert.ok(playerPose && Number.isFinite(playerPose.x) && Number.isFinite(playerPose.z));
    assert.ok(network.edges.some(edge => edge.id === playerPose.edgeId));

    const aiStart = playerRoute.segments[Math.min(10, playerRoute.segments.length - 1)].fromNodeId;
    const aiRoute = createRandomDirectedRoute(index, { startNodeId: aiStart, stepCount: 60 });
    assert.ok(aiRoute.steps.length >= 30, "AI route must traverse real directed OSM edges");
    const aiPose = sampleDirectedRoute(aiRoute, Math.min(250, aiRoute.distanceM));
    assert.ok(aiPose && Number.isFinite(aiPose.headingRad));
    assert.ok(network.edges.some(edge => edge.id === aiPose.edgeId));
  });
}
