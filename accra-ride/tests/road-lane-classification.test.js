import test from "node:test";
import assert from "node:assert/strict";
import { classifyOsmLanes } from "../src/map/road-lane-classification.js";
import { importOsmRoadNetwork } from "../src/map/osm-import.js";

const bounds={south:5.5,west:-0.2,north:5.6,east:-0.1};
const way=(id,tags)=>({type:"way",id,tags,geometry:[{lat:5.51,lon:-0.19},{lat:5.52,lon:-0.18}]});

test("explicit directional lane tags take precedence over class defaults",()=>{
 const result=classifyOsmLanes({highway:"primary",lanes:"5","lanes:forward":"3","lanes:backward":"2"});
 assert.equal(result.forwardLaneCount,3);
 assert.equal(result.reverseLaneCount,2);
 assert.equal(result.confidence,"tagged");
 assert.equal(result.layoutSource,"osm:lanes:forward+backward");
});

test("explicit total lane count is honoured and odd totals are transparently allocated",()=>{
 const result=classifyOsmLanes({highway:"residential",lanes:"3"});
 assert.equal(result.totalLaneCount,3);
 assert.equal(result.forwardLaneCount,2);
 assert.equal(result.reverseLaneCount,1);
 assert.equal(result.confidence,"mixed");
 assert.equal(result.layoutSource,"osm:lanes+inferred:direction-split");
});

test("directional lane count plus total derives the opposite direction",()=>{
 const result=classifyOsmLanes({highway:"primary",lanes:"5","lanes:forward":"3"});
 assert.equal(result.forwardLaneCount,3);
 assert.equal(result.reverseLaneCount,2);
 assert.equal(result.confidence,"mixed");
});

test("one-way and reverse-only semantics never fabricate an opposing direction",()=>{
 const forward=classifyOsmLanes({highway:"primary",oneway:"yes",lanes:"3"});
 assert.equal(forward.forwardLaneCount,3);
 assert.equal(forward.reverseLaneCount,0);
 const reverse=classifyOsmLanes({highway:"residential",oneway:"-1",lanes:"2"});
 assert.equal(reverse.forwardLaneCount,0);
 assert.equal(reverse.reverseLaneCount,2);
});

test("roundabouts are treated as one-way when direction is not separately tagged",()=>{
 const result=classifyOsmLanes({highway:"primary",junction:"roundabout",lanes:"2"});
 assert.equal(result.oneWay,true);
 assert.equal(result.forwardLaneCount,2);
 assert.equal(result.reverseLaneCount,0);
});

test("tagged carriageway width is converted to per-lane width without arbitrary clamping",()=>{
 const metric=classifyOsmLanes({highway:"primary",lanes:"4",width:"14"});
 assert.equal(metric.carriagewayWidthM,14);
 assert.equal(metric.laneWidthM,3.5);
 assert.equal(metric.widthSource,"osm:width");
 const feet=classifyOsmLanes({highway:"residential",lanes:"2",width:"20 ft"});
 assert.ok(Math.abs(feet.carriagewayWidthM-6.096)<1e-9);
 assert.ok(Math.abs(feet.laneWidthM-3.048)<1e-9);
});

test("untagged fallback is explicit and traceable rather than represented as OSM fact",()=>{
 const result=classifyOsmLanes({highway:"secondary"});
 assert.equal(result.totalLaneCount,4);
 assert.equal(result.confidence,"inferred");
 assert.equal(result.layoutSource,"inferred:highway-class");
 assert.equal(result.widthSource,"inferred:default-lane-width");
});

test("contradictory directional and total tags are retained as warnings",()=>{
 const result=classifyOsmLanes({highway:"primary",lanes:"4","lanes:forward":"3","lanes:backward":"2"});
 assert.equal(result.totalLaneCount,5);
 assert.ok(result.warnings.some(w=>w.includes("disagrees")));
});

test("importer stores RD-02 lane provenance and road-structure source tags",()=>{
 const graph=importOsmRoadNetwork({areaId:"rd02",bounds,elements:[way(900,{
  highway:"primary",lanes:"4","lanes:forward":"2","lanes:backward":"2",width:"14",
  bridge:"yes",layer:"1",sidewalk:"both",cycleway:"lane",access:"permissive"
 })]});
 const edge=graph.edges[0];
 assert.equal(edge.roadModel.totalLaneCount,4);
 assert.equal(edge.roadModel.laneLayoutConfidence,"tagged");
 assert.equal(edge.roadModel.laneLayoutSource,"osm:lanes:forward+backward");
 assert.equal(edge.roadModel.carriagewayWidthM,14);
 assert.equal(edge.osm.bridge,"yes");
 assert.equal(edge.osm.layer,"1");
 assert.equal(edge.osm.sidewalk,"both");
 assert.equal(edge.osm.cycleway,"lane");
 assert.equal(edge.osm.access,"permissive");
});

test("a tagged single-lane two-way road is represented as one shared lane",()=>{
 const result=classifyOsmLanes({highway:"residential",lanes:"1"});
 assert.equal(result.totalLaneCount,1);
 assert.equal(result.forwardLaneCount,0);
 assert.equal(result.reverseLaneCount,0);
 assert.equal(result.sharedLaneCount,1);
 assert.equal(result.lanes[0].direction,"both");
 assert.equal(result.layoutSource,"osm:lanes+shared-bidirectional");
});
