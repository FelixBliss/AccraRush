import test from "node:test";
import assert from "node:assert/strict";
import { importOsmRoadNetwork } from "../src/map/osm-import.js";
import { buildNavigationIndex, findRoadRoute, sampleEdgeCenterline } from "../src/map/road-navigation.js";
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
