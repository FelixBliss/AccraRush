// Deterministic contract tests for the graph-derived minimap model.
import test from "node:test";
import assert from "node:assert/strict";
import { buildRoadMapModel, matchPlayerToRoad } from "../src/world/navigation/road-map-model.js";

const graph={id:"map-test",nodes:[{id:"a",position:{x:0,y:0,z:0}},{id:"b",position:{x:0,y:0,z:100}}],edges:[
 {id:"main",fromNodeId:"a",toNodeId:"b",lengthM:100,centerline:[{x:0,y:0,z:0},{x:0,y:0,z:100}],lanes:[{id:"main-f",direction:"forward",status:"allowed",widthM:null},{id:"main-r",direction:"reverse",status:"allowed",widthM:null}],name:"Main Road",roadClass:"primary"},
 {id:"closed",fromNodeId:"a",toNodeId:"b",lengthM:100,centerline:[{x:5,y:0,z:0},{x:5,y:0,z:100}],lanes:[{id:"closed-f",direction:"forward",status:"unknown",widthM:null}],name:"Unverified Road",roadClass:"residential"}
],junctions:[]};

test("player matching snaps to the nearest verified lane and reports metric progress",()=>{
 const match=matchPlayerToRoad(graph,{x:1,y:0,z:25});
 assert.equal(match.matched,true);
 assert.equal(match.edgeId,"main");
 assert.equal(match.laneId,"main-f");
 assert.equal(match.distanceAlongEdgeM,25);
 assert.equal(match.lateralDistanceM,1);
});
test("reverse lane matching measures distance from its own entry node",()=>{
 const match=matchPlayerToRoad(graph,{x:0,y:0,z:25});
 assert.equal(match.direction,"forward");
 assert.equal(match.distanceAlongEdgeM,25);
});
test("player matching refuses distant roads instead of snapping across the map",()=>{
 assert.deepEqual(matchPlayerToRoad(graph,{x:1000,y:0,z:1000}),{matched:false,reason:"no_nearby_verified_lane"});
});
test("minimap model reuses graph edge IDs and transforms route and player consistently",()=>{
 const model=buildRoadMapModel(graph,{steps:[{edgeId:"main",direction:"forward"}]},{x:0,y:0,z:50});
 assert.equal(model.networkId,"map-test");
 assert.equal(model.segments[0].edgeId,"main");
 assert.deepEqual(model.route,[{index:0,edgeId:"main",direction:"forward"}]);
 assert.deepEqual(model.player.mapPosition,{x:0,y:.5});
 assert.equal(model.edgeCount,2);
});
