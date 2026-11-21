import test from "node:test";
import assert from "node:assert/strict";
import { importOsmRoadNetwork } from "../src/map/osm-import.js";
import { buildNavigationIndex, findRoadRoute, sampleEdgeCenterline, createRandomDirectedRoute, sampleDirectedRoute } from "../src/map/road-navigation.js";
const bounds={south:5.5,west:-0.2,north:5.6,east:-0.1};
const way=(id,coords,tags={highway:"residential"})=>({type:"way",id,tags,geometry:coords.map(([lat,lon])=>({lat,lon}))});
test("directed navigation finds connected routes and obeys one-way roads",()=>{
 const network=importOsmRoadNetwork({areaId:"nav",bounds,elements:[
  way(1,[[5.51,-0.19],[5.52,-0.18]],{highway:"primary",oneway:"yes"}),
  way(2,[[5.52,-0.18],[5.53,-0.18]],{highway:"residential"})
 ]});
 const index=buildNavigationIndex(network),ids=network.nodes.map(n=>n.id);
 const route=findRoadRoute(index,ids[0],ids[2]);
 assert.ok(route);assert.equal(route.steps.length,2);
 assert.equal(findRoadRoute(index,ids[1],ids[0]),null);
});
test("AI route sampling returns world position and heading along curved geometry",()=>{
 const edge={centerline:[{x:0,y:0,z:0},{x:0,y:0,z:10},{x:10,y:0,z:10}]};
 const p=sampleEdgeCenterline(edge,15);
 assert.ok(Math.abs(p.x-5)<1e-8);assert.ok(Math.abs(p.z-10)<1e-8);
 assert.ok(Number.isFinite(p.headingRad));
});

test("free-drive and AI routes are generated only from directed OSM lanes",()=>{
 const network=importOsmRoadNetwork({areaId:"free-drive",bounds,elements:[
  way(10,[[5.51,-0.19],[5.52,-0.19]]),
  way(11,[[5.52,-0.19],[5.52,-0.18]]),
  way(12,[[5.52,-0.18],[5.51,-0.19]])
 ]});
 const index=buildNavigationIndex(network);
 const route=createRandomDirectedRoute(index,{startNodeId:network.nodes[0].id,stepCount:8,random:()=>0});
 assert.ok(route.steps.length>=2);
 assert.ok(route.steps.every(step=>index.outgoing.get(step.direction==="forward"
   ?network.edges.find(edge=>edge.id===step.edgeId).fromNodeId
   :network.edges.find(edge=>edge.id===step.edgeId).toNodeId).some(arc=>arc.lane.id===step.laneId)));
 const pose=sampleDirectedRoute(route,1);
 assert.ok(pose&&Number.isFinite(pose.x)&&Number.isFinite(pose.z)&&Number.isFinite(pose.headingRad));
 const wrapped=sampleDirectedRoute(route,route.distanceM+1);
 assert.ok(Math.abs(wrapped.x-pose.x)<1e-8&&Math.abs(wrapped.z-pose.z)<1e-8);
});

test("a single shared two-way lane is navigable in both directions",()=>{
 const network=importOsmRoadNetwork({areaId:"shared-lane",bounds,elements:[
  way(99,[[5.51,-0.19],[5.52,-0.19]],{highway:"residential",lanes:"1"})
 ]});
 const edge=network.edges[0], index=buildNavigationIndex(network);
 assert.equal(edge.lanes.length,1);
 assert.equal(edge.lanes[0].direction,"both");
 assert.equal(edge.roadModel.sharedLaneCount,1);
 assert.ok(findRoadRoute(index,edge.fromNodeId,edge.toNodeId));
 assert.ok(findRoadRoute(index,edge.toNodeId,edge.fromNodeId));
 assert.deepEqual(index.outgoing.get(edge.fromNodeId).map(arc=>arc.direction),["forward"]);
 assert.deepEqual(index.outgoing.get(edge.toNodeId).map(arc=>arc.direction),["reverse"]);
});
