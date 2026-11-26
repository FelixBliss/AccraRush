import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { selectRoadGraph, selectHighwayRouteGraph } from "../src/map/selected-road-graph.js";
import { applyGradeSeparation } from "../src/map/road-elevation.js";
import { createRoadMeshes } from "../src/map/three-road-renderer.js";
import { createRoadGround } from "../src/map/road-ground.js";
import { buildRoadFoundation } from "../src/map/road-foundations.js";
import { ROAD_SURFACE_Y } from "../src/map/road-surface-contract.js";

class Group { constructor() { this.children = []; this.userData = {}; } add(c) { this.children.push(c); } }
class BufferGeometry { constructor() { this.attributes = {}; this.index = []; } setAttribute(n, v) { this.attributes[n] = v; } setIndex(v) { this.index = v; } computeVertexNormals() {} computeBoundingSphere() {} }
class Float32BufferAttribute { constructor(a, s) { this.array = a; this.itemSize = s; } }
class Mesh { constructor(g, m) { this.geometry = g; this.material = m; this.userData = {}; } }
class Material { constructor(o) { Object.assign(this, o); } }
const THREE = { Group, BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial: Material, DoubleSide: 2, RepeatWrapping: 1000 };
const load = async n => JSON.parse(await readFile(new URL(`../data/osm/${n}.json`, import.meta.url), "utf8"));

for (const areaId of ["accra-central", "lapaz"]) {
  test(`${areaId}: driving every lane at 60 fps-equivalent steps never leaves the road, sinks, jumps or pitches wildly`, async () => {
    const source = (await load(areaId + ".network")).network;
    const flat = areaId === "lapaz" ? selectHighwayRouteGraph(source, await load("lapaz-madina-route")).network : selectRoadGraph(source, areaId).network;
    const network = applyGradeSeparation(flat).network;
    const ground = createRoadGround(createRoadMeshes(THREE, network).userData.roadSurface);
    let samples = 0, offRoad = 0, sunk = 0, jumps = 0, steep = 0, worstJump = 0, worstPitch = 0;
    for (const edge of network.edges) {
      let foundation; try { foundation = buildRoadFoundation(edge); } catch { continue; }
      for (const lane of foundation.laneCentrelines) {
        if (lane.direction === "both") continue;
        const state = {}; let previousY = null;
        for (let i = 1; i < lane.points.length; i++) {
          const a = lane.points[i - 1], b = lane.points[i], len = Math.hypot(b.x - a.x, b.z - a.z);
          if (len < 1e-6) continue;
          const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
          for (let s = 0; s < len; s += 0.5) {
            const x = a.x + fx * s, z = a.z + fz * s, roadY = a.y + (b.y - a.y) * (s / len) + ROAD_SURFACE_Y;
            if (previousY === null) state.y = roadY;
            ground.place(x, z, fx, fz, state, 1 / 60);
            samples++;
            if (!state.onRoad) offRoad++;
            if (state.y < roadY - 0.1) sunk++;          // wheels below the asphalt of the lane being driven
            if (previousY !== null) { const jump = Math.abs(state.y - previousY); worstJump = Math.max(worstJump, jump); if (jump > 0.3) jumps++; }
            worstPitch = Math.max(worstPitch, Math.abs(state.pitch));
            if (Math.abs(state.pitch) > 0.25) steep++;
            previousY = state.y;
          }
        }
      }
    }
    assert.ok(samples > 20000);
    const rate = n => n / samples;
    assert.ok(rate(offRoad) < 0.005, `${offRoad}/${samples} samples off the drawn road`);
    assert.ok(rate(sunk) < 0.005, `${sunk}/${samples} samples below the asphalt`);
    assert.ok(rate(jumps) < 0.002, `${jumps} height jumps > 0.3 m per 0.5 m step (worst ${worstJump.toFixed(2)} m)`);
    assert.ok(rate(steep) < 0.002, `${steep} samples pitched beyond 14° (worst ${(worstPitch * 57.3).toFixed(1)}°)`);
  });
}
