import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRoadGround, barrierResponse, VEHICLE_LAYOUT } from "../src/map/road-ground.js";
import { GROUND_Y } from "../src/map/road-surface-contract.js";

// A 20 m x 10 m road strip along -z rising 1 m (5%), plus a 4 m wide deck 6 m above it crossing at z in [-10,-6].
const quad = (x0, z0, y0, x1, z1, y1) => [x0, y0, z0, x1, y0, z0, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z1];
const road = quad(-5, 0, 0, 5, -20, 1);
const deck = quad(-5, -6, 6, 5, -10, 6);
const ground = createRoadGround({
  triangles: [...road, ...deck], thickness: [0, 0, 0.9, 0.9],
  colliders: [{ ax: -5, ay: 0, az: -2, bx: 5, by: 0, bz: -2, halfWidthM: 0.2, heightM: 1, kind: "test" }, { ax: -5, ay: 6, az: -8, bx: 5, by: 6, bz: -8, halfWidthM: 0.1, heightM: 1, kind: "deck-rail" }]
});

test("sample returns the interpolated surface height on a slope and ground off the road", () => {
  assert.ok(Math.abs(ground.sample(0, -10, { hintY: 0.5 }).y - 0.5) < 1e-9);
  assert.ok(Math.abs(ground.sample(2, -15, { hintY: 0.9 }).y - 0.75) < 1e-9);
  const off = ground.sample(50, 50);
  assert.equal(off.onRoad, false); assert.equal(off.y, GROUND_Y);
});

test("hint picks the flyover for a car on it and the road beneath for a car under it", () => {
  assert.equal(ground.sample(0, -8, { hintY: 6 }).y, 6);
  assert.ok(Math.abs(ground.sample(0, -8, { hintY: 0.5 }).y - 0.4) < 1e-9);
  assert.equal(ground.sample(0, -8).y, 6, "no hint: the visible top surface wins");
});

test("overhead clearance reports the deck underside so the camera can stay below it", () => {
  assert.ok(Math.abs(ground.overheadAt(0, -8, 0.4) - 5.1) < 1e-9);
  assert.equal(ground.overheadAt(0, -15, 0.7), Infinity);
});

test("a vehicle on level ground sits flat; on a 5% slope it pitches nose-up by atan(0.05)", () => {
  const state = { y: 0.5 }; // a vehicle always arrives with the height it already had (route pose at spawn)
  ground.place(0, -10, 0, -1, state, 1 / 60);
  assert.ok(Math.abs(state.pitch - Math.atan(0.05)) < 1e-6, "pitch " + state.pitch);
  assert.ok(Math.abs(state.roll) < 1e-9);
  assert.ok(Math.abs(state.y - 0.5) < 1e-6);
});

test("a vehicle never sinks: after every frame of a drive up the slope its y equals the wheel-plane height", () => {
  const state = { y: 0.15 };
  for (let i = 0; i <= 150; i++) {
    const z = -3 - i * 0.1; // start clear of the strip's end so no wheel is off the road
    ground.place(0, z, 0, -1, state, 1 / 60);
    const expected = (-z) * 0.05;
    assert.ok(state.y >= expected - 1e-6, `sunk ${(expected - state.y).toFixed(4)} m at z=${z}`);
  }
});

test("a vehicle falls under gravity rather than teleporting when the surface drops away", () => {
  const state = { y: 3 };
  ground.place(40, 40, 0, -1, state, 1 / 60);
  assert.ok(state.y < 3 && state.y > GROUND_Y, "should be mid-fall: " + state.y);
  for (let i = 0; i < 120; i++) ground.place(40, 40, 0, -1, state, 1 / 60);
  assert.ok(Math.abs(state.y - GROUND_Y) < 1e-6);
});

test("barrier collision pushes a car out, ignores overhead deck rails, and reports the normal", () => {
  const hit = ground.collide(0, 0.3, 0, -1, 0.0); // front circle 1.1 m ahead of the centre has reached the barrier at z=-2
  assert.ok(hit && hit.kind === "test");
  assert.ok(hit.nz > 0.99, "normal points from the barrier back toward the car: " + hit.nz);
  const after = ground.collide(0, 0.3 + hit.pushZ, 0, -1, 0.0);
  assert.equal(after, null, "push-out must fully clear the barrier");
  assert.equal(ground.collide(0, -8, 0, -1, 0.4), null, "deck guardrail overhead must not collide with a car underneath");
  const onDeck = ground.collide(0, -6.9, 0, -1, 6);
  assert.ok(onDeck && onDeck.kind === "deck-rail", "a car on the deck must hit the deck rail");
});

test("a fast car cannot tunnel through a barrier when moved in sub-steps of <= 0.8 m", () => {
  let z = 5, speed = 50; // m/s, ~180 km/h
  const dt = 1 / 30;
  let contacts = 0;
  for (let frame = 0; frame < 30 && z > -6; frame++) {
    const move = speed * dt, steps = Math.ceil(move / 0.8);
    for (let s = 0; s < steps; s++) {
      z -= move / steps;
      const hit = ground.collide(0, z, 0, -1, 0);
      if (hit) { z += hit.pushZ; speed = barrierResponse(hit, 0, -1, speed).speedMps; contacts++; }
    }
  }
  assert.ok(contacts > 0, "must register the impact");
  assert.ok(z > -2.1 + 0, "car ended on the near side of the barrier at z=-2: " + z);
});

test("barrierResponse: head-on loses most speed, a scrape keeps nearly all of it", () => {
  assert.ok(barrierResponse({ nx: 0, nz: 1 }, 0, -1, 40).speedMps < 13);
  assert.ok(barrierResponse({ nx: 0.97, nz: 0.24 }, 0.24, -0.97, 40).speedMps >= 37.9);
});

test("vehicle layout matches the shipped Corolla GLB wheel pivots and body width", async () => {
  const buf = await readFile(new URL("../assets/vehicles/accrarush_corolla_taxi.glb", import.meta.url));
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
  const pivot = n => json.nodes.find(x => x.name === n).translation;
  const fl = pivot("SteerPivot_FL"), rl = pivot("SpinPivot_RL");
  assert.ok(Math.abs(VEHICLE_LAYOUT.trackM - 2 * fl[0]) < 1e-9);
  assert.ok(Math.abs(VEHICLE_LAYOUT.wheelbaseM - (fl[2] - rl[2])) < 1e-9);
  const acc = json.accessors; let minX = 1e9, maxX = -1e9;
  for (const m of json.meshes) for (const p of m.primitives) { const a = acc[p.attributes.POSITION]; minX = Math.min(minX, a.min[0]); maxX = Math.max(maxX, a.max[0]); }
  assert.ok(Math.abs(VEHICLE_LAYOUT.bodyHalfWidthM - maxX) < 0.01);
  assert.ok(VEHICLE_LAYOUT.collisionRadiusM >= VEHICLE_LAYOUT.bodyHalfWidthM, "collision circles must cover the body width");
});
