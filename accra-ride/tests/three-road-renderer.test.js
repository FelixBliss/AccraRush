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
    {id:"a",osm:{highway:"primary"},lanes:[{direction:"forward",widthM:3.5},{direction:"reverse",widthM:3.5}],centerline:[point(0,0),point(0,-10)]},
    {id:"b",osm:{highway:"primary"},lanes:[{direction:"forward",widthM:3.5},{direction:"reverse",widthM:3.5}],centerline:[point(0,-10),point(10,-10)]},
    {id:"c",osm:{highway:"residential"},lanes:[{direction:"forward",widthM:7}],centerline:[point(10,-10),point(20,-10)]}
  ]};
  const group=createRoadMeshes(THREE,network);
  assert.equal(group.userData.edgeCount,3);
  assert.equal(group.userData.roadMeshCount,2);
  assert.equal(group.userData.batched,true);
  assert.equal(group.children.length,3,"two road-class meshes plus one shared centre-marking mesh");
  assert.ok(group.children.every(child=>child.geometry.attributes.position.array.length>0));
});
