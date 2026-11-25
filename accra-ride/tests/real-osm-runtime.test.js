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
  const elevation=JSON.parse(await readFile(new URL("../data/osm/lapaz-elevation.json",import.meta.url),"utf8"));
  const features=JSON.parse(await readFile(new URL("../data/osm/lapaz.features.json",import.meta.url),"utf8"));
  const scene={children:[],add(object){this.children.push(object);},remove(object){this.children=this.children.filter(item=>item!==object);}};
  const runtime=await loadRoadNetworkRuntime({THREE,scene,areaId:"lapaz",fetcher:async url=>({
    ok:true,json:async()=>{
    const path=url.split("?")[0];
    if(path.endsWith("lapaz-madina-route.json"))return route;
    if(path.endsWith("lapaz-elevation.json"))return elevation;
    if(path.endsWith("lapaz.features.json"))return features;
    return document;
  }
  })});
  assert.ok(runtime.terrainGroup?.geometry,"Lapaz runtime must build a DEM-following terrain mesh");
  assert.ok(runtime.terrainGroup.userData.elevationRangeM>10);
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
  assert.ok(runtime.network.edges.filter(edge=>!["bus-stop-bay","pickup-bay"].includes(edge.selection?.role)).every(edge=>document.network.edges.some(source=>source.id===edge.id)), "all non-facility edges must originate in the selected OSM graph");
  assert.ok(runtime.network.edges.length>0);
  assert.equal(runtime.confirmedPedestrianBridgeCount,2,
    "the two confirmed Lapaz footbridge locations must be represented without duplicating mapped bridges");
  const confirmedBridges=runtime.roadFeatures.items.filter(feature =>
    feature.id?.startsWith("accrarush-confirmed-pedestrian-bridge-"));
  assert.equal(confirmedBridges.length,2);
  assert.ok(confirmedBridges.every(feature => feature.kind==="pedestrian_bridge" &&
    feature.edgeId && feature.line?.length===2 && feature.offsetM<=22));
  assert.ok(runtime.roadFeatures.counts.pedestrian_bridge>=2,
    "confirmed bridge features must reach the 3D road-feature renderer");
  runtime.dispose();
  assert.equal(scene.children.length,0);
});
