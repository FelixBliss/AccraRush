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
 const firstWay=graph.edges.filter(edge=>edge.osm.wayId==="1");
 const secondWay=graph.edges.find(edge=>edge.osm.wayId==="2");
 assert.equal(firstWay.length,2);
 assert.ok(firstWay.every(edge=>edge.roadModel.physicalRoadId==="osm-road-1"));
 assert.ok(firstWay.every(edge=>edge.roadModel.carriagewayId==="osm-carriageway-1"));
 assert.notEqual(firstWay[0].roadModel.carriagewayId,secondWay.roadModel.carriagewayId);
 assert.ok(firstWay.every(edge=>edge.roadModel.carriagewayDirection==="bidirectional"));
 assert.deepEqual(validateRoadNetwork(graph),[]);
});

test("respects one-way direction and preserves reverse-only OSM ways",()=>{
 const graph=importOsmRoadNetwork({areaId:"test",bounds,elements:[
  way(1,[[5.51,-0.19],[5.52,-0.18]],{highway:"primary",oneway:"yes"}),
  way(2,[[5.52,-0.18],[5.53,-0.18]],{highway:"residential",oneway:"-1"})
 ]});
 assert.equal(graph.edges[0].lanes.length,4,"one-way main road has four forward lanes");
 assert.ok(graph.edges[0].lanes.every(l=>l.direction==="forward"&&l.widthM===3.5));
 assert.equal(graph.edges[1].lanes.length,2,"two-lane reverse-only branch has two reverse lanes");
 assert.ok(graph.edges[1].lanes.every(l=>l.direction==="reverse"&&l.widthM===3.5));
 assert.equal(graph.edges[1].roadModel.carriagewayDirection,"reverse");
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

test("enforces four lanes on main roads and two lanes on branch roads",()=>{
 const graph=importOsmRoadNetwork({areaId:"lane-defaults",bounds,elements:[
  way(70,[[5.51,-0.19],[5.52,-0.19]],{highway:"primary",oneway:"yes"}),
  way(71,[[5.52,-0.19],[5.53,-0.19]],{highway:"residential"}),
  way(72,[[5.53,-0.19],[5.54,-0.19]],{highway:"tertiary"})
 ]});
 assert.equal(graph.edges[0].lanes.length,4);
 assert.deepEqual(graph.edges[0].lanes.map(l=>l.widthM),[3.5,3.5,3.5,3.5]);
 assert.deepEqual(graph.edges[1].lanes.map(l=>l.direction),["forward","reverse"]);
 assert.deepEqual(graph.edges[1].lanes.map(l=>l.widthM),[3.5,3.5]);
 assert.deepEqual(graph.edges[2].lanes.map(l=>l.direction),["forward","reverse"]);
 assert.deepEqual(graph.edges[2].lanes.map(l=>l.widthM),[3.5,3.5]);
});

test("groups verified opposite one-way carriageways under one physical road",()=>{
 const graph=importOsmRoadNetwork({areaId:"paired-carriageways",bounds,elements:[
  way(100,[[5.51,-0.19],[5.52,-0.19]],{highway:"primary",name:"Ring Road",oneway:"yes"}),
  way(101,[[5.52,-0.18985],[5.51,-0.18985]],{highway:"primary",name:"Ring Road",oneway:"yes"})
 ]});
 const a=graph.edges.find(edge=>edge.osm.wayId==="100");
 const b=graph.edges.find(edge=>edge.osm.wayId==="101");
 assert.ok(a && b);
 assert.equal(a.roadModel.physicalRoadId,b.roadModel.physicalRoadId);
 assert.notEqual(a.roadModel.carriagewayId,b.roadModel.carriagewayId);
 assert.deepEqual(a.roadModel.pairedWayIds,["100","101"]);
 assert.equal(a.roadModel.groupingSource,"osm:paired-oneway-carriageways");
 assert.equal(b.roadModel.groupingSource,"osm:paired-oneway-carriageways");
 assert.ok(a.roadModel.groupingEvidence.meanDistanceM>=4);
 assert.ok(a.roadModel.groupingEvidence.meanDistanceM<=45);
});

test("does not group same-direction parallel roads or unrelated names",()=>{
 const graph=importOsmRoadNetwork({areaId:"unpaired-carriageways",bounds,elements:[
  way(110,[[5.51,-0.19],[5.52,-0.19]],{highway:"primary",name:"Ring Road",oneway:"yes"}),
  way(111,[[5.51,-0.18985],[5.52,-0.18985]],{highway:"primary",name:"Ring Road",oneway:"yes"}),
  way(112,[[5.51,-0.1897],[5.52,-0.1897]],{highway:"primary",name:"Other Road",oneway:"yes"})
 ]});
 const a=graph.edges.find(edge=>edge.osm.wayId==="110");
 const b=graph.edges.find(edge=>edge.osm.wayId==="111");
 const c=graph.edges.find(edge=>edge.osm.wayId==="112");
 assert.notEqual(a.roadModel.physicalRoadId,b.roadModel.physicalRoadId);
 assert.notEqual(a.roadModel.physicalRoadId,c.roadModel.physicalRoadId);
 assert.equal(a.roadModel.groupingSource,"osm:single-way");
});
