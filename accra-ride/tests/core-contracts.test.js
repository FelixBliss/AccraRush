import test from "node:test";
import assert from "node:assert/strict";
import { validateRoadNetwork, validateRoute, validateVehicleState, validateMatch } from "../src/core/validators.js";
import { createGameEventBus } from "../src/core/event-bus.js";

const network = {
  id: "accra-test-network",
  version: 1,
  nodes: [
    { id: "A", position: { x: 0, y: 0, z: 0 } },
    { id: "B", position: { x: 0, y: 0, z: -100 } },
    { id: "C", position: { x: 40, y: 0, z: -140 } },
  ],
  edges: [
    { id: "AB", fromNodeId: "A", toNodeId: "B", lengthM: 100, centerline: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -100 }], lanes: [{ id: "AB-F", direction: "forward", widthM: 3.5 }] },
    { id: "BC", fromNodeId: "B", toNodeId: "C", lengthM: 56.6, centerline: [{ x: 0, y: 0, z: -100 }, { x: 40, y: 0, z: -140 }], lanes: [{ id: "BC-F", direction: "forward", widthM: 3.5 }] },
  ],
};

test("accepts a road network with stable IDs and finite geometry", () => {
  assert.deepEqual(validateRoadNetwork(network), []);
});

test("rejects duplicate IDs and missing road endpoints", () => {
  const invalid = structuredClone(network);
  invalid.nodes.push({ id: "A", position: { x: 1, y: 0, z: 1 } });
  invalid.edges[0].toNodeId = "missing";
  assert.ok(validateRoadNetwork(invalid).length >= 2);
});

test("accepts a connected route and rejects a disconnected route", () => {
  const route = { id: "route-1", networkId: network.id, startNodeId: "A", destinationNodeId: "C", steps: [{ edgeId: "AB", direction: "forward", laneId: "AB-F" }, { edgeId: "BC", direction: "forward", laneId: "BC-F" }] };
  assert.deepEqual(validateRoute(route, network), []);
  const disconnected = { ...route, steps: [{ edgeId: "BC", direction: "forward", laneId: "BC-F" }] };
  assert.ok(validateRoute(disconnected, network).some((error) => error.includes("disconnected")));
});

test("validates a vehicle using SI units and positive dimensions", () => {
  const vehicle = { id: "player-1", vehicleType: "taxi", position: { x: 0, y: 0, z: 0 }, headingRad: 0, speedMps: 12, accelerationMps2: 1, currentEdgeId: "AB", currentLaneId: "AB-F", gear: "D", dimensions: { lengthM: 4.58, widthM: 2.08 } };
  assert.deepEqual(validateVehicleState(vehicle), []);
  assert.ok(validateVehicleState({ ...vehicle, speedMps: -4 }).some((error) => error.includes("cannot be negative")));
});

test("requires separate passenger instances for equivalent race objectives", () => {
  const match = { id: "match-1", status: "racing", competitors: [
    { id: "player", status: "toPickup", passenger: { id: "passenger-player", pickupNodeId: "A", destinationNodeId: "C" } },
    { id: "ai-1", status: "toPickup", passenger: { id: "passenger-ai", pickupNodeId: "A", destinationNodeId: "C" } },
  ] };
  assert.deepEqual(validateMatch(match), []);
  match.competitors[1].passenger.id = "passenger-player";
  assert.ok(validateMatch(match).some((error) => error.includes("distinct passenger")));
});

test("event bus dispatches and supports unsubscribe", () => {
  const bus = createGameEventBus();
  let count = 0;
  const off = bus.on("match:started", () => count++);
  bus.emit("match:started", { matchId: "m1" });
  off();
  bus.emit("match:started", { matchId: "m1" });
  assert.equal(count, 1);
  assert.throws(() => bus.on("unknown:event", () => {}), /Unknown game event/);
});
