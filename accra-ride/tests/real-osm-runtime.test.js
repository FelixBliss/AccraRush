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

for (const areaId of ["accra-central", "lapaz"]) {
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
    const runtime=await loadRoadNetworkRuntime({
      THREE,scene,areaId,trafficRouteSteps:60,playerRouteSteps:100,
      fetcher:async()=>({ok:true,json:async()=>document})
    });
    const mainEdges=network.edges.filter(edge=>["motorway","trunk","primary","secondary"].includes(edge.osm?.highway));
    const expectedFeatured = areaId === "lapaz"
      ? ["Nsawam Road", "George Walker Bush Highway", "Kwashieman-Ofankor Road", "Achimota Forest Road", "J.A. Kuffour Avenue"]
      : ["Independence Avenue", "Ring Road Central", "Ring Road East", "Ring Road West Road", "Kwame Nkrumah Avenue"];
    assert.deepEqual(runtime.featuredRoadNames, expectedFeatured, "the five featured roads must be declared for each playable area");
    for (const name of expectedFeatured) {
      assert.ok(runtime.network.edges.some(edge => edge.osm?.name === name), "featured road must exist in the playable graph: " + name);
    }
    assert.equal(runtime.minimap.edges.length, runtime.network.edges.length, "minimap must include the same loaded road graph");
    assert.ok(runtime.minimap.edges.some(edge => edge.featured), "minimap must highlight the five featured roads");
    assert.equal(runtime.roadGroup.userData.edgeCount,runtime.network.edges.length);
    assert.ok(runtime.network.edges.length < mainEdges.length, "runtime must retain only the five featured corridors and real connectors");
    assert.ok(runtime.network.edges.every(edge=>network.edges.some(candidate=>candidate.id===edge.id)), "featured roads and connectors must come from real OSM edges");
    const mainClasses=["motorway","trunk","primary","secondary"],linkClasses=["motorway_link","trunk_link","primary_link","secondary_link"];
    assert.ok(runtime.network.edges.every(edge=>mainClasses.includes(edge.osm?.highway)||linkClasses.includes(edge.osm?.highway)),"only featured main roads and real highway connectors may be loaded");
    assert.ok(runtime.network.edges.filter(edge=>mainClasses.includes(edge.osm?.highway)).every(edge=>edge.lanes.length===4),"featured bidirectional main roads must have four lanes");
    assert.ok(runtime.network.edges.filter(edge=>linkClasses.includes(edge.osm?.highway)).every(edge=>edge.lanes.length===2),"short connector ramps retain their two directional lanes");
    assert.ok(runtime.connectorEdgeCount>0,"real connectors must join the featured corridors");
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
    assert.ok(runtime.sample(runtime.playerRoute,500));
    assert.ok(runtime.createTrafficRoute(runtime.playerRoute.segments[10].fromNodeId).steps.length>=30);
    runtime.dispose();
    assert.equal(scene.children.length,0,"disposing an area must remove its road meshes");
  });
}
