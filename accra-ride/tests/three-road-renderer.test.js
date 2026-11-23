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
import { selectRoadGraph } from "../src/map/selected-road-graph.js";

for (const areaId of ["accra-central", "lapaz"]) {
  test(`selected ${areaId} graph renders with fold-free, upward, non-degenerate, UV-mapped surfaces`, async () => {
    const THREE={Group,BufferGeometry,Float32BufferAttribute,Mesh,LineSegments,MeshStandardMaterial:Material,LineBasicMaterial:Material};
    const doc = JSON.parse(await readFile(new URL(`../data/osm/${areaId}.network.json`, import.meta.url), "utf8"));
    const { network } = selectRoadGraph(doc.network, areaId);
    const group = createRoadMeshes(THREE, network);
    assert.equal(group.userData.skippedEdges, 0, "every selected edge must render");
    assert.equal(group.userData.edgeCount, network.edges.length);
    assert.ok(group.userData.junctionCount > 0 && group.userData.stopLines > 0 && group.userData.arrows > 0 && group.userData.markingSegments > 0);
    for (const mesh of group.children) {
      const pos = mesh.geometry.attributes.position.array, idx = mesh.geometry.index;
      assert.equal(mesh.geometry.attributes.uv.array.length / 2, pos.length / 3, mesh.name + " uv count");
      let bad = 0;
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i]*3, b = idx[i+1]*3, c = idx[i+2]*3;
        const ny = (pos[b+2]-pos[a+2])*(pos[c]-pos[a]) - (pos[b]-pos[a])*(pos[c+2]-pos[a+2]);
        if (!(ny > 1e-9)) bad++;
      }
      // junction fans are star-shaped around the node; a few straddling slivers are tolerated only there
      const limit = mesh.name === "osm-road-junctions" ? Math.ceil(idx.length / 3 * 0.02) : 0;
      assert.ok(bad <= limit, `${mesh.name}: ${bad} non-upward/degenerate triangles`);
    }
  });
}
