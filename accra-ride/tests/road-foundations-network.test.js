import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildRoadFoundation, validateFoundationConnection } from "../src/map/road-foundations.js";

const areas = ["accra-central", "lapaz"];

for (const areaId of areas) {
  test(`RD-03 builds foundations for every imported ${areaId} edge`, async () => {
    const document = JSON.parse(await readFile(new URL(`../data/osm/${areaId}.network.json`, import.meta.url), "utf8"));
    const network = document.network;
    assert.ok(network.edges.length > 0, "network must contain imported edges");
    const foundations = new Map();
    const failures = [];

    for (const edge of network.edges) {
      try {
        const foundation = buildRoadFoundation(edge);
        foundations.set(edge.id, foundation);
        assert.equal(foundation.edgeId, edge.id);
        assert.ok(foundation.measurements.horizontalLengthM > 0);
        assert.equal(foundation.laneCentrelines.length, edge.lanes.length);
        assert.equal(foundation.crossSection.widthProvenance, edge.roadModel.widthSource);
        assert.equal(foundation.crossSection.laneLayoutProvenance, edge.roadModel.laneLayoutSource);
        assert.equal(foundation.elevation.verified, false, "2D OSM import must not be represented as verified terrain elevation");
      } catch (error) {
        failures.push({ edgeId: edge.id, message: error.message });
      }
    }

    assert.equal(failures.length, 0, `foundation failures: ${JSON.stringify(failures.slice(0, 10))}`);
    assert.equal(foundations.size, network.edges.length);

    const nodePositions = new Map(network.nodes.map(node => [node.id, node.position]));
    let endpointMismatchCount = 0;
    for (const edge of network.edges) {
      const foundation = foundations.get(edge.id);
      const from = nodePositions.get(edge.fromNodeId);
      const to = nodePositions.get(edge.toNodeId);
      assert.ok(from && to, `edge ${edge.id} must reference imported graph nodes`);
      assert.ok(Math.hypot(foundation.alignment[0].x - from.x, foundation.alignment[0].y - from.y, foundation.alignment[0].z - from.z) < 0.02);
      assert.ok(Math.hypot(foundation.alignment.at(-1).x - to.x, foundation.alignment.at(-1).y - to.y, foundation.alignment.at(-1).z - to.z) < 0.02);
    }

    const outgoing = new Map();
    for (const edge of network.edges) {
      if (!outgoing.has(edge.fromNodeId)) outgoing.set(edge.fromNodeId, []);
      outgoing.get(edge.fromNodeId).push(edge);
    }
    let checkedConnections = 0;
    let invalidConnections = 0;
    for (const edge of network.edges) {
      for (const next of outgoing.get(edge.toNodeId) ?? []) {
        const result = validateFoundationConnection(foundations.get(edge.id), foundations.get(next.id));
        checkedConnections++;
        if (!result.connected) invalidConnections++;
      }
    }
    assert.ok(checkedConnections > 0, "network must contain directed endpoint connections");
    assert.equal(invalidConnections, 0, `${invalidConnections}/${checkedConnections} directed connections exceed foundation tolerance`);
    assert.equal(endpointMismatchCount, 0);
  });
}
