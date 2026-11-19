import test from "node:test";
import assert from "node:assert/strict";
import { buildArea, boolOneWay, laneRecords, isMotorRoad } from "../scripts/import-osm-road-areas.mjs";
import { validateRoadTopology } from "../src/core/road-network.js";

const config={south:5.5,west:-.3,north:5.7,east:-.1,origin:[-.2,5.6]};
const fixture=()=>[
 {type:"node",id:1,lat:5.6,lon:-.2,tags:{}},
 {type:"node",id:2,lat:5.601,lon:-.2,tags:{}},
 {type:"node",id:3,lat:5.601,lon:-.199,tags:{}},
 {type:"node",id:4,lat:5.602,lon:-.198,tags:{amenity:"clinic",name:"Test Clinic"}},
 {type:"way",id:101,nodes:[1,2],tags:{highway:"primary",name:"Test Road"}},
 {type:"way",id:102,nodes:[2,3],tags:{highway:"residential",oneway:"no"}}
];
test("OSM oneway tags map to legal directed lane availability",()=>{
 assert.equal(boolOneWay({oneway:"yes"}),"forward");
 assert.equal(boolOneWay({oneway:"-1"}),"reverse");
 assert.equal(boolOneWay({oneway:"no"}),"both");
 assert.deepEqual(laneRecords({tags:{oneway:"yes",lanes:"2"}},"e").map(l=>l.direction),["forward"]);
 assert.equal(laneRecords({tags:{oneway:"yes",lanes:"2"}},"e")[0].laneCount,2);
 assert.equal(laneRecords({tags:{lanes:"4"}},"e")[0].laneCount,null);
});
test("OSM way intersections become explicit graph junctions",()=>{
 assert.equal(isMotorRoad(fixture().find(element=>element.type==="way"&&element.id===101)),true);
 const result=buildArea("test",config,fixture(),"2026-11-19T00:00:00Z");
 assert.equal(result.manifest.counts.osmMotorRoadWays,2);
 assert.equal(result.network.edges.length,2);
 assert.equal(result.network.junctions.length,1);
 assert.equal(result.network.junctions[0].nodeId,"osm-node-2");
 assert.ok(result.network.junctions[0].movements.length>0);
 assert.deepEqual(validateRoadTopology(result.network),[]);
 assert.equal(result.network.edges[0].lanes[0].widthM,null);
 assert.equal(result.manifest.counts.landmarks,1);
 assert.equal(result.landmarks.landmarks[0].name,"Test Clinic");
});
test("unconnected OSM ways remain disconnected",()=>{
 const data=fixture().filter(e=>e.type!=="way"||e.id!==102);
 const result=buildArea("test",config,data,"2026-11-19T00:00:00Z");
 assert.equal(result.network.junctions.length,0);
});

test("via-way turn restrictions remain unresolved and cannot enable junction routing",()=>{
 const data=[
  {type:"node",id:11,lat:5.6,lon:-.2,tags:{}},
  {type:"node",id:12,lat:5.601,lon:-.2,tags:{}},
  {type:"node",id:13,lat:5.602,lon:-.2,tags:{}},
  {type:"node",id:14,lat:5.603,lon:-.2,tags:{}},
  {type:"way",id:201,nodes:[11,12],tags:{highway:"primary",oneway:"yes"}},
  {type:"way",id:202,nodes:[12,13],tags:{highway:"primary",oneway:"yes"}},
  {type:"way",id:203,nodes:[13,14],tags:{highway:"primary",oneway:"yes"}},
  {type:"relation",id:9001,tags:{type:"restriction",restriction:"no_straight_on"},members:[
   {type:"way",ref:201,role:"from"},{type:"way",ref:202,role:"via"},{type:"way",ref:203,role:"to"}
  ]}
 ];
 const result=buildArea("via-way-test",config,data,"2026-11-19T00:00:00Z");
 assert.equal(result.manifest.quality.turnRestrictionRelations.unresolved,1);
 assert.ok(result.manifest.warnings.some(w=>w.includes("9001")));
 assert.ok(result.network.junctions.every(j=>j.movements.every(m=>m.status==="unknown")));
 assert.deepEqual(validateRoadTopology(result.network),[]);
});
