import test from "node:test";
import assert from "node:assert/strict";
import { reduceRoadNetwork } from "../src/map/road-network-reducer.js";

test("road reduction keeps a connected main-road spine with attached branches", () => {
  const nodes = Array.from({length: 9}, (_, i) => ({id:"n"+i, position:{x:i,y:0,z:0}, osm:{lat:5.6,lon:-0.2+i*.001}}));
  const edges = [
    {id:"main-a",fromNodeId:"n0",toNodeId:"n1",lengthM:100,lanes:[{id:"a",direction:"forward"}],osm:{highway:"primary"}},
    {id:"main-b",fromNodeId:"n1",toNodeId:"n2",lengthM:100,lanes:[{id:"b",direction:"forward"}],osm:{highway:"primary"}},
    {id:"main-c",fromNodeId:"n2",toNodeId:"n3",lengthM:100,lanes:[{id:"c",direction:"forward"}],osm:{highway:"trunk"}},
    {id:"branch-a",fromNodeId:"n1",toNodeId:"n4",lengthM:40,lanes:[{id:"d",direction:"forward"}],osm:{highway:"residential"}},
    {id:"branch-b",fromNodeId:"n4",toNodeId:"n5",lengthM:30,lanes:[{id:"e",direction:"forward"}],osm:{highway:"residential"}},
    {id:"branch-c",fromNodeId:"n2",toNodeId:"n6",lengthM:40,lanes:[{id:"f",direction:"forward"}],osm:{highway:"service"}},
    {id:"branch-d",fromNodeId:"n6",toNodeId:"n7",lengthM:30,lanes:[{id:"g",direction:"forward"}],osm:{highway:"service"}},
    {id:"branch-e",fromNodeId:"n7",toNodeId:"n8",lengthM:30,lanes:[{id:"h",direction:"forward"}],osm:{highway:"service"}}
  ];
  const result = reduceRoadNetwork({id:"fixture",nodes,edges,diagnostics:{}},{retainRatio:0.625});
  assert.ok(result.edges.some(edge => edge.osm.highway === "primary"));
  assert.ok(result.edges.some(edge => edge.osm.highway === "residential"));
  assert.ok(result.edges.length < edges.length);
  const reached = new Set([result.edges[0].fromNodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of result.edges) if (reached.has(edge.fromNodeId) || reached.has(edge.toNodeId)) {
      if (!reached.has(edge.fromNodeId) || !reached.has(edge.toNodeId)) changed = true;
      reached.add(edge.fromNodeId); reached.add(edge.toNodeId);
    }
  }
  assert.equal(reached.size, result.nodes.length, "all retained roads must form one connected network");
  assert.equal(result.diagnostics.selectedConnectedComponents, 1);
});
