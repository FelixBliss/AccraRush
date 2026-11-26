import test from "node:test";
import assert from "node:assert/strict";
import { buildRoadRibbonData, buildJunctionPatchData, resolveRoadRenderWidth } from "../src/world/roads/road-geometry.js";

test("straight road ribbon uses metre width and emits indexed triangles",()=>{
 const data=buildRoadRibbonData([{x:0,y:0,z:0},{x:0,y:0,z:10}],6);
 assert.equal(data.vertexCount,4);
 assert.equal(data.indices.length,6);
 assert.equal(data.positions[0],-3);
 assert.equal(data.positions[3],3);
 assert.ok(data.positions.every(Number.isFinite));
});
test("curved road ribbon remains finite through a bend",()=>{
 const data=buildRoadRibbonData([{x:0,y:0,z:0},{x:0,y:0,z:10},{x:8,y:0,z:18},{x:18,y:0,z:18}],7);
 assert.ok(data.positions.every(Number.isFinite));
 assert.equal(data.indices.length,18);
});
test("render width fallbacks are marked as gameplay assumptions",()=>{
 assert.deepEqual(resolveRoadRenderWidth({roadClass:"residential",lanes:[{widthM:null}]}),{widthM:6,source:"gameplay-render-default"});
 assert.deepEqual(resolveRoadRenderWidth({roadClass:"primary",renderWidthM:11}),{widthM:11,source:"area-render-width"});
});
test("junction patch is generated only from connected incident road edges",()=>{
 const p=(x,z)=>({x,y:0,z});
 const network={nodes:[{id:"j",position:p(0,0)}],edges:[
  {id:"north",fromNodeId:"j",toNodeId:"n",centerline:[p(0,0),p(0,-20)],roadClass:"residential"},
  {id:"east",fromNodeId:"j",toNodeId:"e",centerline:[p(0,0),p(20,0)],roadClass:"residential"},
  {id:"southwest",fromNodeId:"s",toNodeId:"j",centerline:[p(-15,15),p(0,0)],roadClass:"residential"}
 ]};
 const patch=buildJunctionPatchData(network,{nodeId:"j"});
 assert.ok(patch);
 assert.equal(patch.vertexCount,7);
 assert.equal(patch.indices.length,18);
 assert.ok(patch.positions.every(Number.isFinite));
});
test("junction patch is omitted for a node without enough approaches",()=>{
 const network={nodes:[{id:"j",position:{x:0,y:0,z:0}}],edges:[{id:"e",fromNodeId:"j",toNodeId:"n",centerline:[{x:0,y:0,z:0},{x:0,y:0,z:10}],roadClass:"residential"}]};
 assert.equal(buildJunctionPatchData(network,{nodeId:"j"}),null);
});
