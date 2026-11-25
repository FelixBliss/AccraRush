import test from "node:test";
import assert from "node:assert/strict";
import { buildBusStopAccessEdges, buildPickupAccessEdges } from "../src/map/roadside-access.js";

test("bus stop creates a connected one-way asphalt lay-by with entry and exit tapers", () => {
  const network = { edges: [{
    id: "main-edge", fromNodeId: "a", toNodeId: "b",
    osm: { highway: "primary", name: "Main Road" },
    lanes: [{ id: "f", direction: "forward", widthM: 3.5 }, { id: "r", direction: "reverse", widthM: 3.5 }],
    centerline: [{ x: 0, y: 10, z: 0 }, { x: 0, y: 10, z: -100 }]
  }] };
  const result = buildBusStopAccessEdges(network, [{
    id: "stop-1", kind: "bus_stop", edgeId: "main-edge", side: -1,
    roadAnchor: { x: 0, y: 10, z: -50, alongM: 50 }
  }]);
  assert.equal(result.edges.length, 1);
  const bay = result.edges[0];
  assert.equal(bay.fromNodeId, "a");
  assert.equal(bay.toNodeId, "b");
  assert.equal(bay.selection.role, "bus-stop-bay");
  assert.equal(bay.facility.entryTaperM, 12);
  assert.equal(bay.facility.bayLengthM, 28);
  assert.equal(bay.facility.exitTaperM, 12);
  assert.equal(bay.lanes[0].direction, "forward");
  assert.ok(bay.lengthM > 100);
  assert.deepEqual(bay.centerline[0], network.edges[0].centerline[0]);
  assert.deepEqual(bay.centerline.at(-1), network.edges[0].centerline.at(-1));
  const maxOffset = Math.max(...bay.centerline.map(point => Math.abs(point.x)));
  assert.ok(maxOffset > 6.5, "lay-by must sit beyond the carriageway and shoulder");
  assert.equal(result.report.drivableEntryExitConnections, 2);
});

test("short junction segments and duplicate stops do not create overlapping bus bays", () => {
  const network = { edges: [{
    id: "short-edge", fromNodeId: "a", toNodeId: "b", osm: { highway: "tertiary" },
    lanes: [{ id: "f", direction: "forward", widthM: 3.5 }],
    centerline: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -20 }]
  }] };
  const feature = { id: "stop", kind: "bus_stop", edgeId: "short-edge", side: "right", roadAnchor: { alongM: 10 } };
  const result = buildBusStopAccessEdges(network, [feature, { ...feature, id: "stop-duplicate" }]);
  assert.equal(result.edges.length, 0);
  assert.equal(result.report.skipped.shortEdge, 2);
});

test("taxi-rank pickup zones create a separate shorter connected drop-off bay", () => {
  const network = { edges: [{
    id: "pickup-source", fromNodeId: "n1", toNodeId: "n2",
    osm: { highway: "secondary", name: "Connector Road" },
    lanes: [{ id: "f", direction: "forward", widthM: 3.5 }, { id: "r", direction: "reverse", widthM: 3.5 }],
    centerline: [{ x: 0, y: 4, z: 0 }, { x: 0, y: 4, z: -90 }]
  }] };
  const result = buildPickupAccessEdges(network, [{
    id: "taxi-rank-1", kind: "pickup_zone", edgeId: "pickup-source", side: 1,
    roadAnchor: { x: 0, y: 4, z: -45, alongM: 45 }
  }]);
  assert.equal(result.edges.length, 1);
  const bay = result.edges[0];
  assert.equal(bay.selection.role, "pickup-bay");
  assert.equal(bay.facility.type, "pickup-dropoff-bay");
  assert.equal(bay.facility.bayLengthM, 18);
  assert.equal(bay.lanes[0].direction, "reverse");
  assert.equal(bay.fromNodeId, "n1");
  assert.equal(bay.toNodeId, "n2");
  assert.ok(bay.lengthM > 90);
  assert.equal(result.report.drivableEntryExitConnections, 2);
});

test("pickup bays do not overlap an existing bus-stop bay on the same source edge", () => {
  const network = { edges: [
    { id: "source", fromNodeId: "a", toNodeId: "b", osm: { highway: "primary" },
      lanes: [{ id: "f", direction: "forward", widthM: 3.5 }],
      centerline: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -90 }] },
    { id: "bus-bay", fromNodeId: "a", toNodeId: "b", lengthM: 90,
      selection: { role: "bus-stop-bay", sourceEdgeId: "source" }, facility: { side: -1 },
      lanes: [{ id: "bus", direction: "forward", widthM: 3.5 }],
      centerline: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -90 }] }
  ] };
  const result = buildPickupAccessEdges(network, [{
    id: "pickup", kind: "pickup_zone", edgeId: "source", side: -1,
    roadAnchor: { x: 0, y: 0, z: -45, alongM: 45 }
  }]);
  assert.equal(result.edges.length, 0);
  assert.equal(result.report.skipped.busBayAlreadyPresent, 1);
});
