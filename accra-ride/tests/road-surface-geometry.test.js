import test from "node:test";
// Full-network regressions remain enabled for both imported OSM areas.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildRoadFoundation } from "../src/map/road-foundations.js";
import { buildRoadSurfaceData, buildRoadEndpointTransition } from "../src/map/road-surface-geometry.js";

const edge = (overrides = {}) => ({
  id: "surface-edge", fromNodeId: "a", toNodeId: "b",
  centerline: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }, { x: 2, y: 0, z: 20 }],
  lanes: [{ id: "f", direction: "forward", widthM: 3.5 }, { id: "r", direction: "reverse", widthM: 3.5 }],
  roadModel: { physicalRoadId: "p", carriagewayId: "c" },
  ...overrides
});

test("RD-04 generates indexed upward-facing surface with stable UVs and preserved width", () => {
  const foundation = buildRoadFoundation(edge());
  const mesh = buildRoadSurfaceData(foundation);
  assert.equal(mesh.vertexCount, foundation.alignment.length * 2);
  assert.equal(mesh.triangleCount, (foundation.alignment.length - 1) * 2);
  assert.equal(mesh.indices.length % 3, 0);
  assert.equal(mesh.uvs.length, mesh.vertexCount * 2);
  assert.equal(mesh.diagnostics.winding, "upward");
  assert.equal(mesh.diagnostics.degenerateTriangles, 0);
  assert.equal(mesh.diagnostics.invertedTriangles, 0);
  assert.ok(Math.abs(mesh.minWidthM - 7) < 1e-8);
  assert.ok(mesh.maxWidthM >= mesh.minWidthM);
});

test("RD-04 rejects collapsed or mismatched boundary geometry", () => {
  const foundation = buildRoadFoundation(edge());
  assert.throws(() => buildRoadSurfaceData({ ...foundation, boundaries: {
    left: foundation.boundaries.left, right: foundation.boundaries.left
  }}), /collapsed cross-section/);
  assert.throws(() => buildRoadSurfaceData({ ...foundation, boundaries: {
    left: foundation.boundaries.left, right: foundation.boundaries.right.slice(1)
  }}), /matching left\/right/);
});

test("endpoint transition only fills a short, graph-connected, near-straight gap", () => {
  const a = buildRoadFoundation(edge({
    centerline: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }]
  }));
  const b = buildRoadFoundation(edge({
    id: "next", fromNodeId: "b", toNodeId: "c",
    centerline: [{ x: 0, y: 0, z: 10.3 }, { x: 0, y: 0, z: 20 }]
  }));
  const result = buildRoadEndpointTransition(a, b);
  assert.equal(result.built, true);
  assert.equal(result.diagnostics.graphConnected, true);
  assert.equal(result.indices.length, 6);

  const turn = buildRoadFoundation(edge({
    id: "turn", fromNodeId: "b", toNodeId: "d",
    centerline: [{ x: 0, y: 0, z: 10.3 }, { x: 10, y: 0, z: 10.3 }]
  }));
  assert.equal(buildRoadEndpointTransition(a, turn).reason, "turning-junction-reserved-for-rd05");
});

for (const areaId of ["accra-central", "lapaz"]) {
  test(`RD-04 creates valid surfaces for every imported ${areaId} edge`, async () => {
    const document = JSON.parse(await readFile(new URL(`../data/osm/${areaId}.network.json`, import.meta.url), "utf8"));
    let edgeCount = 0, triangleCount = 0, minWidthM = Infinity, maxWidthM = 0;
    for (const edge of document.network.edges) {
      const foundation = buildRoadFoundation(edge);
      let surface;
      try { surface = buildRoadSurfaceData(foundation); }
      catch (error) { throw new Error(`${areaId} edge ${edge.id} (${edge.osm?.name ?? "unnamed"}): ${error.message}`); }
      assert.ok(surface.triangleCount > 0, edge.id);
      assert.equal(surface.diagnostics.degenerateTriangles, 0, edge.id);
      assert.equal(surface.diagnostics.invertedTriangles, 0, edge.id);
      edgeCount++;
      triangleCount += surface.triangleCount;
      minWidthM = Math.min(minWidthM, surface.minWidthM);
      maxWidthM = Math.max(maxWidthM, surface.maxWidthM);
    }
    assert.equal(edgeCount, document.network.edges.length);
    assert.ok(triangleCount >= edgeCount * 2);
    assert.ok(minWidthM > 0 && maxWidthM >= minWidthM);
  });
}
