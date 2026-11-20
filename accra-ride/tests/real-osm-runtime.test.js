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
    assert.equal(runtime.roadGroup.userData.edgeCount,runtime.network.edges.length);\n    assert.ok(runtime.network.edges.length < mainEdges.length, "runtime must retain only the five featured corridors and real connectors");\n    assert.ok(runtime.network.edges.every(edge=>mainEdges.some(candidate=>candidate.id===edge.id)), "connectors must come from real main-road OSM edges");
    assert.ok(runtime.network.edges.every(edge=>["motorway","trunk","primary","secondary"].includes(edge.osm?.highway)),"phase one must render only main roads");
    assert.ok(runtime.network.edges.every(edge=>edge.lanes.length===4),"bidirectional main roads must have four lanes");
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
