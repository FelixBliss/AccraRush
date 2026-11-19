import test from "node:test";
import assert from "node:assert/strict";
import { createRoadNetworkRenderer } from "../src/world/roads/road-network-renderer.js";

class Group {
  constructor(){this.children=[];this.name="";}
  add(object){this.children.push(object);}
  traverse(callback){callback(this);for(const child of this.children)callback(child);}
  clear(){this.children=[];}
}
class BufferGeometry {
  constructor(){this.attributes={};this.disposed=false;}
  setAttribute(name,value){this.attributes[name]=value;}
  setIndex(value){this.index=value;}
  computeVertexNormals(){}
  computeBoundingSphere(){}
  dispose(){this.disposed=true;}
}
class Float32BufferAttribute { constructor(array,itemSize){this.array=array;this.itemSize=itemSize;} }
class MeshStandardMaterial { constructor(options){this.options=options;this.disposed=false;} dispose(){this.disposed=true;} }
class Mesh {
  constructor(geometry,material){this.geometry=geometry;this.material=material;this.userData={};this.children=[];}
  traverse(callback){callback(this);for(const child of this.children)child.traverse?.(callback);}
}
const THREE={Group,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,Mesh};

function sampleNetwork(){
 const point=(x,z)=>({x,y:0,z});
 return {
  id:"renderer-fixture",areaId:"fixture",
  nodes:[{id:"j",position:point(0,0)},{id:"n",position:point(0,-10)},{id:"e",position:point(10,0)},{id:"s",position:point(0,10)}],
  edges:[
   {id:"north",fromNodeId:"j",toNodeId:"n",centerline:[point(0,0),point(0,-10)],roadClass:"residential",lanes:[]},
   {id:"east",fromNodeId:"j",toNodeId:"e",centerline:[point(0,0),point(10,0)],roadClass:"primary",lanes:[]},
   {id:"south",fromNodeId:"s",toNodeId:"j",centerline:[point(0,10),point(0,0)],roadClass:"secondary",lanes:[]}
  ],
  junctions:[{nodeId:"j",movementStatus:"review_required",movements:[]}]
 };
}

test("Three.js road renderer builds graph-keyed road meshes and junction patch",()=>{
 const source=sampleNetwork(),renderer=createRoadNetworkRenderer(THREE,source);
 assert.equal(renderer.group.name,"road-network:fixture");
 assert.equal(renderer.group.children.length,4);
 const road=renderer.group.children.find(mesh=>mesh.name==="road:east");
 assert.equal(road.userData.edgeId,"east");
 assert.equal(road.userData.renderWidthSource,"gameplay-render-default");
 assert.ok(road.geometry.attributes.position.array.every(Number.isFinite));
 assert.ok(renderer.group.children.some(mesh=>mesh.name==="junction:j"));
 assert.equal(source.edges.length,3,"renderer must not mutate canonical graph data");
 renderer.dispose();
 assert.equal(renderer.group.children.length,0);
 assert.ok(road.geometry.disposed);
});

test("Three.js road renderer does not dispose caller-owned asphalt material",()=>{
 const material=new MeshStandardMaterial({color:0x333333});
 const renderer=createRoadNetworkRenderer(THREE,sampleNetwork(),{asphaltMaterial:material});
 renderer.dispose();
 assert.equal(material.disposed,false);
});
