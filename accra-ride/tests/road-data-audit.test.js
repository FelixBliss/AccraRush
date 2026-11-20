import test from "node:test";
import assert from "node:assert/strict";
import { auditRoadNetwork } from "../scripts/audit-road-data.js";

const document = {
  areaId: "fixture",
  elementCount: 2,
  bounds: { south: 5.5, west: -0.2, north: 5.6, east: -0.1 },
  network: {
    id: "fixture-network",
    source: { provider: "OpenStreetMap via Geofabrik" },
    projection: { type: "local-equirectangular" },
    nodes: [{id:"a"},{id:"b"},{id:"c"}],
    edges: [
      {id:"edge-1",fromNodeId:"a",toNodeId:"b",lanes:[
        {id:"f",direction:"forward",widthM:7},{id:"r",direction:"reverse",widthM:7}
      ],centerline:[{x:0,y:0,z:0},{x:0,y:0,z:10}],osm:{wayId:"10",highway:"primary",oneway:null,surface:"asphalt"}},
      {id:"edge-2",fromNodeId:"b",toNodeId:"c",lanes:[
        {id:"f2",direction:"forward",widthM:3.5}
      ],centerline:[{x:0,y:0,z:10},{x:0,y:0,z:20}],osm:{wayId:"11",highway:"residential",oneway:"yes"}}
    ]
  }
};

test("RD-01 audit reports physical lane-record shape without pretending each record is one lane", () => {
  const result = auditRoadNetwork(document);
  assert.equal(result.counts.edges, 2);
  assert.deepEqual(result.laneModel.laneRecordsPerEdge, {"1":1,"2":1});
  assert.equal(result.laneModel.directionalRecordPatterns["forward+reverse"], 1);
  assert.equal(result.physicalRoadModel.explicitIndividualLaneCenterlines, false);
});

test("RD-01 audit detects flat y=0 geometry and missing retained source tags", () => {
  const result = auditRoadNetwork(document);
  assert.deepEqual(result.geometry.worldY, {min:0,max:0,distinctValues:1});
  assert.ok(result.retainedOsmMetadata.knownNotPreservedByCurrentImporter.includes("lanes:forward"));
});

test("RD-01 audit flags duplicate centreline geometry independent of direction", () => {
  const copy = structuredClone(document);
  copy.network.edges.push({
    ...copy.network.edges[0], id:"edge-duplicate",
    centerline:[...copy.network.edges[0].centerline].reverse()
  });
  const result = auditRoadNetwork(copy);
  assert.equal(result.counts.exactDuplicateCenterlineEdges, 1);
});
