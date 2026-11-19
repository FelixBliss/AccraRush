import test from "node:test";
import assert from "node:assert/strict";
import { buildArea, boolOneWay, laneRecords } from "../scripts/import-osm-road-areas.mjs";
import { validateRoadTopology } from "../src/core/road-network.js";

const config={south:5.5,west:-.3,north:5.7,east:-.1,origin:[-.2,5.6]};
const fixture=()=>[
 {type:"node",id:1,lat:5.6,lon:-.2,tags:{}},
 {type:"node",id:2,lat:5.601,lon:-.2,tags:{}},
 {type:"node",id:3,lat:5.601,lon:-.199,tags:{}},
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
 const result=buildArea("test",config,fixture(),"2026-11-19T00:00:00Z");
 assert.equal(result.network.edges.length,2);
 assert.equal(result.network.junctions.length,1);
 assert.equal(result.network.junctions[0].nodeId,"osm-node-2");
 assert.ok(result.network.junctions[0].movements.length>0);
 assert.deepEqual(validateRoadTopology(result.network),[]);
 assert.equal(result.network.edges[0].lanes[0].widthM,null);
});
test("unconnected OSM ways remain disconnected",()=>{
 const data=fixture().filter(e=>e.type!=="way"||e.id!==102);
 const result=buildArea("test",config,data,"2026-11-19T00:00:00Z");
 assert.equal(result.network.junctions.length,0);
});
