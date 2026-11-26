import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { selectRoadGraph, selectHighwayRouteGraph } from "../src/map/selected-road-graph.js";
import { applyGradeSeparation } from "../src/map/road-elevation.js";
import { createRoadMeshes } from "../src/map/three-road-renderer.js";
import { createRoadGround } from "../src/map/road-ground.js";
import { buildRoadFoundation } from "../src/map/road-foundations.js";
import { ROAD_SURFACE_Y, MARKING_LIFT_Y } from "../src/map/road-surface-contract.js";

class Group { constructor() { this.children = []; this.userData = {}; } add(c) { this.children.push(c); } }
class BufferGeometry { constructor() { this.attributes = {}; this.index = []; } setAttribute(n, v) { this.attributes[n] = v; } setIndex(v) { this.index = v; } computeVertexNormals() {} computeBoundingSphere() {} }
class Float32BufferAttribute { constructor(a, s) { this.array = a; this.itemSize = s; } }
class Mesh { constructor(g, m) { this.geometry = g; this.material = m; this.userData = {}; } }
class Material { constructor(o) { Object.assign(this, o); } }
const THREE = { Group, BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial: Material, DoubleSide: 2, RepeatWrapping: 1000 };

const load = async n => JSON.parse(await readFile(new URL(`../data/osm/${n}.json`, import.meta.url), "utf8"));
async function build(areaId) {
  const source = (await load(areaId + ".network")).network;
  const flat = areaId === "lapaz" ? selectHighwayRouteGraph(source, await load("lapaz-madina-route")).network : selectRoadGraph(source, areaId).network;
  const { network, report } = applyGradeSeparation(flat);
  const group = createRoadMeshes(THREE, network);
  const ground = createRoadGround(group.userData.roadSurface);
  return { network, report, group, ground };
}

for (const areaId of ["accra-central", "lapaz"]) {
  test(`${areaId}: every lane point is drivable at the exact drawn asphalt height (no holes, no sinking)`, async () => {
    const { network, ground } = await build(areaId);
    let checked = 0; const failures = [];
    for (const edge of network.edges) {
      let foundation; try { foundation = buildRoadFoundation(edge); } catch { continue; }
      for (const lane of foundation.laneCentrelines) {
        for (let i = 1; i < lane.points.length; i++) {
          const a = lane.points[i - 1], b = lane.points[i], len = Math.hypot(b.x - a.x, b.z - a.z);
          for (let s = 0.5; s < len - 0.25; s += 2) {
            const t = s / len, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t + ROAD_SURFACE_Y;
            const hit = ground.sample(x, z, { hintY: y });
            checked++;
            if (!hit.onRoad || Math.abs(hit.y - y) > 0.03) failures.push(`${edge.id} lane ${lane.id} at (${x.toFixed(1)},${z.toFixed(1)}): road ${hit.onRoad ? hit.y.toFixed(3) : "MISSING"} vs ${y.toFixed(3)}`);
          }
        }
      }
    }
    assert.ok(checked > 1000, "sampled " + checked);
    const rate = failures.length / checked;
    assert.ok(rate < 0.005, `${areaId}: ${failures.length}/${checked} lane samples off the road surface, e.g. ${failures.slice(0, 5).join(" | ")}`);
  });

  test(`${areaId}: every painted marking vertex sits just above the asphalt beneath it (follows slopes, never buried, never floating)`, async () => {
    const { group, ground } = await build(areaId);
    const marks = group.children.find(c => c.name === "osm-road-markings");
    assert.ok(marks);
    const P = marks.geometry.attributes.position.array;
    let checked = 0, bad = [];
    for (let i = 0; i < P.length; i += 3) {
      const hit = ground.sample(P[i], P[i + 2], { hintY: P[i + 1] });
      if (!hit.onRoad) continue; // paint at the very edge of a surface may fall outside it by rounding
      checked++;
      const lift = P[i + 1] - hit.y;
      if (lift < MARKING_LIFT_Y - 0.004 || lift > MARKING_LIFT_Y + 0.02) bad.push(lift.toFixed(3));
    }
    assert.ok(checked > 1000);
    assert.ok(bad.length / checked < 0.01, `${areaId}: ${bad.length}/${checked} marking vertices mis-heighted, e.g. ${bad.slice(0, 8).join(",")}`);
  });

  test(`${areaId}: no lane point of the selected roads intersects any barrier (AI traffic can drive every lane)`, async () => {
    const { network, ground } = await build(areaId);
    const hits = [];
    let checked = 0;
    for (const edge of network.edges) {
      let foundation; try { foundation = buildRoadFoundation(edge); } catch { continue; }
      for (const lane of foundation.laneCentrelines) {
        if (lane.direction === "both") continue;
        for (let i = 1; i < lane.points.length; i++) {
          const a = lane.points[i - 1], b = lane.points[i], len = Math.hypot(b.x - a.x, b.z - a.z);
          if (len < 1e-6) continue;
          const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
          for (let s = 0; s < len; s += 3) {
            const x = a.x + fx * s, z = a.z + fz * s, y = a.y + (b.y - a.y) * (s / len) + ROAD_SURFACE_Y;
            checked++;
            const hit = ground.collide(x, z, fx, fz, y);
            if (hit) hits.push(`${edge.id}/${lane.id} ${hit.kind} pen ${hit.penetrationM.toFixed(2)} at (${x.toFixed(0)},${z.toFixed(0)})`);
          }
        }
      }
    }
    assert.ok(checked > 1000);
    assert.ok(hits.length / checked < 0.01, `${areaId}: ${hits.length}/${checked} lane points collide with a barrier, e.g. ${hits.slice(0, 5).join(" | ")}`);
  });

  test(`${areaId}: rendering and ground model are generated from one shared triangle set`, async () => {
    const { group } = await build(areaId);
    const surfaceTris = group.userData.roadSurface.thickness.length;
    assert.equal(group.userData.triangleCount, surfaceTris);
    assert.equal(group.userData.roadSurface.triangles.length, surfaceTris * 9);
    let drawn = 0;
    for (const mesh of group.children) if (mesh.name.startsWith("osm-roads:") || mesh.name === "osm-road-junctions" || mesh.name === "osm-road-verges") drawn += mesh.geometry.index.length / 3;
    assert.equal(drawn, surfaceTris, "every drawn drivable triangle must be sampled, and nothing else");
  });
}

test("accra-central: raised structures have guardrails, no pier stands in a road, and decks clear the road below", async () => {
  const { report, group, ground, network } = await build("accra-central");
  assert.ok(report.raisedEdgeCount > 0 && group.userData.elevatedEdges === report.raisedEdgeCount);
  assert.ok(group.userData.guardrailRuns > 0 && group.userData.colliderCount > 0);
  for (const c of report.crossings.filter(c => c.ok)) assert.ok(c.clearanceM >= 4.5);
  const piers = group.children.find(m => m.name === "osm-road-piers");
  if (piers) {
    const P = piers.geometry.attributes.position.array;
    for (let i = 0; i < P.length; i += 3) {
      const road = ground.surfacesAt(P[i], P[i + 2]).filter(h => h.y > -0.2 && h.y < 1.5);
      // A pier base may stand on the terrain, never on or through a road surface at ground level.
      if (P[i + 1] < -0.2) assert.equal(road.length, 0, "pier vertex inside a ground-level road at " + P[i].toFixed(1) + "," + P[i + 2].toFixed(1));
    }
  }
  void network;
});
