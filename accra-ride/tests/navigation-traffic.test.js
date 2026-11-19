import test from "node:test";
import assert from "node:assert/strict";
import { findRoute, getRouteGuidance, sampleDirectedEdge } from "../src/world/navigation/route-service.js";
import { createTrafficAgent, stepTrafficAgent, stepTrafficFleet, spawnTrafficAgents } from "../src/world/traffic/graph-traffic-agent.js";

function network() {
  const nodes = ["a","b","c","d"].map((id,i)=>({id,position:{x:i*10,y:0,z:0}}));
  const edge = (id,from,to,name,lanes=[{id:id+"-f",direction:"forward",status:"allowed",widthM:null}]) =>
    ({id,fromNodeId:from,toNodeId:to,centerline:[nodes.find(n=>n.id===from).position,nodes.find(n=>n.id===to).position],lengthM:10,name,lanes,speedLimitKph:36});
  const edges=[edge("ab","a","b","First Road"),edge("bc","b","c","Second Road"),edge("bd","b","d","Illegal Shortcut")];
  return {id:"test-network",nodes,edges,junctions:[
    {nodeId:"b",movements:[
      {fromEdgeId:"ab",fromDirection:"forward",toEdgeId:"bc",toDirection:"forward",status:"allowed"},
      {fromEdgeId:"ab",fromDirection:"forward",toEdgeId:"bd",toDirection:"forward",status:"unknown"}
    ]}
  ]};
}

test("route service chooses only explicitly allowed junction movements",()=>{
  const graph=network(),result=findRoute(graph,{startNodeId:"a",destinationNodeId:"c"});
  assert.equal(result.ok,true);
  assert.deepEqual(result.route.steps.map(s=>s.edgeId),["ab","bc"]);
  assert.equal(findRoute(graph,{startNodeId:"a",destinationNodeId:"d"}).reason,"no_verified_route");
});
test("guidance reports next road and remaining metric distance",()=>{
  const graph=network(),route=findRoute(graph,{startNodeId:"a",destinationNodeId:"c"}).route;
  const guidance=getRouteGuidance(graph,route,0,4);
  assert.equal(guidance.currentRoadName,"First Road");
  assert.equal(guidance.nextRoadName,"Second Road");
  assert.equal(guidance.remainingDistanceM,16);
  assert.equal(guidance.nextMovement,"allowed");
});
test("directed edge sampling reverses the centreline for reverse travel",()=>{
  const graph=network(),sample=sampleDirectedEdge(graph.edges[0],"reverse",0);
  assert.deepEqual(sample.position,{x:10,y:0,z:0});
  assert.ok(sample.tangent.x<0);
});
test("traffic agent advances along metres and stops without an explicit turn choice",()=>{
  const graph=network(),agent=createTrafficAgent(graph,{edgeId:"ab",laneId:"ab-f",direction:"forward",speedMps:5});
  const moved=stepTrafficAgent(graph,agent,1);
  assert.ok(moved.distanceAlongEdgeM>0);
  const nearEnd={...agent,distanceAlongEdgeM:9,speedMps:5};
  const stopped=stepTrafficAgent(graph,nearEnd,1);
  assert.equal(stopped.status,"waiting_for_legal_route_choice");
  assert.equal(stopped.speedMps,0);
  assert.equal(stopped.distanceAlongEdgeM,10);
});
test("traffic follows a selected legal movement but never an unknown movement",()=>{
  const graph=network(),agent=createTrafficAgent(graph,{edgeId:"ab",laneId:"ab-f",direction:"forward",distanceAlongEdgeM:9,speedMps:5});
  const legal=stepTrafficAgent(graph,agent,1,{chooseNext:()=>({edgeId:"bc",direction:"forward"})});
  assert.equal(legal.edgeId,"bc");
  const unknown=stepTrafficAgent(graph,agent,1,{chooseNext:()=>({edgeId:"bd",direction:"forward"})});
  assert.equal(unknown.status,"waiting_for_legal_route_choice");
});
test("traffic respects same-lane lead vehicle and does not invent overtaking",()=>{
  const graph=network(),agent=createTrafficAgent(graph,{edgeId:"ab",laneId:"ab-f",direction:"forward",distanceAlongEdgeM:2,speedMps:10});
  const moved=stepTrafficAgent(graph,agent,1,{leadVehicle:{edgeId:"ab",laneId:"ab-f",direction:"forward",distanceAlongEdgeM:12}});
  assert.ok(moved.speedMps<agent.speedMps);
  assert.equal(moved.edgeId,"ab");
});

test("fleet step applies lead-vehicle awareness to each agent",()=>{
 const graph=network();
 const rear=createTrafficAgent(graph,{id:"rear",edgeId:"ab",laneId:"ab-f",direction:"forward",distanceAlongEdgeM:2,speedMps:10});
 const front=createTrafficAgent(graph,{id:"front",edgeId:"ab",laneId:"ab-f",direction:"forward",distanceAlongEdgeM:12,speedMps:2});
 const [nextRear,nextFront]=stepTrafficFleet(graph,[rear,front],1);
 assert.ok(nextRear.speedMps<rear.speedMps);
 assert.equal(nextFront.id,"front");
});
test("traffic spawn helper is deterministic and uses only verified lanes",()=>{
 const graph=network();
 const first=spawnTrafficAgents(graph,{count:2,seed:42,minSpacingM:2});
 const second=spawnTrafficAgents(graph,{count:2,seed:42,minSpacingM:2});
 assert.deepEqual(first.map(a=>[a.edgeId,a.laneId,a.direction,a.distanceAlongEdgeM]),
   second.map(a=>[a.edgeId,a.laneId,a.direction,a.distanceAlongEdgeM]));
 assert.ok(first.every(a=>graph.edges.find(e=>e.id===a.edgeId).lanes.find(l=>l.id===a.laneId).status==="allowed"));
});
