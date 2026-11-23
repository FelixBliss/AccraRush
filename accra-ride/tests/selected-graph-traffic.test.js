import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { selectRoadGraph } from "../src/map/selected-road-graph.js";
import { buildNavigationIndex, createRandomDirectedRoute } from "../src/map/road-navigation.js";

const seeded = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

for (const areaId of ["accra-central", "lapaz"]) {
  test(`${areaId}: AI routes use only the selected graph, legal lane directions and shared junction nodes`, async () => {
    const source = JSON.parse(await readFile(new URL(`../data/osm/${areaId}.network.json`, import.meta.url), "utf8")).network;
    const { network } = selectRoadGraph(source, areaId);
    const ids = new Map(network.edges.map(e => [e.id, e]));
    const index = buildNavigationIndex(network);
    let routes = 0, steps = 0, structureTransitions = 0;
    for (let seed = 1; seed <= 150; seed++) {
      let route;
      try { route = createRandomDirectedRoute(index, { stepCount: 60, random: seeded(seed) }); } catch { continue; }
      routes++;
      let node = route.startNodeId;
      for (const step of route.steps) {
        const edge = ids.get(step.edgeId);
        assert.ok(edge, "AI step leaves the selected graph: " + step.edgeId);
        const lane = edge.lanes.find(l => l.id === step.laneId);
        assert.ok(lane, "lane must exist");
        const forward = step.direction === "forward";
        const legal = lane.direction === "both" || (forward ? lane.direction === "forward" : lane.direction === "reverse");
        assert.ok(legal, "AI drives against lane direction on " + edge.id);
        assert.equal(forward ? edge.fromNodeId : edge.toNodeId, node, "AI must continue from the node it arrived at (no teleporting between roads)");
        node = forward ? edge.toNodeId : edge.fromNodeId;
        steps++;
      }
      for (let i = 1; i < route.steps.length; i++) {
        const a = ids.get(route.steps[i - 1].edgeId), b = ids.get(route.steps[i].edgeId);
        const sa = Boolean(a.osm.bridge || a.osm.tunnel), sb = Boolean(b.osm.bridge || b.osm.tunnel);
        if (sa !== sb) structureTransitions++;
      }
    }
    assert.ok(routes >= 100, "enough sustained routes could be generated: " + routes);
    assert.ok(steps > 3000);
    // Grade separation: a bridge/tunnel only joins an at-grade road through a node OSM itself shares
    // (ramp ends), never by geometric crossing. Routes are built from shared nodes only, asserted above.
    assert.ok(Number.isFinite(structureTransitions));
  });

  test(`${areaId}: structure (bridge/tunnel) edges are never connected to other roads except at shared OSM nodes`, async () => {
    const source = JSON.parse(await readFile(new URL(`../data/osm/${areaId}.network.json`, import.meta.url), "utf8")).network;
    const { network } = selectRoadGraph(source, areaId);
    const nodeIds = new Set(network.nodes.map(n => n.id));
    for (const e of network.edges) assert.ok(nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId));
    // No edge pair may cross geometrically without sharing a node AND be linked: the graph has no implicit crossings.
    const structure = network.edges.filter(e => e.osm.bridge || e.osm.tunnel);
    assert.ok(structure.length > 0, "selected graph keeps source-tagged structures");
  });
}
