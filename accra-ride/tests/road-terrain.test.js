import test from "node:test";
import assert from "node:assert/strict";
import { buildRoadTerrainData } from "../src/map/road-terrain.js";

const network = {
  nodes: [
    { id: "a", position: { x: 0, y: 0, z: 0 } },
    { id: "b", position: { x: 100, y: 10, z: 0 } },
    { id: "c", position: { x: 200, y: 20, z: 0 } }
  ],
  edges: [
    { id: "ab", fromNodeId: "a", toNodeId: "b", lanes: [{ widthM: 3.5 }, { widthM: 3.5 }],
      centerline: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 10, z: 0 }] },
    { id: "bc", fromNodeId: "b", toNodeId: "c", lanes: [{ widthM: 3.5 }, { widthM: 3.5 }],
      centerline: [{ x: 100, y: 10, z: 0 }, { x: 200, y: 20, z: 0 }] }
  ]
};

test("DEM terrain covers the road graph and follows its elevation profile", () => {
  const terrain = buildRoadTerrainData(network, { cellSizeM: 20, paddingM: 100 });
  assert.equal(terrain.available, true);
  assert.ok(terrain.vertexCount > 100);
  assert.ok(terrain.bounds.minX < 0 && terrain.bounds.maxX > 200);
  assert.ok(terrain.minY < 0, "terrain corridor must sit just below the road deck");
  assert.ok(terrain.maxY > 9, "terrain must rise with the DEM road profile");
  assert.ok(terrain.elevationRangeM > 8);
  assert.equal(terrain.indices.length, (terrain.columns - 1) * (terrain.rows - 1) * 6);
});

test("terrain is not generated from an unverified flat graph", () => {
  const flat = { nodes: network.nodes.map(node => ({ ...node, position: { ...node.position, y: 0 } })), edges: network.edges };
  const terrain = buildRoadTerrainData(flat);
  assert.equal(terrain.available, false);
  assert.equal(terrain.reason, "dem-elevation-not-available");
});

test("terrain mesh stays inside the mobile vertex budget", () => {
  assert.throws(() => buildRoadTerrainData(network, { maxVertices: 10 }), /mobile vertex budget/);
});


test("road corridor clearance stays shallow so asphalt does not hang above the terrain", () => {
  const terrain = buildRoadTerrainData(network, { cellSizeM: 20, paddingM: 100 });
  const column = Math.round((0 - terrain.bounds.minX) / terrain.cellSizeM);
  const row = Math.round((0 - terrain.bounds.minZ) / terrain.cellSizeM);
  const index = (row * terrain.columns + column) * 3;
  const groundY = terrain.positions[index + 1];

  assert.ok(Math.abs(groundY + 0.05) < 1e-5,
    "terrain under the road centreline should be cut by only 5 cm");
  assert.ok(groundY > -0.1,
    "road corridor must not be lowered by the previous 0.55 m default");
});


test("road corridor cut honours the configured value, including zero", () => {
  const sampleCentreGround = options => {
    const terrain = buildRoadTerrainData(network, { cellSizeM: 20, paddingM: 100, ...options });
    const column = Math.round((0 - terrain.bounds.minX) / terrain.cellSizeM);
    const row = Math.round((0 - terrain.bounds.minZ) / terrain.cellSizeM);
    return terrain.positions[(row * terrain.columns + column) * 3 + 1];
  };

  assert.ok(Math.abs(sampleCentreGround({ corridorCutM: 0 }) - 0) < 1e-5);
  assert.ok(Math.abs(sampleCentreGround({ corridorCutM: 0.12 }) + 0.12) < 1e-5);
});

test("road corridor cut rejects invalid negative and non-finite values", () => {
  assert.throws(() => buildRoadTerrainData(network, { corridorCutM: -0.1 }), /finite, non-negative/);
  assert.throws(() => buildRoadTerrainData(network, { corridorCutM: Number.NaN }), /finite, non-negative/);
});
