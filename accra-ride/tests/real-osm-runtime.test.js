import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadRoadNetworkRuntime } from "../src/map/road-network-runtime.js";

class Group { constructor(){this.children=[];this.userData={};} add(child){this.children.push(child);} traverse(fn){fn(this);for(const child of this.children)fn(child);} }
class BufferGeometry { constructor(){this.attributes={};this.index=[];} setAttribute(n,v){this.attributes[n]=v;} setIndex(v){this.index=v;} computeVertexNormals(){} dispose(){} }
class Float32BufferAttribute { constructor(array,itemSize){this.array=array;this.itemSize=itemSize;} }
class Mesh { constructor(geometry,material){this.geometry=geometry;this.material=material;this.userData={};} }
class LineSegments extends Mesh {}
class Material { constructor(options){this.options=options;} dispose(){} }
const THREE={Group,BufferGeometry,Float32BufferAttribute,Mesh,LineSegments,MeshStandardMaterial:Material,LineBasicMaterial:Material};

test("Lapaz runtime loads only the approved open Lapaz–Madina OSM corridor", async () => {
  const document=JSON.parse(await readFile(new URL("../data/osm/lapaz.network.json",import.meta.url),"utf8"));
  const route=JSON.parse(await readFile(new URL("../data/osm/lapaz-madina-route.json",import.meta.url),"utf8"));
  const scene={children:[],add(object){this.children.push(object);},remove(object){this.children=this.children.filter(item=>item!==object);}};
  const runtime=await loadRoadNetworkRuntime({THREE,scene,areaId:"lapaz",fetcher:async url=>({
    ok:true,json:async()=>url.split("?")[0].endsWith("lapaz-madina-route.json")?route:document
  })});
  assert.equal(runtime.raceCircuit.closed,false);
  assert.equal(runtime.raceCircuit.startNodeId,route.startNodeId);
  assert.equal(runtime.raceCircuit.destinationNodeId,route.endNodeId);
  assert.notEqual(runtime.raceCircuit.startNodeId,runtime.raceCircuit.destinationNodeId);
  assert.equal(runtime.raceCircuit.waypoints.length,2);
  assert.equal(runtime.returnHighwayRoute.startNodeId,route.endNodeId);
  assert.equal(runtime.returnHighwayRoute.destinationNodeId,route.startNodeId);
  assert.equal(runtime.returnHighwayRoute.closed,false);
  assert.deepEqual(runtime.featuredRoadNames,route.namedRoads);
  assert.equal(runtime.minimap.raceCircuit.closed,false);
  assert.deepEqual(runtime.minimap.raceCircuit.outboundEdgeIds,runtime.raceCircuit.steps.map(step=>step.edgeId));
  assert.deepEqual(runtime.minimap.raceCircuit.returnEdgeIds,runtime.returnHighwayRoute.steps.map(step=>step.edgeId));
  assert.deepEqual(runtime.minimap.roads.map(road=>road.id),[...new Set(runtime.raceCircuit.steps.map(step=>step.edgeId))]);
  assert.ok(runtime.minimap.raceCircuit.edgeIds.every(id=>runtime.network.edges.some(edge=>edge.id===id)));
  assert.equal(runtime.playerRoute.startNodeId,route.startNodeId);
  assert.equal(runtime.sample(runtime.raceCircuit,0)?.edge?.selection?.role,"route");
  assert.equal(runtime.createCircuitTrafficRoute(),runtime.raceCircuit);
  assert.equal(runtime.createReturnHighwayTrafficRoute(),runtime.returnHighwayRoute);
  assert.ok(runtime.network.edges.every(edge=>document.network.edges.some(source=>source.id===edge.id)));
  assert.ok(runtime.network.edges.length>0);
  runtime.dispose();
  assert.equal(scene.children.length,0);
});
