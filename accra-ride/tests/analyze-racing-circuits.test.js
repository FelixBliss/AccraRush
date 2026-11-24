import test from "node:test";
import assert from "node:assert/strict";
import { analyzeNetwork } from "../scripts/analyze-racing-circuits.js";

function ring() {
  const count=20;
  const nodes=Array.from({length:count},(_,i)=>({id:"n"+i,position:{x:i*10,y:0,z:0}}));
  const names=["Ring Road Central","Independence Avenue","Liberation Road","Castle Road"];
  const edges=Array.from({length:count},(_,i)=>({
    id:"e"+i,fromNodeId:"n"+i,toNodeId:"n"+((i+1)%count),lengthM:100,
    centerline:[nodes[i].position,nodes[(i+1)%count].position],
    osm:{name:names[i%names.length],highway:"primary"},
    lanes:[{id:"l"+i,direction:"both",widthM:3.5}]
  }));
  return {id:"fixture",version:1,nodes,edges};
}

test("analyzer finds a directed closed circuit and preserves source edge ids",()=>{
  const report=analyzeNetwork(ring(),"accra-central");
  assert.equal(report.circuit.closed,true);
  assert.equal(report.circuit.startNodeId,report.circuit.endNodeId);
  assert.equal(report.circuit.edgeCount,20);
  assert.equal(report.circuit.distanceM,2000);
  assert.equal(report.circuit.namedRoads.length,4);
  assert.equal(new Set(report.circuit.steps.map(s=>s.edgeId)).size,20);
});

test("analyzer respects one-way travel and never fabricates reverse direction",()=>{
  const network=ring();
  network.edges.forEach((edge,i)=>{edge.lanes=[{id:"l"+i,direction:"forward",widthM:3.5}];});
  const report=analyzeNetwork(network,"lapaz");
  assert.ok(report.circuit.steps.every(step=>step.direction==="forward"));
});

test("analyzer reports no cyclic component for a one-way chain",()=>{
  const network=ring();
  network.edges=network.edges.slice(0,2);
  network.edges.forEach(edge=>{edge.lanes=[{id:edge.lanes[0].id,direction:"forward",widthM:3.5}];});
  const report=analyzeNetwork(network,"lapaz");
  assert.equal(report.circuit,null);
  assert.equal(report.counts.cyclicComponents,0);
});
