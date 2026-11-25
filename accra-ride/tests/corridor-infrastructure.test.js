import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { planFootbridge, buildFootbridgeBoxes, appendFootbridge, validateFootbridgeSpec } from "../src/map/footbridge.js";
import { buildBusShelterBoxes, appendBusShelter, BUS_SHELTER_DEFAULTS } from "../src/map/bus-shelter.js";
import { MEDIAN_PROFILES, MIN_NOSE_WIDTH_M, resolveMedianProfile, appendMedianSegment, appendMedianTransition } from "../src/map/median-profiles.js";
import { createRoadFeatureMeshes } from "../src/map/road-feature-renderer.js";

const EPS = 1e-6;
class Recorder { constructor() { this.boxes = []; } box(cx, cy, cz, sx, sy, sz, yaw, color) { this.boxes.push({ cx, cy, cz, sx, sy, sz, yaw, color }); } }

// Dual carriageway: 8 m of lanes either side of a 3 m median (u measured from the median centre).
const DUAL = { leftOuterM: 9.5, rightOuterM: 9.5, median: { leftM: 1.5, rightM: -1.5 } };
const carriagewayZones = cs => [[cs.median ? cs.median.leftM : 0, cs.leftOuterM], [-cs.rightOuterM, cs.median ? cs.median.rightM : 0]];
const overlaps = (lo, hi, [a, b]) => hi > a + EPS && lo < b - EPS;

test("footbridge: every part over a carriageway clears the vehicle envelope", () => {
  const plan = planFootbridge({ crossSection: DUAL });
  const clearance = plan.params.verticalClearanceM, zones = carriagewayZones(DUAL);
  const over = buildFootbridgeBoxes(plan).filter(b => zones.some(z => overlaps(b.u - b.su / 2, b.u + b.su / 2, z)));
  assert.ok(over.some(b => b.part === "deck") && over.some(b => b.part === "girder"), "deck and girders must span the carriageways");
  for (const b of over) assert.ok(b.y - b.sy / 2 >= clearance - EPS, b.part + " underside " + (b.y - b.sy / 2) + " is below clearance " + clearance);
  assert.ok(!over.some(b => b.part === "column" || b.part === "step" || b.part === "stringer" || b.part === "landing"), "no support or stair may stand on a carriageway");
});

test("footbridge: deck is elevated, spans both carriageways and is oriented across the road", () => {
  const plan = planFootbridge({ crossSection: DUAL }), deck = buildFootbridgeBoxes(plan).find(b => b.part === "deck");
  assert.ok(deck.su > DUAL.leftOuterM + DUAL.rightOuterM, "deck must be longer than the road is wide");
  assert.equal(deck.sv, plan.params.deckWidthM, "deck width runs along the road");
  assert.ok(deck.y - deck.sy / 2 > plan.params.verticalClearanceM - 0.1, "deck must be an elevated structure, not a flat block on the road");
  assert.ok(plan.walkingY > plan.params.verticalClearanceM);
});

test("footbridge: columns at both ends, a median column only when the median is wide enough", () => {
  const withMedian = buildFootbridgeBoxes(planFootbridge({ crossSection: DUAL }));
  assert.ok(withMedian.filter(b => b.part === "column" && Math.abs(b.u) > 10).length >= 4, "paired end columns on both sides");
  assert.equal(withMedian.filter(b => b.part === "median-column").length, 2);
  const narrow = buildFootbridgeBoxes(planFootbridge({ crossSection: { ...DUAL, median: { leftM: 0.4, rightM: -0.4 } } }));
  assert.equal(narrow.filter(b => b.part === "median-column").length, 0, "0.8 m median is too narrow for a column");
  const single = buildFootbridgeBoxes(planFootbridge({ crossSection: { leftOuterM: 5, rightOuterM: 5 } }));
  assert.equal(single.filter(b => b.part === "median-column").length, 0);
});

test("footbridge: staircases and landings exist on both sides and meet the stair limits", () => {
  const plan = planFootbridge({ crossSection: DUAL }), boxes = buildFootbridgeBoxes(plan);
  const steps = side => boxes.filter(b => b.part === "step" && Math.sign(b.u) === side);
  assert.equal(steps(1).length, steps(-1).length);
  assert.equal(steps(1).length, plan.flights * plan.stepsPerFlight);
  assert.ok(plan.stairRiseM <= plan.params.stairRiseMax + EPS, "rise " + plan.stairRiseM);
  assert.ok(plan.params.stairRunM >= 0.28);
  for (const side of [-1, 1]) {
    const top = b => b.y + b.sy / 2, s = steps(side);
    assert.ok(Math.abs(top(s.at(-1))) < 1e-6, "lowest step must land at ground level");
    assert.ok(Math.abs(top(s[0]) - (plan.walkingY - plan.stairRiseM)) < 1e-6);
    assert.ok(boxes.some(b => b.part === "landing" && Math.sign(b.u) === side), "top landing");
    if (plan.flights > 1) assert.ok(boxes.some(b => b.part === "mid-landing" && Math.sign(b.u) === side), "mid landing");
  }
  const rising = steps(1).map(b => b.y + b.sy / 2);
  assert.ok(rising.every((h, i) => i === 0 || h < rising[i - 1] + EPS), "steps must descend monotonically");
});

test("footbridge: both deck edges and stair edges have safety railings of the configured height", () => {
  const plan = planFootbridge({ crossSection: DUAL }), boxes = buildFootbridgeBoxes(plan), H = plan.walkingY;
  for (const s of [-1, 1]) {
    const topRail = boxes.find(b => b.part === "rail" && Math.sign(b.v) === s && Math.abs(b.y - (H + plan.params.railHeightM)) < EPS && b.su > 20);
    assert.ok(topRail, "deck top rail on side " + s);
    assert.ok(boxes.some(b => b.part === "mesh" && Math.sign(b.v) === s && b.su > 20), "deck mesh infill");
  }
  assert.ok(plan.params.railHeightM >= 1.1);
  assert.ok(boxes.filter(b => b.part === "rail" && Math.abs(b.u) > 10).length > 40, "stair handrails along every flight");
});

test("footbridge: every dimension is labelled procedural, never an OSM measurement", () => {
  const plan = planFootbridge({ crossSection: DUAL, overrides: { verticalClearanceM: 5.8 } });
  for (const m of Object.values(plan.measurements)) assert.ok(!/osm/i.test(m.provenance), m.provenance);
  assert.equal(plan.measurements.verticalClearanceM.provenance, "caller-override");
  assert.equal(plan.measurements.deckWidthM.provenance, "configurable-default");
  assert.throws(() => planFootbridge({ crossSection: { leftOuterM: -1, rightOuterM: 5 } }));
  assert.throws(() => planFootbridge({ crossSection: { leftOuterM: 5, rightOuterM: 5, median: { leftM: 9, rightM: 0 } } }));
});

test("footbridge: placement rotates with the road heading and preserves local geometry", () => {
  const plan = planFootbridge({ crossSection: DUAL }), local = buildFootbridgeBoxes(plan);
  const heading = { x: 0.6, z: 0.8 }, origin = { x: 100, z: -50 }, rec = new Recorder();
  assert.equal(appendFootbridge(rec, plan, { ...origin, heading }), local.length);
  const dx = heading.x, dz = heading.z, nx = -dz, nz = dx;
  rec.boxes.forEach((w, i) => {
    const l = local[i], rx = w.cx - origin.x, rz = w.cz - origin.z;
    assert.ok(Math.abs(rx * nx + rz * nz - l.u) < 1e-9 && Math.abs(rx * dx + rz * dz - l.v) < 1e-9);
    assert.ok(w.sx === l.su && w.sz === l.sv && w.cy === l.y && w.sy === l.sy);
    assert.ok(Math.abs(w.yaw - Math.atan2(dx, dz)) < 1e-12);
  });
});

test("footbridge: geometry stays inside the Android box budget", () => {
  const count = buildFootbridgeBoxes(planFootbridge({ crossSection: DUAL })).length;
  assert.ok(count < 800, count + " boxes per bridge");
});

test("footbridge specs: both identified bridges exist and no position is claimed without an OSM element", async () => {
  const spec = JSON.parse(await readFile(new URL("../data/corridor/lapaz-akweteyman-infrastructure.json", import.meta.url), "utf8"));
  assert.deepEqual(spec.footbridges.map(f => f.id).sort(), ["fb-akweteyman-snet", "fb-lapaz-community-school"]);
  for (const f of spec.footbridges) assert.deepEqual(validateFootbridgeSpec(f), [], f.id);
  assert.ok(validateFootbridgeSpec({ id: "x", name: "x", anchor: { provenance: "osm-mapped", lat: 5.6, lon: -0.2 } }).length, "osm-mapped needs an element id");
  assert.ok(validateFootbridgeSpec({ id: "x", name: "x", anchor: { provenance: "unplaced", lat: 5.6, lon: -0.2 } }).length, "unplaced must not carry coordinates");
});

test("bus shelter: roof, platform, bench, glazing, board and sign are all present", () => {
  const parts = new Set(buildBusShelterBoxes().map(b => b.part));
  for (const part of ["platform", "post", "roof", "fascia", "glass", "bench", "board", "bin", "pole", "sign"]) assert.ok(parts.has(part), part);
  assert.ok(buildBusShelterBoxes().length >= 4 * 4, "at least four times the old four-box canopy");
});

test("bus shelter: only the roof overhang reaches toward the road and the roof is above head height", () => {
  const boxes = buildBusShelterBoxes();
  for (const b of boxes) assert.ok(b.lr + b.sr / 2 <= BUS_SHELTER_DEFAULTS.roofOverhangM + EPS, b.part + " reaches " + (b.lr + b.sr / 2));
  const roof = boxes.find(b => b.part === "roof");
  assert.ok(roof.y - roof.sy / 2 >= 2.3);
  const under = boxes.find(b => b.part === "bench");
  assert.ok(Math.abs(under.lr) < BUS_SHELTER_DEFAULTS.depthM && under.lr < roof.lr + roof.sr / 2, "bench sits under the roof");
});

test("bus shelter: placement never enters the carriageway on either side of the road", () => {
  for (const side of [-1, 1]) {
    const hw = 3.5, dist = hw + 0.7, rec = new Recorder();
    // Renderer convention: heading (1, 0) has left normal (0, 1), so a shelter at z = +dist has side +1.
    appendBusShelter(rec, { x: 10, z: side * dist, heading: { x: 1, z: 0 }, side });
    for (const b of rec.boxes) {
      const roadFacingEdge = side > 0 ? Math.min(...cornerZ(b)) : -Math.max(...cornerZ(b));
      assert.ok(roadFacingEdge >= hw + 0.7 - BUS_SHELTER_DEFAULTS.roofOverhangM - EPS, "box reaches z=" + roadFacingEdge);
    }
  }
});
function cornerZ(b) { const c = Math.cos(b.yaw), s = Math.sin(b.yaw), out = []; for (const lx of [-1, 1]) for (const lz of [-1, 1]) out.push(b.cz - lx * b.sx / 2 * s + lz * b.sz / 2 * c); return out; }

test("renderer: bus stops now draw the procedural shelter in the single batched mesh", () => {
  class Material {}; class Group { constructor() { this.children = []; } add(c) { this.children.push(c); } }
  class BufferGeometry { setAttribute(n, a) { (this.attributes ??= {})[n] = a; } setIndex(i) { this.index = i; } computeVertexNormals() {} }
  class Float32BufferAttribute { constructor(a) { this.array = a; } }
  class Mesh { constructor(g, m) { this.geometry = g; this.material = m; } }
  const THREE = { Group, BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial: Material };
  const network = { edges: [{ id: "e", lanes: [{ widthM: 3.5 }, { widthM: 3.5 }], centerline: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }] }] };
  const group = createRoadFeatureMeshes(THREE, [{ id: "bs", kind: "bus_stop", edgeId: "e", position: { x: 35, y: 0, z: -6 }, heading: { x: 1, z: 0 }, side: -1 }], network);
  assert.equal(group.userData.counts.bus_stop, 1);
  const g = group.children[0].geometry, boxCount = g.index.length / 36;
  assert.equal(boxCount, buildBusShelterBoxes().length, "one shelter replaces the old 4-box canopy");
  assert.ok(g.index.every(i => i < g.attributes.position.array.length / 3));
});

test("median profiles: four distinct designs are defined", () => {
  assert.deepEqual(Object.keys(MEDIAN_PROFILES).sort(), ["concrete-barrier", "mesh-fence", "open", "tiled-block"]);
});

test("median profiles: assignment is per chainage range and unassigned stretches are not invented", () => {
  const config = { default: null, ranges: [{ fromM: 0, toM: 500, profile: "tiled-block", provenance: "configured-range" }, { fromM: 500, toM: 900, profile: "mesh-fence" }, { fromM: 900, toM: 1200, profile: "concrete-barrier" }] };
  assert.equal(resolveMedianProfile(config, 100).profileId, "tiled-block");
  assert.equal(resolveMedianProfile(config, 700).profileId, "mesh-fence");
  assert.equal(resolveMedianProfile(config, 1000).profileId, "concrete-barrier");
  assert.deepEqual(resolveMedianProfile(config, 5000), { profileId: "open", provenance: "unassigned" });
  assert.deepEqual(resolveMedianProfile({ ranges: [] }, 10), { profileId: "open", provenance: "unassigned" });
  assert.ok(new Set([100, 700, 1000].map(c => resolveMedianProfile(config, c).profileId)).size === 3, "not one design along the whole route");
  assert.throws(() => resolveMedianProfile({ ranges: [{ fromM: 0, toM: 1, profile: "gold-plated" }] }, 0));
});

const A = { x: 0, z: 0 }, B = { x: 0, z: 30 };
const maxTop = boxes => Math.max(...boxes.map(b => b.cy + b.sy / 2));
const halfWidthOf = (boxes, ax) => Math.max(...boxes.map(b => Math.abs(b.cx - ax) + b.sx / 2));

test("median profiles: each profile builds its expected physical form within the median width", () => {
  const out = {};
  for (const id of Object.keys(MEDIAN_PROFILES)) {
    const rec = new Recorder(); appendMedianSegment(rec, { a: A, b: B, widthM: 3, profileId: id });
    out[id] = rec.boxes; assert.ok(rec.boxes.length > 0, id);
    assert.ok(halfWidthOf(rec.boxes, 0) <= 1.5 + EPS, id + " must stay inside the 3 m median");
  }
  assert.ok(maxTop(out["tiled-block"]) <= 0.2 && maxTop(out["tiled-block"]) >= 0.15, "raised kerb ~0.18 m, no fence");
  assert.ok(maxTop(out["mesh-fence"]) >= 1.5, "mesh fence stands at least 1.5 m over the kerb");
  assert.ok(Math.abs(maxTop(out["concrete-barrier"]) - 1.0) < EPS, "solid barrier is 1.0 m tall");
  assert.ok(maxTop(out.open) <= 0.03, "open median has no raised structure");
  assert.ok(out["tiled-block"].some(b => b.color.join() !== out["tiled-block"][0].color.join()), "tiles alternate in colour");
});

test("median profiles: transitions taper to a narrow nose and never widen", () => {
  for (const id of ["tiled-block", "mesh-fence", "concrete-barrier"]) {
    const rec = new Recorder();
    const n = appendMedianTransition(rec, { at: { x: 0, z: 0 }, heading: { x: 0, z: 1 }, widthM: 3, profileId: id, lengthM: 8, steps: 4 });
    assert.ok(n > 0, id);
    const widths = [0, 1, 2, 3].map(i => Math.max(...rec.boxes.filter(b => b.cz > 2 * i && b.cz < 2 * (i + 1)).map(b => b.sx)));
    assert.ok(widths.every((w, i) => i === 0 || w <= widths[i - 1] + EPS), id + " widths " + widths);
    assert.ok(widths[3] <= 0.6 + EPS, id + " nose too wide: " + widths[3]);
  }
  assert.equal(appendMedianTransition(new Recorder(), { at: A, heading: { x: 0, z: 1 }, widthM: 3, profileId: "open" }), 0);
  assert.ok(MIN_NOSE_WIDTH_M > 0);
});
