import test from "node:test";
import assert from "node:assert/strict";
import { validateRoadNetwork, validateRoute, validateVehicleState, validateMatch } from "../src/core/validators.js";
import { createGameEventBus } from "../src/core/event-bus.js";
import { GAME_EVENTS, WORLD_UNITS } from "../src/core/constants.js";

const network = () => ({
  id: "accra-test",
  version: 1,
  nodes: [
    { id: "circle", position: { x: 0, y: 0, z: 0 } },
    { id: "kaneshie", position: { x: 0, y: 0, z: 100 } },
    { id: "achimota", position: { x: 0, y: 0, z: 200 } },
  ],
  edges: [
    { id: "e1", fromNodeId: "circle", toNodeId: "kaneshie", lengthM: 100, centerline: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 100 }], lanes: [{ id: "e1-f", direction: "forward", widthM: 3.5 }, { id: "e1-r", direction: "reverse", widthM: 3.5 }] },
    { id: "e2", fromNodeId: "kaneshie", toNodeId: "achimota", lengthM: 100, centerline: [{ x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 200 }], lanes: [{ id: "e2-f", direction: "forward", widthM: 3.5 }] },
  ],
});

const route = () => ({
  id: "route-1",
  networkId: "accra-test",
  startNodeId: "circle",
  destinationNodeId: "achimota",
  steps: [
    { edgeId: "e1", laneId: "e1-f", direction: "forward" },
    { edgeId: "e2", laneId: "e2-f", direction: "forward" },
  ],
});

const match = () => ({
  id: "match-1",
  status: "racing",
  competitors: [
    { id: "player", status: "toPickup", passenger: { id: "passenger-player", pickupNodeId: "circle", destinationNodeId: "achimota" } },
    { id: "ai-1", status: "toPickup", passenger: { id: "passenger-ai", pickupNodeId: "circle", destinationNodeId: "achimota" } },
  ],
});

test("canonical world units and event names are immutable", () => {
  assert.deepEqual(WORLD_UNITS, { distance: "metres", speed: "metres-per-second", acceleration: "metres-per-second-squared", angle: "radians" });
  assert.equal(Object.isFrozen(WORLD_UNITS), true);
  assert.equal(Object.isFrozen(GAME_EVENTS), true);
});

test("valid road graph accepts stable nodes, connected edges and directional lanes", () => {
  assert.deepEqual(validateRoadNetwork(network()), []);
});

test("road graph rejects duplicate node, edge and lane identities", () => {
  const graph = network();
  graph.nodes.push({ id: "circle", position: { x: 1, y: 0, z: 1 } });
  graph.edges.push({ ...graph.edges[0] });
  const errors = validateRoadNetwork(graph);
  assert.ok(errors.some((error) => error.includes('node id "circle" is duplicated')));
  assert.ok(errors.some((error) => error.includes('edge id "e1" is duplicated')));
  assert.ok(errors.some((error) => error.includes('lane id "e1-f" is duplicated')));
});

test("road graph rejects dangling endpoints and non-finite geometry", () => {
  const graph = network();
  graph.edges[0].toNodeId = "missing";
  graph.edges[0].centerline[1].z = Number.NaN;
  const errors = validateRoadNetwork(graph);
  assert.ok(errors.some((error) => error.includes("unknown endpoint")));
  assert.ok(errors.some((error) => error.includes("finite centreline points")));
});

test("route accepts a continuous sequence of directed edges", () => {
  assert.deepEqual(validateRoute(route(), network()), []);
});

test("route rejects disconnected steps and lanes facing the wrong way", () => {
  const invalid = route();
  invalid.steps[1] = { edgeId: "e2", laneId: "e2-f", direction: "reverse" };
  const errors = validateRoute(invalid, network());
  assert.ok(errors.some((error) => error.includes("disconnected")));
  assert.ok(errors.some((error) => error.includes("lane direction")));
});

test("route rejects unknown start nodes and malformed networks", () => {
  const invalid = route();
  invalid.startNodeId = "not-a-node";
  const graph = network();
  graph.edges[0].fromNodeId = "orphan";
  const errors = validateRoute(invalid, graph);
  assert.ok(errors.some((error) => error.includes("startNodeId does not exist")));
  assert.ok(errors.some((error) => error.includes("network: edge")));
});

test("vehicle contract rejects negative speed and invalid dimensions", () => {
  const errors = validateVehicleState({
    id: "taxi-1", vehicleType: "corolla", currentEdgeId: "e1", currentLaneId: "e1-f",
    position: { x: 0, y: 0, z: 0 }, headingRad: 0, speedMps: -2, accelerationMps2: 0,
    dimensions: { lengthM: 0, widthM: 1.8 }, gear: "D",
  });
  assert.ok(errors.some((error) => error.includes("cannot be negative")));
  assert.ok(errors.some((error) => error.includes("positive lengthM")));
});

test("match requires independent passenger instances for equivalent journeys", () => {
  assert.deepEqual(validateMatch(match()), []);
  const invalid = match();
  invalid.competitors[1].passenger.id = invalid.competitors[0].passenger.id;
  assert.ok(validateMatch(invalid).some((error) => error.includes("distinct passenger instance")));
});

test("completed match requires one delivered winner", () => {
  const invalid = match();
  invalid.status = "completed";
  invalid.winnerId = "player";
  assert.ok(validateMatch(invalid).some((error) => error.includes("exactly one delivered winner")));
  invalid.competitors[0].status = "delivered";
  assert.deepEqual(validateMatch(invalid), []);
});

test("match rejects multiple delivered competitors and premature winner assignment", () => {
  const invalid = match();
  invalid.winnerId = "player";
  assert.ok(validateMatch(invalid).some((error) => error.includes("only be set when the match is completed")));
  invalid.status = "completed";
  invalid.competitors[0].status = "delivered";
  invalid.competitors[1].status = "delivered";
  assert.ok(validateMatch(invalid).some((error) => error.includes("only one delivered winner")));
});

test("event bus validates event names, supports unsubscribe and clear", () => {
  const bus = createGameEventBus();
  let calls = 0;
  const unsubscribe = bus.on("match:started", () => { calls += 1; });
  bus.emit("match:started", { matchId: "match-1" });
  unsubscribe();
  bus.emit("match:started", { matchId: "match-2" });
  assert.equal(calls, 1);
  bus.on("match:started", () => { calls += 1; });
  bus.clear();
  bus.emit("match:started", {});
  assert.equal(calls, 1);
  assert.throws(() => bus.on("unknown:event", () => {}), /Unknown game event/);
  assert.throws(() => bus.emit("unknown:event", {}), /Unknown game event/);
});
