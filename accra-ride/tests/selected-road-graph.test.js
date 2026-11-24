import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { APPROVED_ROADS, buildMapModel, directedComponents, normaliseRoadName, selectRoadGraph, selectCircuitRoadGraph } from "../src/map/selected-road-graph.js";

const load = async areaId => JSON.parse(await readFile(new URL("../data/osm/" + areaId + ".network.json", import.meta.url), "utf8")).network;

for (const areaId of ["accra-central", "lapaz"]) {
  test(areaId + ": selected graph has exactly the five approved roads, real connectors, and no extract-wide import", async () => {
    const source = await load(areaId);
    const { network, report } = selectRoadGraph(source, areaId);
    assert.equal(APPROVED_ROADS[areaId].length, 5);
    for (const road of report.roads) {
      assert.ok(road.edges > 0 && road.wayIds.length > 0, road.name + " must resolve to OSM ways");
      assert.ok(road.wayIds.every(id => /^w\d+$/.test(id)), "OSM way ids preserved for " + road.name);
    }
    const routeNames = new Set(network.edges.filter(e => e.selection.role === "route").map(e => e.selection.routeName));
    assert.deepEqual([...routeNames].sort(), [...APPROVED_ROADS[areaId]].sort());
    // Every named road edge in the selection that is role=route has exactly an approved name.
    const approvedKeys = new Set(APPROVED_ROADS[areaId].map(normaliseRoadName));
    assert.ok(network.edges.filter(e => e.selection.role === "route").every(e => approvedKeys.has(normaliseRoadName(e.osm.name))));
    // Unselected approved-name-free roads never enter as "route".
    assert.ok(network.edges.length < source.edges.length * 0.2, "must not load the whole extract (" + network.edges.length + "/" + source.edges.length + ")");
    assert.ok(report.connectorSegmentCount > 0 && report.routeSegmentCount > 0);
    assert.equal(report.connected, true, "five roads + connectors form one connected graph");
    assert.ok(report.stronglyConnectedShare >= 0.85, "directed usability " + report.stronglyConnectedShare);
  });

  test(areaId + ": every edge is an unmodified real source edge; nodes and ids unique; no duplicates", async () => {
    const source = await load(areaId);
    const byId = new Map(source.edges.map(e => [e.id, e]));
    const { network } = selectRoadGraph(source, areaId);
    const ids = new Set();
    for (const e of network.edges) {
      assert.ok(!ids.has(e.id), "duplicate edge " + e.id); ids.add(e.id);
      const src = byId.get(e.id);
      assert.ok(src, "edge not in source: " + e.id);
      assert.equal(e.fromNodeId, src.fromNodeId); assert.equal(e.toNodeId, src.toNodeId);
      assert.deepEqual(e.centerline, src.centerline, "geometry must not be altered");
      assert.deepEqual(e.lanes, src.lanes);
      assert.deepEqual(e.osm, src.osm);
    }
    const nodeIds = new Set(network.nodes.map(n => n.id));
    assert.equal(nodeIds.size, network.nodes.length);
    assert.ok(network.edges.every(e => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId)), "no dangling edge endpoints");
    assert.ok(network.nodes.every(n => n.osm && Number.isFinite(n.osm.lat)), "node OSM provenance preserved");
  });

  test(areaId + ": selection is deterministic and the map model mirrors the graph exactly", async () => {
    const source = await load(areaId);
    const a = selectRoadGraph(source, areaId), b = selectRoadGraph(source, areaId);
    assert.deepEqual(a.network.edges.map(e => e.id), b.network.edges.map(e => e.id));
    const model = buildMapModel(a.network, areaId);
    assert.deepEqual(model.roads.map(r => r.id), a.network.edges.map(e => e.id));
    assert.ok(model.roads.every(r => r.wayId));
    assert.ok(Number.isFinite(model.bounds.minX) && model.bounds.maxX > model.bounds.minX && model.bounds.maxZ > model.bounds.minZ);
    const scc = directedComponents(a.network.edges);
    assert.ok(scc[0].length / a.network.nodes.length >= 0.85);
  });
}

test("Danquah Circle and Atta Mills Street are part of their area's selected graph", async () => {
  const ac = selectRoadGraph(await load("accra-central"), "accra-central").network;
  const lp = selectRoadGraph(await load("lapaz"), "lapaz").network;
  assert.ok(ac.edges.some(e => e.osm.name === "Danquah Circle" && e.osm.junction === "roundabout"));
  assert.ok(lp.edges.some(e => e.osm.name === "Atta Mills Street"));
});

test("areas are independent: no edge or node id is shared across graphs", async () => {
  const ac = selectRoadGraph(await load("accra-central"), "accra-central").network;
  const lp = selectRoadGraph(await load("lapaz"), "lapaz").network;
  const ids = new Set(ac.edges.map(e => e.id));
  assert.ok(lp.edges.every(e => !ids.has(e.id)));
});

test("missing approved road is a hard error, never silently substituted", () => {
  assert.throws(() => selectRoadGraph({ nodes: [{ id: "a" }], edges: [{ id: "e", fromNodeId: "a", toNodeId: "a", osm: { name: "Other Road", highway: "primary" }, lengthM: 1, centerline: [] }] }, "lapaz"), /not found/);
  assert.throws(() => selectRoadGraph({ nodes: [], edges: [] }, "nowhere"), /No approved/);
});


test("shared two-way lane connectors contribute arcs in both directions", () => {
  const edges = [{ id: "shared", fromNodeId: "west", toNodeId: "east", lanes: [{ direction: "both" }] }];
  const components = directedComponents(edges);
  assert.equal(components.length, 1, "a shared two-way lane must keep both endpoints in one strongly connected component");
  assert.deepEqual(new Set(components[0]), new Set(["west", "east"]));
});


for (const areaId of ["accra-central", "lapaz"]) {
  test(areaId + ": generated circuit graph contains only exact, legal OSM source edges", async () => {
    const source = await load(areaId);
    const manifest = JSON.parse(await readFile(new URL("../data/osm/" + areaId + ".candidate-race-circuit.json", import.meta.url), "utf8"));
    const { network, report } = selectCircuitRoadGraph(source, manifest);
    assert.equal(report.connected, true);
    assert.equal(manifest.closed, true);
    assert.equal(manifest.startNodeId, manifest.endNodeId);
    assert.ok(manifest.namedRoads.length >= 6);
    assert.ok(manifest.steps.length >= 60);
    assert.ok(network.edges.length < source.edges.length * 0.2);
    const sourceById = new Map(source.edges.map(edge => [edge.id, edge]));
    for (const edge of network.edges) {
      assert.ok(sourceById.has(edge.id), "circuit edge must exist in source OSM graph");
      assert.equal(edge.selection.role, "route");
      assert.deepEqual(edge.centerline, sourceById.get(edge.id).centerline);
      assert.deepEqual(edge.lanes, sourceById.get(edge.id).lanes);
    }
    assert.ok(network.nodes.every(node => manifest.steps.some(step => step.fromNodeId === node.id || step.toNodeId === node.id)));
  });
}
