import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadRoadNetworkRuntime } from "../src/map/road-network-runtime.js";
import { buildNavigationIndex, createRandomDirectedRoute, sampleDirectedRoute } from "../src/map/road-navigation.js";

class Group {
  constructor(){this.children=[];this.userData={};}
  add(child){this.children.push(child);}
  traverse(callback){callback(this);for(const child of this.children)callback(child);}
}
class BufferGeometry {
  constructor(){this.attributes={};this.index=[];}
  setAttribute(name,value){this.attributes[name]=value;}
  setIndex(value){this.index=value;}
  computeVertexNormals(){}
  dispose(){}
}
class Float32BufferAttribute { constructor(array,itemSize){this.array=array;this.itemSize=itemSize;} }
class Mesh { constructor(geometry,material){this.geometry=geometry;this.material=material;this.userData={};} }
class LineSegments extends Mesh {}
class Material { constructor(options){this.options=options;} dispose(){} }
const THREE={Group,BufferGeometry,Float32BufferAttribute,Mesh,LineSegments,
  MeshStandardMaterial:Material,LineBasicMaterial:Material};

for (const areaId of ["accra-central"]) {
  test(areaId + " generated OSM dataset renders and supports real directed player and AI routes", async () => {
    const document = JSON.parse(await readFile(new URL("../data/osm/" + areaId + ".network.json", import.meta.url), "utf8"));
    const network = document.network;
    const index = buildNavigationIndex(network);
    const playerRoute = createRandomDirectedRoute(index, { stepCount: 100 });
    assert.ok(playerRoute.steps.length >= 50, "player route must traverse many real OSM edges");
    assert.ok(playerRoute.distanceM > 1000, "player route must span a meaningful driving distance");
    const playerPose = sampleDirectedRoute(playerRoute, playerRoute.distanceM * 0.4);
    assert.ok(playerPose && Number.isFinite(playerPose.x) && Number.isFinite(playerPose.z));
    assert.ok(network.edges.some(edge => edge.id === playerPose.edgeId));

    const aiStart = playerRoute.segments[Math.min(10, playerRoute.segments.length - 1)].fromNodeId;
    const aiRoute = createRandomDirectedRoute(index, { startNodeId: aiStart, stepCount: 60 });
    assert.ok(aiRoute.steps.length >= 30, "AI route must traverse real directed OSM edges");
    const aiPose = sampleDirectedRoute(aiRoute, Math.min(250, aiRoute.distanceM));
    assert.ok(aiPose && Number.isFinite(aiPose.headingRad));
    assert.ok(network.edges.some(edge => edge.id === aiPose.edgeId));

    const scene={children:[],add(object){this.children.push(object);},remove(object){this.children=this.children.filter(item=>item!==object);}};
    const circuitManifest = JSON.parse(await readFile(new URL("../data/osm/" + areaId + ".candidate-race-circuit.json", import.meta.url), "utf8"));
    const runtime=await loadRoadNetworkRuntime({
      THREE,scene,areaId,trafficRouteSteps:60,playerRouteSteps:100,
      fetcher:async(url)=>({
        ok:true,
        json:async()=>url.split("?")[0].endsWith(".candidate-race-circuit.json") ? circuitManifest : document
      })
    });
    const mainEdges=network.edges.filter(edge=>["motorway","trunk","primary","secondary"].includes(edge.osm?.highway));
    const expectedFeatured = [...circuitManifest.namedRoads];
    assert.deepEqual(runtime.featuredRoadNames, expectedFeatured, "all selected circuit roads must be exposed by the runtime");
    for (const name of expectedFeatured) {
      assert.ok(runtime.network.edges.some(edge => edge.selection?.routeName === name), "selected circuit road must exist in the playable graph: " + name);
    }
    const spawnPose = runtime.sample(runtime.playerRoute, 0);
    assert.equal(runtime.playerRoute.steps.length, 1, "manual steering starts from one real circuit entry segment rather than an automatic route");
    assert.equal(runtime.playerRoute.startNodeId,runtime.raceCircuit.startNodeId,"player must spawn at the selected circuit start line");
    assert.equal(spawnPose?.edge?.selection?.role, "route", "player must spawn on a real selected circuit road");
    assert.equal(runtime.minimap.roads.length, runtime.network.edges.length, "minimap must be built from exactly the selected graph");
    assert.equal(runtime.minimap.raceCircuit.edgeIds.length,runtime.raceCircuit.steps.length,"minimap must expose the exact closed circuit edge sequence");
    assert.ok(runtime.minimap.raceCircuit.edgeIds.every(id=>runtime.network.edges.some(edge=>edge.id===id)),"every highlighted minimap circuit edge must exist in the playable OSM graph");
    assert.deepEqual(runtime.minimap.roads.map(r => r.id).sort(), runtime.network.edges.map(e => e.id).sort(), "minimap and playable graph must share edge identity");
    assert.ok(runtime.minimap.roads.every(r => r.role === "route"), "minimap must show only the selected closed circuit roads");
    assert.equal(runtime.roadGroup.userData.edgeCount,runtime.network.edges.length);
    assert.ok(runtime.network.edges.length < network.edges.length * 0.2, "runtime must not load the whole OSM extract");
    assert.equal(runtime.selection.connected, true);
    assert.equal(runtime.raceCircuit.closed,true,"each area must expose its verified closed-loop racing route");
    assert.equal(runtime.raceCircuit.startNodeId,runtime.raceCircuit.destinationNodeId,"race circuit must return to its exact start node");
    assert.ok(runtime.raceCircuit.distanceM>6000,"race circuit must be a meaningful multi-kilometre course");
    assert.ok(runtime.raceCircuit.steps.length>=60,"race circuit must traverse many real OSM road segments");
    assert.ok(runtime.raceCircuit.namedRoads.length>=6,"race circuit must use at least six distinct named OSM roads");
    assert.ok(runtime.sample(runtime.raceCircuit,0) && runtime.sample(runtime.raceCircuit,runtime.raceCircuit.distanceM-1),"closed circuit must be sampleable at its start and finish");
    assert.equal(runtime.createCircuitTrafficRoute(),runtime.raceCircuit,"AI can request the approved circuit route");
    assert.ok(runtime.network.edges.every(edge=>network.edges.some(candidate=>candidate.id===edge.id)), "featured roads and connectors must come from real OSM edges");
    assert.ok(runtime.network.edges.every(edge=>{
      const model=edge.roadModel;
      return model && model.totalLaneCount===edge.lanes.length &&
        model.forwardLaneCount===edge.lanes.filter(lane=>lane.direction==="forward").length &&
        model.reverseLaneCount===edge.lanes.filter(lane=>lane.direction==="reverse").length &&
        model.sharedLaneCount===edge.lanes.filter(lane=>lane.direction==="both").length &&
        edge.lanes.every(lane=>Number.isFinite(lane.widthM)&&lane.widthM>0);
    }),"lane arrays must agree with the RD-02 physical-road classification contract");
    assert.ok(runtime.network.edges.every(edge=>["tagged","mixed","inferred"].includes(edge.roadModel.laneLayoutConfidence)),"every edge must expose lane provenance");
    assert.ok(runtime.network.edges.filter(edge=>edge.roadModel.oneWay).every(edge=>
      edge.lanes.every(lane=>lane.direction===edge.roadModel.oneWayDirection)
    ),"one-way edges must not contain fabricated opposing traffic lanes");
    assert.equal(runtime.connectorEdgeCount,0,"the circuit graph should contain only the ordered OSM circuit edges");
    const namedEdge=runtime.network.edges.find(edge=>expectedFeatured.includes(edge.osm?.name));
    if(namedEdge){
      const midpoint=namedEdge.centerline[Math.floor(namedEdge.centerline.length/2)];
      const nearest=runtime.findNearestRoad(midpoint.x,midpoint.z,20);
      assert.ok(nearest && runtime.network.edges.some(edge=>edge.id===nearest.edge.id),"nearby street lookup must return a real OSM road");
      assert.ok(nearest.distanceM < 20,"nearby street lookup must stay close to the queried road point");
      assert.ok(Number.isFinite(nearest.forwardX)&&Number.isFinite(nearest.forwardZ));
    }
    assert.ok(runtime.roadGroup.userData.roadMeshCount<=12,"road classes must be batched to a small draw-call count");
    assert.ok(scene.children.includes(runtime.roadGroup));
    assert.ok(runtime.sample(runtime.playerRoute,Math.min(500,Math.max(0,runtime.playerRoute.distanceM-1))));
    assert.ok(runtime.createTrafficRoute(runtime.network.edges[0].fromNodeId).steps.length>=1);
    runtime.dispose();
    assert.equal(scene.children.length,0,"disposing an area must remove its road meshes");
  });
}


test("Lapaz runtime loads the open Lapaz–Madina highway corridor, not a closed circuit", async () => {
  const document=JSON.parse(await readFile(new URL("../data/osm/lapaz.network.json",import.meta.url),"utf8"));
  const route=JSON.parse(await readFile(new URL("../data/osm/lapaz-madina-route.json",import.meta.url),"utf8"));
  const scene={children:[],add(object){this.children.push(object);},remove(object){this.children=this.children.filter(item=>item!==object);}};
  const runtime=await loadRoadNetworkRuntime({
    THREE,scene,areaId:"lapaz",
    fetcher:async url=>({ok:true,json:async()=>url.split("?")[0].endsWith("lapaz-madina-route.json")?route:document})
  });
  assert.equal(runtime.raceCircuit.closed,false);
  assert.equal(runtime.raceCircuit.startNodeId,route.startNodeId);
  assert.equal(runtime.raceCircuit.destinationNodeId,route.endNodeId);
  assert.notEqual(runtime.raceCircuit.startNodeId,runtime.raceCircuit.destinationNodeId);
  assert.equal(runtime.raceCircuit.waypoints.length,11);
  assert.equal(runtime.returnHighwayRoute.startNodeId,route.endNodeId);
  assert.equal(runtime.returnHighwayRoute.destinationNodeId,route.startNodeId);
  assert.equal(runtime.returnHighwayRoute.closed,false);
  assert.ok(runtime.returnHighwayRoute.steps.length>=20);
  assert.deepEqual(runtime.featuredRoadNames,route.namedRoads);
  assert.equal(runtime.minimap.raceCircuit.closed,false);
  assert.deepEqual(runtime.minimap.raceCircuit.edgeIds,runtime.raceCircuit.steps.map(step=>step.edgeId));
  assert.deepEqual(runtime.minimap.raceCircuit.returnEdgeIds,runtime.returnHighwayRoute.steps.map(step=>step.edgeId));
  assert.ok(runtime.minimap.raceCircuit.edgeIds.every(id=>runtime.network.edges.some(edge=>edge.id===id)));
  assert.equal(runtime.playerRoute.startNodeId,route.startNodeId);
  assert.equal(runtime.sample(runtime.raceCircuit,0)?.edge?.selection?.role,"route");
  assert.equal(runtime.createCircuitTrafficRoute(),runtime.raceCircuit);
  assert.equal(runtime.createReturnHighwayTrafficRoute(),runtime.returnHighwayRoute);
  assert.ok(runtime.network.edges.every(edge=>document.network.edges.some(source=>source.id===edge.id)));
  assert.ok(runtime.network.edges.length<document.network.edges.length*0.2);
  runtime.dispose();
  assert.equal(scene.children.length,0);
});
