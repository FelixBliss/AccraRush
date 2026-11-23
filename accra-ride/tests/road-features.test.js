import test from "node:test";
import assert from "node:assert/strict";
import { classifyFeature, projectToLocal, selectRoadFeatures } from "../src/map/road-features.js";
import { createRoadFeatureMeshes } from "../src/map/road-feature-renderer.js";

class Group { constructor() { this.children = []; this.userData = {}; } add(c) { this.children.push(c); } }
class BufferGeometry { constructor() { this.attributes = {}; this.index = []; } setAttribute(n, v) { this.attributes[n] = v; } setIndex(v) { this.index = v; } computeVertexNormals() {} }
class Float32BufferAttribute { constructor(a, s) { this.array = a; this.itemSize = s; } }
class Mesh { constructor(g, m) { this.geometry = g; this.material = m; this.userData = {}; } }
class Material { constructor(o) { this.options = o; } }
const THREE = { Group, BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial: Material };

const network = { edges: [{ id: "e1", selection: { sourceWayId: "w1" }, osm: { wayId: "w1" }, lanes: [{ widthM: 3.5 }, { widthM: 3.5 }],
  centerline: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }] }] };

test("OSM tags classify into renderable kinds; unrelated tags are ignored", () => {
  assert.equal(classifyFeature({ highway: "crossing" }), "crossing");
  assert.equal(classifyFeature({ highway: "traffic_signals" }), "traffic_signals");
  assert.equal(classifyFeature({ highway: "stop" }), "stop_sign");
  assert.equal(classifyFeature({ highway: "give_way" }), "give_way_sign");
  assert.equal(classifyFeature({ barrier: "guard_rail" }, "line"), "barrier");
  assert.equal(classifyFeature({ barrier: "fence" }, "line"), null);
  assert.equal(classifyFeature({ shop: "kiosk" }), null);
  assert.equal(classifyFeature({ highway: "street_lamp" }), "street_lamp");
  assert.equal(classifyFeature({ highway: "bus_stop" }), "bus_stop");
  assert.equal(classifyFeature({ highway: "speed_camera" }), "speed_camera");
  assert.equal(classifyFeature({ man_made: "gantry" }), "gantry");
  assert.equal(classifyFeature({ man_made: "gantry" }, "line"), "gantry");
  assert.equal(classifyFeature({ highway: "footway", footway: "sidewalk" }, "line"), "sidewalk");
});

test("projection matches the road importer's local frame (north is -z)", () => {
  const o = { lat: 5.555, lon: -0.205 };
  const p = projectToLocal(5.556, -0.205, o);
  assert.ok(p.z < 0 && Math.abs(p.x) < 1e-6);
});

test("only features on or beside the selected graph are kept and linked to their edge", () => {
  const doc = { features: [
    { id: "n1", kind: "crossing", position: { x: 50, y: 0, z: 3 } },
    { id: "n2", kind: "traffic_signals", position: { x: 50, y: 0, z: 400 } },
    { id: "w9", kind: "barrier", line: [{ x: 10, y: 0, z: 9 }, { x: 40, y: 0, z: 9 }, { x: 70, y: 0, z: 9 }] },
    { id: "w10", kind: "barrier", line: [{ x: 10, y: 0, z: 300 }, { x: 70, y: 0, z: 300 }] }
  ] };
  const kept = selectRoadFeatures(doc, network);
  assert.deepEqual(kept.map(f => f.id).sort(), ["n1", "w9"]);
  assert.ok(kept.every(f => f.edgeId === "e1" && f.wayId === "w1" && Math.abs(f.heading.x) === 1));
  assert.deepEqual(selectRoadFeatures({ features: [] }, network), []);
  assert.deepEqual(selectRoadFeatures(null, network), []);
});

test("spatial matching finds features along sparse long road segments", () => {
  const sparseNetwork = { edges: [{
    id: "long-edge", osm: { wayId: "long-way" }, lanes: [{ widthM: 3.5 }, { widthM: 3.5 }],
    centerline: [{ x: 0, y: 0, z: 0 }, { x: 1200, y: 0, z: 0 }]
  }] };
  const kept = selectRoadFeatures({ features: [
    { id: "midpoint-signal", kind: "traffic_signals", position: { x: 600, y: 0, z: 4 } },
    { id: "far-away", kind: "traffic_signals", position: { x: 600, y: 0, z: 40 } }
  ] }, sparseNetwork);
  assert.deepEqual(kept.map(feature => feature.id), ["midpoint-signal"]);
  assert.equal(kept[0].edgeId, "long-edge");
  assert.equal(kept[0].wayId, "long-way");
});

test("feature meshes build valid indexed geometry for every kind", () => {
  const kept = selectRoadFeatures({ features: [
    { id: "a", kind: "crossing", position: { x: 20, y: 0, z: 0 } },
    { id: "b", kind: "traffic_signals", position: { x: 30, y: 0, z: 0 } },
    { id: "c", kind: "stop_sign", position: { x: 40, y: 0, z: 0 } },
    { id: "d", kind: "give_way_sign", position: { x: 45, y: 0, z: 0 } },
    { id: "e", kind: "sign", position: { x: 50, y: 0, z: 0 } },
    { id: "f", kind: "bollard", position: { x: 55, y: 0, z: 0 } },
    { id: "g", kind: "speed_hump", position: { x: 60, y: 0, z: 0 } },
    { id: "h", kind: "barrier", line: [{ x: 10, y: 0, z: 8 }, { x: 90, y: 0, z: 8 }] },
    { id: "i", kind: "street_lamp", position: { x: 30, y: 0, z: 6 } },
    { id: "j", kind: "bus_stop", position: { x: 35, y: 0, z: -6 } },
    { id: "k", kind: "speed_camera", position: { x: 70, y: 0, z: 5 } },
    { id: "l", kind: "gantry", position: { x: 80, y: 0, z: 0 } },
    { id: "m", kind: "sidewalk", line: [{ x: 5, y: 0, z: 6 }, { x: 95, y: 0, z: 6 }] }
  ] }, network);
  assert.ok(kept.every(f => f.side === 1 || f.side === -1));
  const group = createRoadFeatureMeshes(THREE, kept, network);
  assert.equal(group.children.length, 1);
  const g = group.children[0].geometry, pos = g.attributes.position.array;
  assert.equal(g.attributes.color.array.length, pos.length);
  assert.ok(g.index.length % 3 === 0 && g.index.every(i => i < pos.length / 3));
  assert.deepEqual(Object.keys(group.userData.counts).sort(), ["barrier", "bollard", "bus_stop", "crossing", "gantry", "give_way_sign", "sidewalk", "sign", "speed_camera", "speed_hump", "stop_sign", "street_lamp", "traffic_signals"]);
  assert.equal(createRoadFeatureMeshes(THREE, [], network).children.length, 0, "no features → no mesh, nothing invented");
});

import { readFile } from "node:fs/promises";
import { selectRoadGraph } from "../src/map/selected-road-graph.js";
for (const areaId of ["accra-central", "lapaz"]) {
  test(`${areaId}: real OSM features are matched to the selected graph only`, async () => {
    const load = async n => JSON.parse(await readFile(new URL(`../data/osm/${n}.json`, import.meta.url), "utf8"));
    const { network } = selectRoadGraph((await load(areaId + ".network")).network, areaId);
    const doc = await load(areaId + ".features");
    const kept = selectRoadFeatures(doc, network);
    assert.ok(doc.features.length > 50);
    assert.ok(kept.length > 10 && kept.length < doc.features.length, "kept " + kept.length + " of " + doc.features.length);
    const ids = new Set(network.edges.map(e => e.id));
    assert.ok(kept.every(f => ids.has(f.edgeId)));
    assert.ok(kept.some(f => f.kind === "crossing") && kept.some(f => f.kind === "traffic_signals"));
    const group = createRoadFeatureMeshes(THREE, kept, network);
    assert.equal(group.children.length, 1);
  });
}
