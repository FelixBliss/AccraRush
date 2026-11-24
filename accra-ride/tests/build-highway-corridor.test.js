import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const EXPECTED = ["Lapaz", "Akweteyman", "Achimota", "Abofu", "Dzorwulu", "Airport Junction",
  "Tetteh Quarshie", "Shiashie", "Okponglo", "Legon", "Madina"];

test("Lapaz–Madina route follows all approved checkpoints in order on legal OSM lanes", async () => {
  const sourceDoc = await readJson("../data/osm/lapaz.network.json");
  const route = await readJson("../data/osm/lapaz-madina-route.json");
  const source = sourceDoc.network;
  assert.equal(route.routeId, "lapaz-madina-highway");
  assert.equal(route.closed, false, "this is a point-to-point corridor, not a racing loop");
  assert.deepEqual(route.waypoints.map(point => point.name), EXPECTED);
  assert.equal(route.startNodeId, route.waypoints[0].nodeId);
  assert.equal(route.endNodeId, route.waypoints.at(-1).nodeId);
  assert.ok(route.distanceM > 5000 && route.distanceM < 40000, "route distance must be plausible for the corridor");
  assert.ok(route.steps.length >= 20, "route must contain real road segments, not a straight line");
  assert.ok(route.waypoints.every(point => point.snapDistanceM <= 1400), "every checkpoint must snap near mapped roads");

  const edges = new Map(source.edges.map(edge => [edge.id, edge]));
  const nodes = new Set(source.nodes.map(node => node.id));
  let current = route.startNodeId;
  let distanceM = 0;
  for (const [index, step] of route.steps.entries()) {
    assert.equal(step.fromNodeId, current, "step " + index + " must join the previous step");
    assert.ok(nodes.has(step.fromNodeId) && nodes.has(step.toNodeId), "step endpoints must exist in OSM network");
    const edge = edges.get(step.edgeId);
    assert.ok(edge, "step " + index + " must reference a source OSM edge");
    const lane = edge.lanes.find(item => item.id === step.laneId);
    assert.ok(lane, "step " + index + " must reference a source lane");
    assert.ok(lane.direction === "both" || lane.direction === step.direction || (step.direction === "reverse" && lane.direction === "backward"),
      "step " + index + " must respect legal lane direction");
    assert.equal(step.direction === "forward" ? edge.fromNodeId : edge.toNodeId, step.fromNodeId);
    assert.equal(step.direction === "forward" ? edge.toNodeId : edge.fromNodeId, step.toNodeId);
    current = step.toNodeId;
    distanceM += edge.lengthM;
  }
  assert.equal(current, route.endNodeId);
  assert.ok(Math.abs(distanceM - route.distanceM) <= 2, "manifest distance must match source edge geometry");

  for (const [index, waypoint] of route.waypoints.entries()) {
    assert.ok(Number.isInteger(waypoint.afterStep) && waypoint.afterStep >= 0 && waypoint.afterStep <= route.steps.length);
    if (index === 0) continue;
    assert.equal(route.steps[waypoint.afterStep - 1]?.toNodeId, waypoint.nodeId,
      waypoint.name + " must be reached at its recorded checkpoint position");
  }
});
