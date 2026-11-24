import test from "node:test";
import assert from "node:assert/strict";
import { classifyFeature, createRoundaboutApproachSignFeatures, projectToLocal, selectRoadFeatures } from "../src/map/road-features.js";
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
  assert.equal(classifyFeature({ highway: "crossing", crossing: "zebra" }), "crossing");
  assert.equal(classifyFeature({ highway: "crossing", crossing: "unmarked" }), null);
  assert.equal(classifyFeature({ highway: "crossing", crossing: "uncontrolled" }), null);
  assert.equal(classifyFeature({ highway: "traffic_signals" }), "traffic_signals");
  assert.equal(classifyFeature({ highway: "traffic_signals", crossing: "traffic_signals" }), "traffic_signals");
  assert.equal(classifyFeature({ traffic_sign: "GB:50" }), "speed_limit");
  assert.equal(classifyFeature({ traffic_sign: "UK:50" }), "speed_limit");
  assert.equal(classifyFeature({ traffic_sign: "gb:50" }), "speed_limit");
  assert.equal(classifyFeature({ maxspeed: "50" }), "speed_limit");
  assert.equal(classifyFeature({ traffic_sign: "GB:roundabout" }), "roundabout_sign");
  assert.equal(classifyFeature({ traffic_sign: "UK:510" }), "roundabout_sign");
  assert.equal(classifyFeature({ traffic_sign: "uk:510" }), "roundabout_sign");
  assert.equal(classifyFeature({ traffic_sign: "UK:616" }), "no_entry_sign");
  assert.equal(classifyFeature({ traffic_sign: "UK:652" }), "one_way_sign");
  assert.equal(classifyFeature({ traffic_sign: "city_limit" }), "city_limit_sign");
  assert.equal(classifyFeature({ traffic_sign: "GB:no_entry" }), "no_entry_sign");
  assert.equal(classifyFeature({ traffic_sign: "GB:one_way" }), "one_way_sign");
  assert.equal(classifyFeature({ traffic_sign: "GB:warning" }), "warning_sign");
  assert.equal(classifyFeature({ highway: "mini_roundabout" }), "roundabout_island");
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

test("bus-stop amenities follow their OSM shelter, bench and bin tags", () => {
  const make = tags => {
    const kept = selectRoadFeatures({ features: [
      { id: "stop", kind: "bus_stop", position: { x: 35, y: 0, z: 6 }, osm: { tags } }
    ] }, network);
    const group = createRoadFeatureMeshes(THREE, kept, network);
    return group.children[0]?.geometry.attributes.position.array.length ?? 0;
  };
  const bareStop = make({ shelter: "no", bench: "no", bin: "no" });
  const equippedStop = make({ shelter: "yes", bench: "yes", bin: "yes" });
  assert.ok(bareStop > 0, "a simple mapped stop still receives a stop pole and sign");
  assert.ok(equippedStop > bareStop, "mapped shelter, bench and bin add their own geometry");
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
    { id: "m", kind: "sidewalk", line: [{ x: 5, y: 0, z: 6 }, { x: 95, y: 0, z: 6 }] },
    { id: "n", kind: "speed_limit", position: { x: 60, y: 0, z: 5 }, osm: { tags: { maxspeed: "50" } } },
    { id: "o", kind: "roundabout_sign", position: { x: 65, y: 0, z: 5 } },
    { id: "p", kind: "no_entry_sign", position: { x: 70, y: 0, z: 5 } },
    { id: "q", kind: "one_way_sign", position: { x: 75, y: 0, z: 5 } },
    { id: "r", kind: "warning_sign", position: { x: 80, y: 0, z: 5 } },
    { id: "s", kind: "pedestrian_sign", position: { x: 85, y: 0, z: 5 } },
    { id: "t", kind: "roundabout_island", position: { x: 90, y: 0, z: 0 } },
    { id: "u", kind: "city_limit_sign", position: { x: 95, y: 0, z: 0 } }
  ] }, network);
  assert.ok(kept.every(f => f.side === 1 || f.side === -1));
  const group = createRoadFeatureMeshes(THREE, kept, network);
  assert.equal(group.children.length, 1);
  const g = group.children[0].geometry, pos = g.attributes.position.array;
  assert.equal(g.attributes.color.array.length, pos.length);
  assert.ok(g.index.length % 3 === 0 && g.index.every(i => i < pos.length / 3));
  const ia=g.index[0]*3, ib=g.index[1]*3, ic=g.index[2]*3;
  const ux=pos[ib]-pos[ia], uz=pos[ib+2]-pos[ia+2], vx=pos[ic]-pos[ia], vz=pos[ic+2]-pos[ia+2];
  assert.ok(uz*vx-ux*vz>0,"feature box top faces must point upward");
  assert.equal(group.userData.counts.gantry,1,"mapped overhead gantry must be rendered");
  assert.deepEqual(Object.keys(group.userData.counts).sort(), ["barrier", "bollard", "bus_stop", "city_limit_sign", "crossing", "gantry", "give_way_sign", "no_entry_sign", "one_way_sign", "pedestrian_sign", "roundabout_island", "roundabout_sign", "sidewalk", "sign", "speed_camera", "speed_hump", "speed_limit", "stop_sign", "street_lamp", "traffic_signals", "warning_sign"]);
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

test("roundabout warning signs are generated on directed OSM approaches only",()=>{
 const road=(id,fromNodeId,toNodeId,centerline,direction,junction=null)=>({
  id,fromNodeId,toNodeId,centerline,lanes:[{id:id+"-lane",direction,widthM:3.5}],
  osm:{junction}
 });
 const graph={edges:[
  road("in-forward","west","r1",[{x:-30,y:0,z:0},{x:0,y:0,z:0}],"forward"),
  road("in-reverse","r2","east",[{x:0,y:0,z:20},{x:30,y:0,z:20}],"reverse"),
  road("out-only","r1","south",[{x:0,y:0,z:0},{x:0,y:0,z:-30}],"forward"),
  road("circle","r1","r2",[{x:0,y:0,z:0},{x:0,y:0,z:20}],"forward","roundabout")
 ]};
 const signs=createRoundaboutApproachSignFeatures(graph);
 assert.equal(signs.length,2);
 assert.deepEqual(signs.map(s=>s.id).sort(),["osm-roundabout-approach-in-forward:end","osm-roundabout-approach-in-reverse:start"]);
 assert.ok(signs.every(s=>s.kind==="roundabout_sign"&&s.position&&s.heading));
 assert.ok(signs.every(s=>Math.abs(Math.hypot(s.heading.x,s.heading.z)-1)<1e-9));
});
