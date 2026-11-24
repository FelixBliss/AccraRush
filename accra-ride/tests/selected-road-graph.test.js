import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { APPROVED_ROADS, buildMapModel, directedComponents, normaliseRoadName, selectRoadGraph } from "../src/map/selected-road-graph.js";

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
    assert.equal(report.routeEndpointCount, 0, "every approved route terminus must join a real OSM junction/connector");
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

test("Danquah Circle and Atta Mills Street remain real OSM junctions in the selected graphs", async () => {
  const ac = selectRoadGraph(await load("accra-central"), "accra-central").network;
  assert.ok(ac.edges.some(e => e.osm.name === "Danquah Circle" && e.osm.junction === "roundabout"));
  const lp = selectRoadGraph(await load("lapaz"), "lapaz").network;
  assert.ok(lp.edges.some(e => e.osm.name === "Atta Mills Street" && e.selection.role === "junction"),
    "Atta Mills Street must be retained as the real OSM junction connector at the selected corridor terminus");
  assert.deepEqual(selectRoadGraph(await load("lapaz"), "lapaz").report.unconnectedRouteEndpoints, []);
});

test("overlapping area extracts share only identical source OSM roads and node coordinates", async () => {
  const ac = selectRoadGraph(await load("accra-central"), "accra-central").network;
  const lp = selectRoadGraph(await load("lapaz"), "lapaz").network;
  const acEdges = new Map(ac.edges.map(edge => [edge.id, edge]));
  for (const edge of lp.edges) {
    const shared = acEdges.get(edge.id);
    if (!shared) continue;
    assert.equal(edge.osm?.wayId, shared.osm?.wayId, "shared edge IDs must retain the same OSM way identity");
    assert.equal(edge.fromNodeId, shared.fromNodeId);
    assert.equal(edge.toNodeId, shared.toNodeId);
    assert.equal(edge.lengthM, shared.lengthM);
  }
  const acNodes = new Map(ac.nodes.map(node => [node.id, node]));
  for (const node of lp.nodes) {
    const shared = acNodes.get(node.id);
    if (!shared) continue;
    assert.equal(node.osm?.lat, shared.osm?.lat);
    assert.equal(node.osm?.lon, shared.osm?.lon);
  }
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
