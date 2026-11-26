import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyGradeSeparation, GRADE_SEPARATION } from "../src/map/road-elevation.js";
import { selectRoadGraph, selectHighwayRouteGraph } from "../src/map/selected-road-graph.js";

const pt = (x, z) => ({ x, y: 0, z });
const edge = (id, from, to, points, osm = {}) => ({ id, fromNodeId: from, toNodeId: to, centerline: points, osm, lanes: [{ id: id + "-f", direction: "forward", widthM: 3.5 }] });
const nodeOf = id => ({ id, position: { x: 0, y: 0, z: 0 } });

// A 600 m straight road crossed at its midpoint by a 120 m layer-1 bridge, with straight approach ways either side.
const crossingFixture = () => ({
  id: "fixture",
  nodes: ["a", "b", "c", "d", "e", "f", "g", "h"].map(nodeOf),
  edges: [
    edge("ground", "a", "b", [pt(-300, 0), pt(300, 0)], { highway: "primary" }),
    edge("approach-w", "c", "d", [pt(-300, -300), pt(-300, -60)]),
    edge("bridge", "d", "e", [pt(0, -60), pt(0, 60)], { highway: "primary", bridge: "yes", layer: "1" }),
    edge("approach-e", "e", "f", [pt(0, 60), pt(0, 300)])
  ].map(e => e)
});

test("grade separation lifts a bridge only where it provably crosses a lower road", () => {
  const net = crossingFixture();
  // Make the bridge chain contiguous: approach-w ends where the bridge begins.
  net.edges[1].toNodeId = "d"; net.edges[1].centerline = [pt(0, -300), pt(0, -60)];
  net.edges[3].centerline = [pt(0, 60), pt(0, 300)];
  const { network, report } = applyGradeSeparation(net);
  assert.equal(report.structureCount, 1);
  assert.equal(report.unresolvedCrossings, 0);
  const bridge = network.edges.find(e => e.id === "bridge");
  assert.equal(bridge.elevation.provenance, GRADE_SEPARATION.provenance);
  assert.equal(bridge.elevation.verified, false, "derived heights must never claim to be surveyed");
  const crossing = report.crossings[0];
  assert.ok(crossing.clearanceM >= GRADE_SEPARATION.minCrossingClearanceM, "clearance " + crossing.clearanceM);
  assert.equal(network.edges.find(e => e.id === "ground").centerline.every(p => p.y === 0), true, "the crossed road stays at grade");
});

test("a bridge that crosses nothing is not lifted", () => {
  const net = { id: "flat", nodes: ["a", "b"].map(nodeOf), edges: [edge("lonely", "a", "b", [pt(0, 0), pt(0, 80)], { bridge: "yes", layer: "1" })] };
  const { network, report } = applyGradeSeparation(net);
  assert.equal(report.raisedEdgeCount, 0);
  assert.equal(network.edges[0].centerline.every(p => p.y === 0), true);
});

test("a shared OSM node is a junction, not a grade separation", () => {
  const net = { id: "junction", nodes: ["a", "b", "c"].map(nodeOf), edges: [
    edge("main", "a", "b", [pt(-50, 0), pt(0, 0)], { highway: "primary" }),
    edge("span", "b", "c", [pt(0, 0), pt(60, 0)], { highway: "primary", bridge: "yes", layer: "1" })
  ] };
  assert.equal(applyGradeSeparation(net).report.raisedEdgeCount, 0);
});

test("lifting never moves horizontal geometry and never mutates its input", () => {
  const net = crossingFixture();
  net.edges[1].toNodeId = "d"; net.edges[1].centerline = [pt(0, -300), pt(0, -60)];
  net.edges[3].centerline = [pt(0, 60), pt(0, 300)];
  const before = JSON.stringify(net);
  const { network } = applyGradeSeparation(net);
  assert.equal(JSON.stringify(net), before, "input network must not be mutated");
  for (const lifted of network.edges) {
    const original = net.edges.find(e => e.id === lifted.id);
    for (const p of original.centerline) {
      assert.ok(lifted.centerline.some(q => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.z - p.z) < 1e-6), lifted.id + " lost an original vertex");
    }
  }
});

for (const areaId of ["accra-central", "lapaz"]) {
  test(`${areaId}: real selected graph is grade-limited, continuous at every node and clear of crossed roads`, async () => {
    const load = async n => JSON.parse(await readFile(new URL(`../data/osm/${n}.json`, import.meta.url), "utf8"));
    const source = (await load(areaId + ".network")).network;
    const { network: flat } = areaId === "lapaz"
      ? selectHighwayRouteGraph(source, await load("lapaz-madina-route"))
      : selectRoadGraph(source, areaId);
    const { network, report } = applyGradeSeparation(flat);
    assert.ok(report.structureCount > 0, "both areas contain real flyovers");
    assert.ok(report.maxGrade <= GRADE_SEPARATION.maxGrade + 1e-9, "max grade " + report.maxGrade);
    // Height must agree at every shared node, otherwise a visible step or a gap opens at the junction.
    const nodeHeights = new Map();
    for (const e of network.edges) for (const [id, p] of [[e.fromNodeId, e.centerline[0]], [e.toNodeId, e.centerline.at(-1)]]) {
      if (nodeHeights.has(id)) assert.ok(Math.abs(nodeHeights.get(id) - p.y) < 1e-6, `${areaId}: height step at node ${id}`);
      else nodeHeights.set(id, p.y);
    }
    // Every crossing that was lifted must clear the road beneath by the required headroom, except those the
    // report explicitly records as unresolved (short spans that cannot climb inside the selected graph).
    const bad = report.crossings.filter(c => !c.ok);
    assert.equal(bad.length, report.unresolvedCrossings);
    assert.ok(report.unresolvedCrossings <= 4, "unresolved crossings must stay explicitly reported and few: " + report.unresolvedCrossings);
  });
}
