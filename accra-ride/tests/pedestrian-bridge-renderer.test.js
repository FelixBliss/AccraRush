import test from "node:test";
import assert from "node:assert/strict";
import { classifyFeature } from "../src/map/road-features.js";
import { createPedestrianBridgeMeshes } from "../src/map/pedestrian-bridge-renderer.js";

class Group { constructor(){this.children=[];this.userData={};} add(...items){this.children.push(...items);} }
class Geometry { setAttribute(k,v){this[k]=v;} setIndex(v){this.index=v;} computeVertexNormals(){this.normals=true;} }
class Attribute { constructor(array,itemSize){this.array=array;this.itemSize=itemSize;} }
class Material { constructor(options){this.options=options;} }
class Mesh { constructor(geometry,material){this.geometry=geometry;this.material=material;this.name="";} }
const THREE={Group,BufferGeometry:Geometry,Float32BufferAttribute:Attribute,MeshStandardMaterial:Material,Mesh};

test("only mapped pedestrian footways tagged as bridges are classified as footbridges",()=>{
  assert.equal(classifyFeature({highway:"footway",bridge:"yes"},"line"),"pedestrian_bridge");
  assert.equal(classifyFeature({highway:"path",bridge:"viaduct"},"line"),"pedestrian_bridge");
  assert.equal(classifyFeature({highway:"footway"},"line"),null);
  assert.equal(classifyFeature({highway:"residential",bridge:"yes"},"line"),null);
});

test("OSM footbridge becomes elevated deck, support columns, railings and stair treads",()=>{
  const network={edges:[{id:"road-1",lanes:[{widthM:3.5},{widthM:3.5}]}]};
  const features=[{kind:"pedestrian_bridge",edgeId:"road-1",heading:{x:1,z:0},line:[
    {x:0,y:0,z:-18},{x:0,y:0,z:0},{x:0,y:0,z:18}
  ]}];
  const group=createPedestrianBridgeMeshes(THREE,features,network);
  assert.equal(group.userData.built,1);
  assert.equal(group.userData.skipped,0);
  assert.deepEqual(group.children.map(item=>item.name),[
    "osm-footbridge-decks","osm-footbridge-steel-and-railings","osm-footbridge-staircases"
  ]);
  assert.ok(group.children.every(item=>item.geometry.index.length>0));
  const deckY=group.children[0].position?.y??5.6;
  assert.ok(deckY>=5.0);
  assert.equal(group.userData.collisionRequired,true);
});

test("bridge with no matching selected road edge is skipped rather than misplaced",()=>{
  const group=createPedestrianBridgeMeshes(THREE,[{
    kind:"pedestrian_bridge",edgeId:"missing",heading:{x:1,z:0},line:[{x:0,z:0},{x:0,z:5}]
  }],{edges:[]});
  assert.equal(group.userData.built,0);
  assert.equal(group.userData.skipped,1);
  assert.equal(group.children.length,0);
});

test("mapped pedestrian paths running parallel to the carriageway are not rendered as bridges",()=>{
  const group=createPedestrianBridgeMeshes(THREE,[{
    kind:"pedestrian_bridge",edgeId:"road-1",heading:{x:1,z:0},
    line:[{x:-12,z:0},{x:12,z:0}]
  }],{edges:[{id:"road-1",lanes:[{widthM:3.5},{widthM:3.5}]}]});
  assert.equal(group.userData.built,0);
  assert.equal(group.userData.skipped,1);
});
