import test from "node:test";
import assert from "node:assert/strict";
import { applyRoadElevationProfile } from "../src/map/road-elevation.js";

test("DEM profile applies metric elevations to nodes and interpolates road surfaces", () => {
  const network = {
    nodes: [
      { id: "a", position: { x: 0, y: 0, z: 0 } },
      { id: "b", position: { x: 0, y: 0, z: -100 } },
      { id: "c", position: { x: 20, y: 0, z: -100 } }
    ],
    edges: [
      { id: "ab", fromNodeId: "a", toNodeId: "b", centerline: [
        { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -50 }, { x: 0, y: 0, z: -100 }
      ] },
      { id: "bc", fromNodeId: "b", toNodeId: "c", centerline: [
        { x: 0, y: 0, z: -100 }, { x: 20, y: 0, z: -100 }
      ] }
    ]
  };
  const report = applyRoadElevationProfile(network, {
    schemaVersion: 1,
    baseElevationM: 50,
    source: { dataset: "SRTM 1 arc-second" },
    elevations: { a: 50, b: 60, c: 65 }
  });
  assert.equal(report.appliedNodes, 3);
  assert.equal(report.appliedEdges, 2);
  assert.equal(network.nodes[1].position.y, 10);
  assert.equal(network.edges[0].centerline[1].y, 5);
  assert.equal(network.edges[0].centerline[2].y, 10);
  assert.equal(network.edges[1].centerline[1].y, 15);
  assert.ok(report.ascentM > 0 && report.maxGrade > 0);
  assert.equal(network.edges[0].elevation.verified, true);
});

test("missing DEM endpoint samples do not invent a road grade", () => {
  const network = {
    nodes: [{ id: "a", position: { x: 0, y: 0, z: 0 } }],
    edges: [{ id: "edge", fromNodeId: "a", toNodeId: "missing", centerline: [
      { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -10 }
    ] }]
  };
  const report = applyRoadElevationProfile(network, {
    schemaVersion: 1, elevations: { a: 12 }, source: { dataset: "SRTM" }
  });
  assert.equal(report.appliedNodes, 1);
  assert.equal(report.appliedEdges, 0);
  assert.equal(network.edges[0].centerline[1].y, 0);
});
