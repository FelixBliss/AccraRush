import test from "node:test";
import assert from "node:assert/strict";
import { createRoadMeshes } from "../src/map/three-road-renderer.js";

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

test("OSM renderer batches thousands of edges into one mesh per road class",()=>{
  const THREE={Group,BufferGeometry,Float32BufferAttribute,Mesh,LineSegments,
    MeshStandardMaterial:Material,LineBasicMaterial:Material};
  const point=(x,z)=>({x,y:0,z});
  const network={id:"test",edges:[
    {id:"a",fromNodeId:"n0",toNodeId:"n1",osm:{highway:"primary"},lanes:[{direction:"forward",widthM:3.5},{direction:"reverse",widthM:3.5}],centerline:[point(0,0),point(0,-10)]},
    {id:"b",fromNodeId:"n1",toNodeId:"n2",osm:{highway:"primary"},lanes:[{direction:"forward",widthM:3.5},{direction:"reverse",widthM:3.5}],centerline:[point(0,-10),point(10,-10)]},
    {id:"c",fromNodeId:"n2",toNodeId:"n3",osm:{highway:"residential"},lanes:[{direction:"forward",widthM:7}],centerline:[point(10,-10),point(20,-10)]}
  ]};
  const group=createRoadMeshes(THREE,network);
  assert.equal(group.userData.edgeCount,3);
  assert.equal(group.userData.roadMeshCount,3,"two road-class meshes plus a corner patch where the 90-degree bend leaves a wedge gap");
  assert.equal(group.userData.batched,true);
  assert.equal(group.children.filter(c=>c.name.startsWith("osm-roads:")).length,2);
  assert.ok(group.children.some(c=>c.name==="osm-road-markings"),"markings mesh");
  assert.ok(group.children.every(child=>child.geometry.attributes.position.array.length>0));
});

test("OSM bridge-tagged edges receive a batched deck and parapet structure",()=>{
  const THREE={Group,BufferGeometry,Float32BufferAttribute,Mesh,LineSegments,
    MeshStandardMaterial:Material,LineBasicMaterial:Material};
  const point=(x,z)=>({x,y:0,z});
  const network={id:"bridge-test",edges:[
    {id:"bridge-edge",fromNodeId:"n0",toNodeId:"n1",osm:{highway:"primary",bridge:"yes",layer:"1"},
      lanes:[{direction:"forward",widthM:3.5},{direction:"reverse",widthM:3.5}],
      centerline:[point(0,0),point(0,-30)]}
  ]};
  const group=createRoadMeshes(THREE,network);
  assert.equal(group.userData.bridgeEdges,1);
  assert.equal(group.userData.bridgeLengthM,30);
  const bridge=group.children.find(child=>child.name==="osm-bridge-structures");
  assert.ok(bridge,"bridge-tagged road must have a visible structure mesh");
  assert.ok(bridge.geometry.attributes.position.array.length>0);
  assert.equal(bridge.geometry.attributes.uv.array.length/2,bridge.geometry.attributes.position.array.length/3);
  assert.ok(bridge.geometry.index.length>0);
  const p=bridge.geometry.attributes.position.array, ids=bridge.geometry.index;
  const a=ids[0]*3,b=ids[1]*3,d=ids[2]*3;
  const ux=p[b]-p[a],uz=p[b+2]-p[a+2],vx=p[d]-p[a],vz=p[d+2]-p[a+2];
  assert.ok(uz*vx-ux*vz>0,"bridge deck top face must point upward");
});

test("road surface triangles face upward so top-side camera can see asphalt",()=>{
  const THREE={Group,BufferGeometry,Float32BufferAttribute,Mesh,LineSegments,
    MeshStandardMaterial:Material,LineBasicMaterial:Material};
  const point=(x,z)=>({x,y:0,z});
  const network={id:"winding",edges:[
    {id:"northbound",fromNodeId:"n0",toNodeId:"n1",osm:{highway:"primary"},lanes:[{direction:"forward",widthM:3.5},{direction:"reverse",widthM:3.5}],centerline:[point(0,0),point(0,-10)]}
  ]};
  const group=createRoadMeshes(THREE,network);
  const positions=group.children[0].geometry.attributes.position.array;
  const indices=group.children[0].geometry.index;
  const a=indices[0]*3,b=indices[1]*3,c=indices[2]*3;
  const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2];
  const vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];
  const normalY=uz*vx-ux*vz;
  assert.ok(normalY>0,"road surface winding must produce an upward-facing normal");
});

import { readFile } from "node:fs/promises";
import { selectRoadGraph, selectHighwayRouteGraph } from "../src/map/selected-road-graph.js";

for (const areaId of ["accra-central", "lapaz"]) {
  test(`selected ${areaId} graph renders with fold-free, upward, non-degenerate, UV-mapped surfaces`, async () => {
    const THREE={Group,BufferGeometry,Float32BufferAttribute,Mesh,LineSegments,MeshStandardMaterial:Material,LineBasicMaterial:Material};
    const doc = JSON.parse(await readFile(new URL(`../data/osm/${areaId}.network.json`, import.meta.url), "utf8"));
    const { network } = areaId === "lapaz"
      ? selectHighwayRouteGraph(doc.network, JSON.parse(await readFile(new URL("../data/osm/lapaz-madina-route.json", import.meta.url), "utf8")))
      : selectRoadGraph(doc.network, areaId);
    const group = createRoadMeshes(THREE, network);
    assert.equal(group.userData.skippedEdges, 0, "every selected edge must render");
    assert.equal(group.userData.edgeCount, network.edges.length);
    assert.ok(group.userData.junctionCount > 0 && group.userData.stopLines > 0 && group.userData.arrows > 0 && group.userData.markingSegments > 0);
    const sourceBridgeEdges=network.edges.filter(edge=>edge.osm?.bridge&&edge.osm.bridge!=="no");
    assert.equal(group.userData.bridgeEdges,sourceBridgeEdges.length,areaId+" bridge tags must reach the renderer");
    if(sourceBridgeEdges.length){
      assert.ok(group.userData.bridgeLengthM>0,areaId+" bridge geometry must have measurable length");
      assert.ok(group.children.some(mesh=>mesh.name==="osm-bridge-structures"),areaId+" bridge structures must be rendered");
    }
    for (const mesh of group.children) {
      const pos = mesh.geometry.attributes.position.array, idx = mesh.geometry.index;
      assert.equal(mesh.geometry.attributes.uv.array.length / 2, pos.length / 3, mesh.name + " uv count");
      // Bridge structures intentionally contain vertical faces; road and junction
      // surfaces must remain upward-facing, while every bridge triangle must be valid.
      let bad = 0;
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i]*3, b = idx[i+1]*3, c = idx[i+2]*3;
        const ux=pos[b]-pos[a], uz=pos[b+2]-pos[a+2], vx=pos[c]-pos[a], vz=pos[c+2]-pos[a+2];
        const ny = uz*vx - ux*vz;
        if (mesh.name === "osm-bridge-structures" || mesh.name === "osm-road-medians") {
          assert.ok([pos[a],pos[a+1],pos[a+2],pos[b],pos[b+1],pos[b+2],pos[c],pos[c+1],pos[c+2]].every(Number.isFinite));
          const uy=pos[b+1]-pos[a+1], vy=pos[c+1]-pos[a+1];
          const ux3=pos[b]-pos[a], uz3=pos[b+2]-pos[a+2], vx3=pos[c]-pos[a], vz3=pos[c+2]-pos[a+2];
          const cx=uy*vz3-uz3*vy, cy=uz3*vx3-ux3*vz3, cz=ux3*vy-uy*vx3;
          assert.ok(Math.hypot(cx,cy,cz)>1e-6,mesh.name+" triangles must have non-zero 3D area");
        } else if (!(ny > 1e-9)) bad++;
      }
      // Junction fans are star-shaped around the node; a few straddling slivers are tolerated only there.
      const limit = mesh.name === "osm-road-junctions" ? Math.ceil(idx.length / 3 * 0.02) : 0;
      assert.ok(bad <= limit, `${mesh.name}: ${bad} non-upward/degenerate triangles`);
    }
  });
}

test("verified opposing OSM carriageways receive a 3D central median",()=>{
  const THREE={Group,BufferGeometry,Float32BufferAttribute,Mesh,LineSegments,
    MeshStandardMaterial:Material,LineBasicMaterial:Material};
  const point=(x,z)=>({x,y:0,z});
  const shared={physicalRoadId:"physical-n1",groupingSource:"osm:paired-oneway-carriageways",
    pairedWayIds:["way-east","way-west"],oneWay:true};
  const network={id:"median-test",edges:[
    {id:"eastbound",fromNodeId:"a0",toNodeId:"a1",osm:{highway:"trunk",name:"N1",oneway:"yes"},
      roadModel:{...shared,carriagewayId:"carriage-east",sourceWayId:"way-east",oneWayDirection:"forward"},
      lanes:[{id:"e1",direction:"forward",widthM:3.5},{id:"e2",direction:"forward",widthM:3.5}],
      centerline:[point(0,0),point(0,-30)]},
    {id:"westbound",fromNodeId:"b0",toNodeId:"b1",osm:{highway:"trunk",name:"N1",oneway:"yes"},
      roadModel:{...shared,carriagewayId:"carriage-west",sourceWayId:"way-west",oneWayDirection:"forward"},
      lanes:[{id:"w1",direction:"reverse",widthM:3.5},{id:"w2",direction:"reverse",widthM:3.5}],
      centerline:[point(12,-30),point(12,0)]}
  ]};
  const group=createRoadMeshes(THREE,network);
  assert.equal(group.userData.medianCount,1);
  const median=group.children.find(child=>child.name==="osm-road-medians");
  assert.ok(median,"paired carriageway gap must be rendered with a raised curb");
  assert.equal(median.userData.source,"paired-opposing-osm-carriageways");
  assert.equal(median.userData.medianHeightM,0.28);
  assert.ok(median.geometry.attributes.position.array.length>0);
  const positions=median.geometry.attributes.position.array;
  const heights=[];for(let i=1;i<positions.length;i+=3)heights.push(positions[i]);
  assert.ok(Math.max(...heights)-Math.min(...heights)>=0.27,"median must rise visibly above the asphalt surface");
  assert.ok(median.geometry.index.length>0);
  const grassTop=group.children.find(child=>child.name==="osm-road-median-grass");
  assert.ok(grassTop && grassTop.geometry.index.length>0,"wide measured medians should receive a landscaped grass top");
});

test("unpaired or ambiguous road edges never receive an invented central median",()=>{
  const THREE={Group,BufferGeometry,Float32BufferAttribute,Mesh,LineSegments,
    MeshStandardMaterial:Material,LineBasicMaterial:Material};
  const point=(x,z)=>({x,y:0,z});
  const network={id:"no-median-test",edges:[
    {id:"single",fromNodeId:"a",toNodeId:"b",osm:{highway:"trunk"},lanes:[{direction:"forward",widthM:3.5}],centerline:[point(0,0),point(0,-30)]}
  ]};
  const group=createRoadMeshes(THREE,network);
  assert.equal(group.userData.medianCount,0);
  assert.ok(!group.children.some(child=>child.name==="osm-road-medians"||child.name==="osm-road-median-grass"));
});
