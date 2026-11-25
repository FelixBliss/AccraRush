import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadRoadNetworkRuntime } from "../src/map/road-network-runtime.js";

class Group { constructor(){this.children=[];this.userData={};} add(...children){this.children.push(...children);} traverse(fn){fn(this);for(const child of this.children)fn(child);} }
class BufferGeometry { constructor(){this.attributes={};this.index=[];} setAttribute(n,v){this.attributes[n]=v;} setIndex(v){this.index=v;} computeVertexNormals(){} dispose(){} }
class Float32BufferAttribute { constructor(array,itemSize){this.array=array;this.itemSize=itemSize;} }
class Mesh { constructor(geometry,material){this.geometry=geometry;this.material=material;this.userData={};} }
class LineSegments extends Mesh {}
class Vector2 { constructor(x,y){this.x=x;this.y=y;} }
class Material { constructor(options){this.options=options;} dispose(){} }
const THREE={
  Group,BufferGeometry,Float32BufferAttribute,Mesh,LineSegments,Vector2,
  MeshStandardMaterial:Material,LineBasicMaterial:Material,
  ShapeUtils:{triangulateShape:contour=>{const out=[];for(let i=1;i<contour.length-1;i++)out.push([0,i,i+1]);return out;}}
};

test("Lapaz runtime loads only the approved open Lapaz–Madina OSM corridor", async () => {
  const document=JSON.parse(await readFile(new URL("../data/osm/lapaz.network.json",import.meta.url),"utf8"));
  const route=JSON.parse(await readFile(new URL("../data/osm/lapaz-madina-route.json",import.meta.url),"utf8"));
  const scene={children:[],add(object){this.children.push(object);},remove(object){this.children=this.children.filter(item=>item!==object);}};
  const runtime=await loadRoadNetworkRuntime({THREE,scene,areaId:"lapaz",fetcher:async url=>{
    const path=url.split("?")[0];
    if(path.endsWith("lapaz-madina-route.json")) return {ok:true,json:async()=>route};
    if(path.endsWith("lapaz-madina-area-signs.json") || path.endsWith("lapaz.features.json")) return {ok:false,status:404};
    return {ok:true,json:async()=>document};
  }});
  assert.equal(runtime.raceCircuit.closed,false);
  assert.equal(runtime.raceCircuit.startNodeId,route.startNodeId);
  assert.equal(runtime.raceCircuit.destinationNodeId,route.endNodeId);
  assert.notEqual(runtime.raceCircuit.startNodeId,runtime.raceCircuit.destinationNodeId);
  assert.equal(runtime.raceCircuit.waypoints.length,2);
  assert.equal(runtime.returnHighwayRoute.startNodeId,route.endNodeId);
  assert.equal(runtime.returnHighwayRoute.destinationNodeId,route.startNodeId);
  assert.equal(runtime.returnHighwayRoute.closed,false);
  assert.deepEqual(runtime.featuredRoadNames,route.namedRoads);
  assert.deepEqual(runtime.roadsideBuildings,{available:false,count:0,disabled:true});
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
