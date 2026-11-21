import test from "node:test";
import assert from "node:assert/strict";
import { buildRoadFoundation, validateFoundationConnection } from "../src/map/road-foundations.js";

const edge = (overrides = {}) => ({
  id: "edge-a", fromNodeId: "node-a", toNodeId: "node-b",
  centerline: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }],
  lanes: [
    { id: "f1", direction: "forward", widthM: 3.5 },
    { id: "f2", direction: "forward", widthM: 3.5 },
    { id: "r1", direction: "reverse", widthM: 4 }
  ],
  roadModel: { physicalRoadId: "physical-a", carriagewayId: "carriage-a",
    widthSource: "inferred:default-lane-width", laneLayoutSource: "osm:lanes:forward+backward" },
  ...overrides
});

test("RD-03 creates metric alignment and asymmetric divided-road boundaries without changing source geometry", () => {
  const source = edge();
  const foundation = buildRoadFoundation(source, { medianWidthM: 2, shoulderLeftM: 1, shoulderRightM: 1 });
  assert.equal(foundation.schemaVersion, 1);
  assert.equal(foundation.edgeId, "edge-a");
  assert.equal(foundation.measurements.horizontalLengthM, 10);
  assert.equal(foundation.crossSection.physicalWidthM, 15);
  assert.equal(foundation.laneCentrelines.length, 3);
  assert.ok(Math.abs(foundation.boundaries.left[0].x + 6) < 1e-9);
  assert.ok(Math.abs(foundation.boundaries.right[0].x - 9) < 1e-9);
  assert.deepEqual(source.centerline, [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }]);
  assert.equal(foundation.physicalRoadId, "physical-a");
});

test("one-way lanes are centred on their own carriageway alignment", () => {
  const foundation = buildRoadFoundation(edge({
    lanes: [
      { id: "one-a", direction: "forward", widthM: 3.5 },
      { id: "one-b", direction: "forward", widthM: 3.5 }
    ],
    roadModel: { oneWay: true, oneWayDirection: "forward" }
  }));
  assert.deepEqual(foundation.laneCentrelines.map(lane => lane.centreOffsetM), [-1.75, 1.75]);
  assert.ok(Math.abs(foundation.boundaries.left[0].x + 3.5) < 1e-9);
  assert.ok(Math.abs(foundation.boundaries.right[0].x - 3.5) < 1e-9);
});

test("shared bidirectional lane remains centred and flat elevation is explicitly unverified", () => {
  const foundation = buildRoadFoundation(edge({
    lanes: [{ id: "shared", direction: "both", widthM: 3.2 }],
    roadModel: {}
  }));
  assert.equal(foundation.laneCentrelines[0].centreOffsetM, 0);
  assert.equal(foundation.elevation.provenance, "flat:unverified-elevation");
  assert.equal(foundation.elevation.verified, false);
});

test("vertical measurements are calculated but not claimed as verified terrain elevation", () => {
  const foundation = buildRoadFoundation(edge({
    centerline: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 10 }, { x: 0, y: 3, z: 20 }]
  }));
  assert.equal(foundation.measurements.ascentM, 3);
  assert.equal(foundation.measurements.descentM, 0);
  assert.equal(foundation.elevation.verified, false);
  assert.equal(foundation.elevation.provenance, "provided:world-centreline-unverified-source");
});

test("RD-03 rejects missing or invalid lane widths rather than fabricating dimensions", () => {
  assert.throws(() => buildRoadFoundation(edge({ lanes: [] })), /no lane width may be fabricated/);
  assert.throws(() => buildRoadFoundation(edge({ lanes: [{ id: "bad", direction: "forward", widthM: 0 }] })), /positive metric width/);
});

test("connected endpoint validation requires matching graph node IDs and does not snap geometry", () => {
  const a = buildRoadFoundation(edge());
  const b = buildRoadFoundation(edge({
    id: "edge-b", fromNodeId: "node-b", toNodeId: "node-c",
    centerline: [{ x: 0.2, y: 0, z: 10 }, { x: 0.2, y: 0, z: 20 }]
  }));
  const result = validateFoundationConnection(a, b, 0.25);
  assert.equal(result.connected, true);
  assert.equal(result.snapped, false);
  assert.ok(Math.abs(result.gapM - 0.2) < 1e-9);
  assert.equal(validateFoundationConnection(a, b, 0.1).connected, false);
  assert.equal(validateFoundationConnection(a, buildRoadFoundation(edge({
    id: "edge-c", fromNodeId: "other-node", toNodeId: "node-c",
    centerline: [{ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 20 }]
  }))).reason, "graph-endpoints-do-not-match");
});
