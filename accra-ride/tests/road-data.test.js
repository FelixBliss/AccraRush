import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateRoadTopology, polylineLengthM } from "../src/core/road-network.js";

const load = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const areas = ["accra-central", "lapaz"];

for (const areaId of areas) {
  const base = `../data/roads/${areaId}/`;
  const network = load(base + "network.json");
  const manifest = load(base + "manifest.json");
  const source = load(base + "source-index.json");

  test(`${areaId}: imported OSM graph satisfies topology contracts`, () => {
    assert.deepEqual(validateRoadTopology(network), []);
  });

  test(`${areaId}: every imported motor-road way is represented by graph geometry`, () => {
    const representedWays = new Set(network.edges.map(edge => edge.sourceWayId));
    const representedNodes = new Map();
    for (const edge of network.edges) {
      const refs = representedNodes.get(edge.sourceWayId) ?? new Set();
      for (const nodeId of edge.source.sourceNodeIds) refs.add(nodeId);
      representedNodes.set(edge.sourceWayId, refs);
    }
    for (const way of source.ways) {
      assert.ok(representedWays.has(way.id), `OSM way ${way.id} has no graph edge`);
      const refs = representedNodes.get(way.id);
      for (const nodeId of way.nodeRefs) assert.ok(refs.has(nodeId), `OSM way ${way.id} lost node ${nodeId}`);
    }
  });

  test(`${areaId}: edge lengths agree with projected centreline geometry`, () => {
    for (const edge of network.edges) {
      assert.ok(Math.abs(polylineLengthM(edge.centerline) - edge.lengthM) < Math.max(3, edge.lengthM * 0.08), edge.id);
    }
  });

  test(`${areaId}: incomplete coverage and unknown road facts are not promoted to production`, () => {
    assert.equal(manifest.coverage.status, "partial");
    assert.equal(manifest.coverage.completeAreaCoverage, false);
    assert.equal(manifest.quality.productionReady, false);
    assert.equal(manifest.quality.routeReady, false);
    assert.ok(network.edges.some(edge => edge.lanes.some(lane => lane.widthM === null)));
    assert.ok(network.junctions.some(junction => junction.movements.some(movement => movement.status === "unknown")));
  });
}
