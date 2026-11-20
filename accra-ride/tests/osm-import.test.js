import test from "node:test";
import assert from "node:assert/strict";
import { importOsmRoadNetwork, mergeOverpassTiles } from "../src/map/osm-import.js";
import { validateRoadNetwork } from "../src/core/validators.js";

const bounds={south:5.5,west:-0.2,north:5.6,east:-0.1};
const way=(id,coords,tags={highway:"residential"})=>({type:"way",id,tags,geometry:coords.map(([lat,lon])=>({lat,lon}))});

test("imports curved OSM ways into stable metre-based road edges",()=>{
 const graph=importOsmRoadNetwork({areaId:"test",bounds,elements:[way(1,[[5.51,-0.19],[5.515,-0.185],[5.52,-0.18]])]});
 assert.equal(graph.edges.length,1);
 assert.equal(graph.edges[0].centerline.length,3);
 assert.ok(graph.edges[0].lengthM>0);
 assert.deepEqual(validateRoadNetwork(graph),[]);
 assert.equal(graph.edges[0].osm.wayId,"1");
});

test("splits roads at shared OSM geometry vertices and connects junctions",()=>{
 const graph=importOsmRoadNetwork({areaId:"test",bounds,elements:[
  way(1,[[5.51,-0.19],[5.52,-0.18],[5.53,-0.19]]),
  way(2,[[5.52,-0.18],[5.52,-0.17]])
 ]});
 assert.equal(graph.nodes.length,4);
 assert.equal(graph.edges.length,3);
 assert.equal(graph.diagnostics.junctionNodeCount,1);
 assert.deepEqual(validateRoadNetwork(graph),[]);
});

test("respects one-way direction and preserves reverse-only OSM ways",()=>{
 const graph=importOsmRoadNetwork({areaId:"test",bounds,elements:[
  way(1,[[5.51,-0.19],[5.52,-0.18]],{highway:"primary",oneway:"yes"}),
  way(2,[[5.52,-0.18],[5.53,-0.18]],{highway:"residential",oneway:"-1"})
 ]});
 assert.deepEqual(graph.edges.map(e=>e.lanes.map(l=>l.direction)),[["forward"],["reverse"]]);
 assert.deepEqual(validateRoadNetwork(graph),[]);
});

test("merges overlapping tiles by OSM way id without duplicate roads",()=>{
 const w=way(42,[[5.51,-0.19],[5.52,-0.18]]);
 const merged=mergeOverpassTiles([{elements:[w]},{elements:[w,way(43,[[5.52,-0.18],[5.53,-0.18]])]}]);
 assert.deepEqual(merged.map(x=>String(x.id)),["42","43"]);
});

test("rejects empty or malformed OSM inputs",()=>{
 assert.throws(()=>importOsmRoadNetwork({areaId:"x",bounds,elements:[]}),/No supported highway ways/);
 assert.throws(()=>mergeOverpassTiles([{elements:null}]),/elements array/);
});

test("clips complete OSM ways to approved area bounds while preserving source way IDs",()=>{
 const graph=importOsmRoadNetwork({areaId:"clip",bounds,elements:[
  way(900,[[5.49,-0.19],[5.55,-0.19],[5.61,-0.19]])
 ]});
 assert.ok(graph.nodes.length>=2);
 assert.ok(graph.nodes.every(n=>n.osm.lat>=bounds.south-1e-8&&n.osm.lat<=bounds.north+1e-8&&n.osm.lon>=bounds.west-1e-8&&n.osm.lon<=bounds.east+1e-8));
 assert.ok(graph.edges.every(e=>e.osm.wayId==="900"));
 assert.ok(graph.edges.every(e=>e.centerline.length>=2));
 assert.deepEqual(validateRoadNetwork(graph),[]);
});

test("defaults one-way roads to one lane and two-way roads to one lane per direction",()=>{
 const graph=importOsmRoadNetwork({areaId:"lane-defaults",bounds,elements:[
  way(70,[[5.51,-0.19],[5.52,-0.19]],{highway:"primary",oneway:"yes"}),
  way(71,[[5.52,-0.19],[5.53,-0.19]],{highway:"residential"})
 ]});
 assert.deepEqual(graph.edges[0].lanes.map(l=>l.widthM),[3.5]);
 assert.deepEqual(graph.edges[1].lanes.map(l=>l.widthM),[3.5,3.5]);
});
