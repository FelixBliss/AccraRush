import test from "node:test";
import assert from "node:assert/strict";
import { analyzeNetwork } from "../scripts/analyze-racing-circuits.js";

function square() {
  const points = [[0,0],[100,0],[100,100],[0,100]];
  const nodes = points.map((p,i)=>({id:"n"+i,position:{x:p[0],y:0,z:p[1]}}));
  const names = ["Ring Road Central","Independence Avenue","Liberation Road","Castle Road"];
  const edges = points.map((p,i)=>({
    id:"e"+i,fromNodeId:"n"+i,toNodeId:"n"+((i+1)%4),lengthM:100,
    centerline:[{x:p[0],y:0,z:p[1]},{x:points[(i+1)%4][0],y:0,z:points[(i+1)%4][1]}],
    osm:{name:names[i],highway:"primary"},
    lanes:[{id:"l"+i,direction:"forward",widthM:3.5}]
  }));
  return {id:"fixture",version:1,nodes,edges};
}

test("analyzer finds a real directed closed circuit and preserves its source edge ids", () => {
  const report = analyzeNetwork(square(),"accra-central");
  assert.equal(report.circuit.closed,true);
  assert.equal(report.circuit.startNodeId,report.circuit.endNodeId);
  assert.equal(report.circuit.edgeCount,4);
  assert.equal(report.circuit.distanceM,400);
  assert.equal(report.circuit.namedRoads.length,4);
  assert.deepEqual(new Set(report.circuit.steps.map(s=>s.edgeId)),new Set(["e0","e1","e2","e3"]));
});

test("analyzer does not invent reverse travel on one-way roads", () => {
  const network=square();
  network.edges[0].lanes=[{id:"l0",direction:"forward",widthM:3.5}];
  const report=analyzeNetwork(network,"lapaz");
  assert.ok(report.circuit.steps.every(step=>step.direction==="forward"));
});

test("analyzer reports no cyclic component for a one-way chain", () => {
  const network=square();
  network.edges=network.edges.slice(0,2);
  const report=analyzeNetwork(network,"lapaz");
  assert.equal(report.circuit,null);
  assert.equal(report.counts.cyclicComponents,0);
});
