import test from "node:test";
import assert from "node:assert/strict";
import { buildRoadRibbon, buildJunctionPatch, appendRibbonTriangles, appendJunctionTriangles } from "../src/map/road-geometry.js";

const p=(x,z)=>({x,y:0,z});

test("road ribbon keeps exact endpoints and produces finite bounded joins on a curve",()=>{
  const points=[p(0,0),p(0,-10),p(10,-10),p(20,-5)];
  const ribbon=buildRoadRibbon(points,8);
  assert.equal(ribbon.points.length,4);
  assert.deepEqual(ribbon.points[0],points[0]);
  assert.deepEqual(ribbon.points.at(-1),points.at(-1));
  for(const side of [ribbon.left,ribbon.right]) for(const v of side) assert.ok([v.x,v.y,v.z].every(Number.isFinite));
  for(let i=0;i<points.length;i++) {
    const width=Math.hypot(ribbon.left[i].x-ribbon.right[i].x,ribbon.left[i].z-ribbon.right[i].z);
    assert.ok(width<=20.01,"miter length must remain bounded at acute bends");
  }
});

test("duplicate centreline vertices are removed without creating degenerate spans",()=>{
  const ribbon=buildRoadRibbon([p(0,0),p(0,0),p(0,-10)],6);
  assert.equal(ribbon.points.length,2);
  assert.equal(ribbon.bevels.length,0);
});

test("junction patch closes the wedge between three incident road ribbons",()=>{
  const node=p(0,0);
  const a=buildRoadRibbon([p(-20,0),node],8);
  const b=buildRoadRibbon([node,p(20,0)],8);
  const c=buildRoadRibbon([node,p(0,-20)],8);
  const patch=buildJunctionPatch(node,[{ribbon:a,atStart:false},{ribbon:b,atStart:true},{ribbon:c,atStart:true}]);
  assert.ok(patch);
  assert.ok(patch.boundary.length>=4);
  const target={vertices:[],indices:[]};
  appendRibbonTriangles(target,a);
  const before=target.vertices.length;
  appendJunctionTriangles(target,patch);
  assert.ok(target.vertices.length>before);
  assert.equal(target.indices.length,patch.boundary.length*3);
});

test("junction patch is omitted for a single isolated road endpoint",()=>{
  const ribbon=buildRoadRibbon([p(0,0),p(0,-10)],6);
  assert.equal(buildJunctionPatch(p(0,0),[{ribbon,atStart:true}]),null);
});

test("acute bends emit explicit bevel cross-sections instead of a clamped miter point",()=>{
  const ribbon=buildRoadRibbon([p(0,0),p(0,-10),p(1,-10.2)],8,{miterLimit:1.5});
  assert.ok(ribbon.bevels.length>0,"acute bend should be represented as a bevel");
  const target={vertices:[],indices:[]};
  appendRibbonTriangles(target,ribbon);
  assert.equal(target.vertices.length/3,(ribbon.points.length+ribbon.bevels.length)*4);
  assert.ok(target.indices.length>0);
  assert.ok(target.indices.every(index=>index<target.vertices.length/3));
});
