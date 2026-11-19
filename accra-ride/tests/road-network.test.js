import test from "node:test";
import assert from "node:assert/strict";
import { lonLatToUtm30, polylineLengthM, samplePolylineAtDistance, localToWorld, validateRoadTopology, validateDirectedRoute } from "../src/core/road-network.js";
const graph=()=>({id:"road-test",version:1,nodes:[{id:"a",position:{x:0,y:0,z:0}},{id:"b",position:{x:0,y:0,z:100}},{id:"c",position:{x:100,y:0,z:100}}],edges:[{id:"ab",fromNodeId:"a",toNodeId:"b",lengthM:100,centerline:[{x:0,y:0,z:0},{x:0,y:0,z:100}],lanes:[{id:"ab-f",direction:"forward",widthM:3.5,status:"allowed"}]},{id:"bc",fromNodeId:"b",toNodeId:"c",lengthM:100,centerline:[{x:0,y:0,z:100},{x:100,y:0,z:100}],lanes:[{id:"bc-f",direction:"forward",widthM:3.5}]}],junctions:[{nodeId:"b",movements:[{fromEdgeId:"ab",fromDirection:"forward",toEdgeId:"bc",toDirection:"forward",status:"allowed"}]}]});
const route=()=>({id:"r1",networkId:"road-test",startNodeId:"a",destinationNodeId:"c",steps:[{edgeId:"ab",laneId:"ab-f",direction:"forward"},{edgeId:"bc",laneId:"bc-f",direction:"forward"}]});
test("UTM 30N projects Accra into plausible metric coordinates",()=>{const p=lonLatToUtm30(-.187,5.603);assert.ok(p.eastingM>300000&&p.eastingM<900000);assert.ok(p.northingM>0&&p.northingM<1000000)});
test("local transform preserves metric scale and maps north to negative Z",()=>{assert.deepEqual(localToWorld({x:500100,y:12,z:620010},{eastingM:500000,northingM:620000,elevationM:10}),{x:100,y:2,z:-10})});
test("polyline length and distance sampling use metres",()=>{const p=[{x:0,y:0,z:0},{x:0,y:0,z:3},{x:4,y:0,z:3}];assert.equal(polylineLengthM(p),7);assert.deepEqual(samplePolylineAtDistance(p,5),{x:2,y:0,z:3})});
test("graph requires explicit legal movements at shared junction nodes",()=>{assert.deepEqual(validateRoadTopology(graph()),[]);const g=graph();g.junctions=[];assert.ok(validateRoadTopology(g).some(e=>e.includes("needs an explicit junction")))});
test("route only accepts movements explicitly listed at a junction",()=>{assert.deepEqual(validateDirectedRoute(route(),graph()),[]);const g=graph();g.junctions[0].movements=[];assert.ok(validateDirectedRoute(route(),g).some(e=>e.includes("unlisted or illegal junction movement")))});
test("route rejects disconnected edge chains",()=>{const r=route();r.steps[1].edgeId="ab";assert.ok(validateDirectedRoute(r,graph()).some(e=>e.includes("disconnected")))});
test("graph rejects centreline and declared length disagreement",()=>{const g=graph();g.edges[0].lengthM=180;assert.ok(validateRoadTopology(g).some(e=>e.includes("differs materially")))});

test("route rejects a topologically possible but unverified turn",()=>{const g=graph();g.junctions[0].movements[0].status="unknown";assert.ok(validateDirectedRoute(route(),g).some(e=>e.includes("unlisted or illegal junction movement")))});
test("unknown physical lane width is preserved without inventing a measurement",()=>{const g=graph();g.edges[0].lanes[0].widthM=null;assert.deepEqual(validateRoadTopology(g),[])});
