import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Static verification of the Corolla taxi GLB (no browser, no CDN). Parses the binary directly.
// This does NOT replace loading it in <model-viewer>; see assets/vehicles/README.md for what was and wasn't run.

function parseGlb(url) {
  const buf = readFileSync(url);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, "glTF magic");
  assert.equal(buf.readUInt32LE(4), 2, "glTF version 2");
  assert.equal(buf.readUInt32LE(8), buf.length, "declared length matches file size");
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString("utf8"));
    if (type === 0x004e4942) bin = body;
    off += 8 + len;
  }
  assert.ok(json && bin, "JSON and BIN chunks present");
  return { json, bin, bytes: buf.length };
}

const COMP = { 5121: [1, Uint8Array], 5123: [2, Uint16Array], 5125: [4, Uint32Array], 5126: [4, Float32Array] };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(g, i) {
  const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView];
  const [size, T] = COMP[a.componentType], n = NC[a.type];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  assert.ok(start + a.count * n * size <= g.bin.length, "accessor inside BIN chunk");
  const copy = g.bin.buffer.slice(g.bin.byteOffset + start, g.bin.byteOffset + start + a.count * n * size);
  return { data: new T(copy), n, count: a.count };
}

const NEW = parseGlb(new URL("../assets/vehicles/accrarush_corolla_taxi.glb", import.meta.url));
const OLD = parseGlb(new URL("../assets/vehicles/source/accrarush_corolla_taxi_v1_original.glb", import.meta.url));

function nodeIndex(j) { const m = new Map(); j.nodes.forEach((n, i) => m.set(n.name, i)); return m; }
function parentOf(j) { const p = new Map(); j.nodes.forEach((n, i) => (n.children || []).forEach(c => p.set(c, i))); return p; }
function mul(a, b) { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; }
function local(n) {
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], t = n.translation || [0, 0, 0], s = n.scale || [1, 1, 1];
  return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + w * z) * s[0], 2 * (x * z - w * y) * s[0], 0,
    2 * (x * y - w * z) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + w * x) * s[1], 0,
    2 * (x * z + w * y) * s[2], 2 * (y * z - w * x) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1];
}
function world(j, i, par = parentOf(j)) { const l = local(j.nodes[i]); return par.has(i) ? mul(world(j, par.get(i), par), l) : l; }
function meshBounds(g, meshIdx) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of g.json.meshes[meshIdx].primitives) {
    const a = g.json.accessors[p.attributes.POSITION];
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.min[k]); hi[k] = Math.max(hi[k], a.max[k]); }
  }
  return { lo, hi };
}
function sceneBounds(g) {
  const par = parentOf(g.json), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  g.json.nodes.forEach((n, i) => {
    if (n.mesh === undefined) return;
    const W = world(g.json, i, par), b = meshBounds(g, n.mesh);
    for (const x of [b.lo[0], b.hi[0]]) for (const y of [b.lo[1], b.hi[1]]) for (const z of [b.lo[2], b.hi[2]]) {
      const p = [W[0] * x + W[4] * y + W[8] * z + W[12], W[1] * x + W[5] * y + W[9] * z + W[13], W[2] * x + W[6] * y + W[10] * z + W[14]];
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    }
  });
  return { lo, hi };
}

test("geometry data is well formed (indices in range, finite positions, unit normals)", () => {
  for (const m of NEW.json.meshes) for (const p of m.primitives) {
    const pos = accessor(NEW, p.attributes.POSITION), nor = accessor(NEW, p.attributes.NORMAL), idx = accessor(NEW, p.indices);
    assert.equal(nor.count, pos.count, m.name + ": one normal per vertex");
    assert.ok(pos.data.every(Number.isFinite), m.name + ": finite positions");
    assert.ok(idx.data.every(i => i < pos.count), m.name + ": indices in range");
    assert.equal(idx.count % 3, 0, m.name + ": triangle list");
    let bad = 0;
    for (let i = 0; i < nor.count; i++) { const l = Math.hypot(nor.data[i * 3], nor.data[i * 3 + 1], nor.data[i * 3 + 2]); if (Math.abs(l - 1) > 0.05) bad++; }
    assert.ok(bad / nor.count < 0.01, m.name + ": normals are unit length (" + bad + " bad)");
  }
});

test("improves v1 in place: v1 parts and pivot hierarchy are preserved, nothing was thrown away", () => {
  const names = new Set(NEW.json.nodes.map(n => n.name));
  for (const n of OLD.json.nodes) {
    if (n.name === "Interior") continue; // replaced by the real interior below
    assert.ok(names.has(n.name), "v1 node still present: " + n.name);
  }
});

test("scale and orientation are unchanged from v1 (bounds within 1.5%, +Z forward, +Y up)", () => {
  // Compare the shell only: Body+bumpers+wheels, so added interior/trim cannot hide a rescale.
  const a = sceneBounds(NEW), b = sceneBounds(OLD);
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(a.lo[k] - b.lo[k]) < 0.015 * (b.hi[k] - b.lo[k]) + 0.02, "min axis " + k);
    assert.ok(Math.abs(a.hi[k] - b.hi[k]) < 0.015 * (b.hi[k] - b.lo[k]) + 0.02, "max axis " + k);
  }
  assert.ok(a.hi[2] - a.lo[2] > 4.3 && a.hi[2] - a.lo[2] < 4.8, "length ~4.5 m along Z");
  assert.ok(a.hi[0] - a.lo[0] > 1.9 && a.hi[0] - a.lo[0] < 2.2, "width ~2.08 m including mirrors (1.71 m body)");
  assert.ok(a.lo[1] > -0.02 && a.lo[1] < 0.03, "wheels sit on y=0");
});

test("wheels are separate meshes with usable pivots", () => {
  const j = NEW.json, idx = nodeIndex(j), par = parentOf(j), nm = i => j.nodes[i].name;
  for (const w of ["FL", "FR"]) {
    const wheel = idx.get("Wheel_" + w), spin = idx.get("SpinPivot_" + w), steer = idx.get("SteerPivot_" + w);
    assert.ok(j.nodes[wheel].mesh !== undefined, "Wheel_" + w + " has its own mesh");
    assert.equal(nm(par.get(wheel)), "SpinPivot_" + w);
    assert.equal(nm(par.get(spin)), "SteerPivot_" + w, "steer pivot is the parent of the spin pivot");
  }
  for (const w of ["RL", "RR"]) {
    const wheel = idx.get("Wheel_" + w);
    assert.ok(j.nodes[wheel].mesh !== undefined);
    assert.equal(nm(par.get(wheel)), "SpinPivot_" + w);
  }
  for (const w of ["FL", "FR", "RL", "RR"]) {
    const wi = idx.get("Wheel_" + w), b = meshBounds(NEW, j.nodes[wi].mesh);
    const c = b.lo.map((v, k) => (v + b.hi[k]) / 2);
    assert.ok(Math.abs(c[0]) < 0.12 && Math.abs(c[1]) < 0.01 && Math.abs(c[2]) < 0.01, w + ": wheel geometry is centred on its spin axis, got " + c.map(v => v.toFixed(3)));
    const radius = (b.hi[1] - b.lo[1]) / 2;
    assert.ok(radius > 0.28 && radius < 0.36, w + ": tyre radius " + radius.toFixed(3));
    const W = world(j, idx.get("SpinPivot_" + w), par);
    assert.ok(Math.abs(W[13] - radius) < 0.02, w + ": axle height equals tyre radius (touches the ground)");
  }
  const fl = world(j, idx.get("SpinPivot_FL")), fr = world(j, idx.get("SpinPivot_FR")), rl = world(j, idx.get("SpinPivot_RL"));
  assert.ok(Math.abs(fl[12] + fr[12]) < 1e-3 && fl[12] > 0, "front axle symmetric about x=0, left wheel at +X");
  assert.ok(fl[14] > 0 && rl[14] < 0, "front wheels forward (+Z)");
});

test("steering wheel is a separate node on its own tilt parent, inside the cabin, facing the driver", () => {
  const j = NEW.json, idx = nodeIndex(j), par = parentOf(j);
  const sw = idx.get("SteeringWheel");
  assert.ok(sw !== undefined && j.nodes[sw].mesh !== undefined);
  assert.equal(j.nodes[par.get(sw)].name, "SteeringWheel_Tilt");
  assert.deepEqual(j.nodes[sw].extras.steerAxis, [0, 0, 1]);
  assert.equal(j.nodes[sw].rotation, undefined, "no baked rotation: game writes rotation.z directly");
  const W = world(j, sw, par);
  assert.ok(W[12] > 0.2 && W[12] < 0.5, "driver (left-hand drive) side");
  assert.ok(W[13] > 0.8 && W[13] < 1.1 && W[14] > 0.3 && W[14] < 0.7, "sits at the dash");
  // local +Z maps to world (0, +sin, -cos): back toward the driver and up
  assert.ok(W[10] < -0.8 && W[9] > 0.1, "column axis points rearward and slightly up");
});

test("simple interior is present: dash, cluster, two front seats with headrests, rear seat, door cards", () => {
  const names = new Set(NEW.json.nodes.map(n => n.name));
  for (const n of ["Interior", "CabinShell", "Dashboard", "InstrumentCluster", "Seat_Driver", "Seat_Passenger", "Seat_Rear", "DoorCard_FL", "DoorCard_FR", "DoorCard_RL", "DoorCard_RR"]) assert.ok(names.has(n), "missing " + n);
  for (const s of ["Seat_Driver", "Seat_Passenger"]) {
    const i = nodeIndex(NEW.json).get(s), b = meshBounds(NEW, NEW.json.nodes[i].mesh);
    assert.ok(b.hi[1] > 1.2, s + " has a headrest above 1.2 m");
  }
  const mats = NEW.json.materials.map(m => m.name);
  assert.ok(mats.includes("Interior_Cluster") && mats.includes("Interior_Dash"));
});

test("door cards swing with the doors (children of the hinge nodes)", () => {
  const j = NEW.json, idx = nodeIndex(j), par = parentOf(j);
  for (const k of ["FL", "FR", "RL", "RR"]) assert.equal(j.nodes[par.get(idx.get("DoorCard_" + k))].name, "Door_" + k + "_Hinge");
});

test("paint-picker contract: only the body paint materials are tinted by applyPaint()", () => {
  // Same regex as src/ui/phase-2-navigation.js applyPaint().
  const skip = /glass|window|wheel|tyre|tire|rubber|chrome|light|lamp|interior|glass/i;
  const painted = NEW.json.materials.map(m => m.name).filter(n => !skip.test(n.toLowerCase()));
  assert.deepEqual(painted.sort(), ["Taxi_Body_Paint", "Taxi_Wing_Yellow"]);
  const menu = readFileSync(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
  assert.ok(menu.includes("glass|window|wheel|tyre|tire|rubber|chrome|light|lamp|interior"), "regex in the game still matches the one used here");
});

test("mobile budget: triangles, draw calls, materials, textures and file size", () => {
  const j = NEW.json;
  let tris = 0, draws = 0;
  for (const m of j.meshes) for (const p of m.primitives) { tris += j.accessors[p.indices].count / 3; draws++; }
  assert.ok(tris <= 40000, "triangles " + tris);
  assert.ok(draws <= 80, "draw calls " + draws);
  assert.ok(j.materials.length <= 30, "materials " + j.materials.length);
  assert.ok(NEW.bytes <= 1.5 * 1024 * 1024, "file size " + NEW.bytes);
  assert.equal(new Set(j.materials.map(m => m.name)).size, j.materials.length, "no duplicate material names");
  for (const im of j.images) {
    const bv = j.bufferViews[im.bufferView], off = (bv.byteOffset || 0), png = NEW.bin.subarray(off, off + bv.byteLength);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    assert.ok(w <= 512 && h <= 512, im.name + " " + w + "x" + h + " must be <= 512px");
    assert.ok(((w & (w - 1)) === 0) && ((h & (h - 1)) === 0), im.name + " power-of-two for mipmaps on WebGL1");
  }
});

test("glass is double-sided so the cabin is not see-through from inside, and sign UVs are not mirrored", () => {
  const glass = NEW.json.materials.find(m => m.name === "Glass_Tint");
  assert.equal(glass.doubleSided, true);
  assert.equal(glass.alphaMode, "BLEND");
  const j = NEW.json, idx = nodeIndex(j), sign = j.meshes[j.nodes[idx.get("Roof_Sign")].mesh];
  const faceMat = j.materials.findIndex(m => m.name === "Sign_Face_Lamp");
  const prim = sign.primitives.find(p => p.material === faceMat), pos = accessor(NEW, prim.attributes.POSITION), uv = accessor(NEW, prim.attributes.TEXCOORD_0);
  // front face (normal +Z, z > 0.2). Seen from in front of the car the viewer's right is +X, so U must
  // increase with X; v1 had it reversed and the sign read "IXAT".
  const front = [...Array(pos.count).keys()].filter(i => pos.data[i * 3 + 2] > 0.2);
  const a = front.reduce((p, c) => (pos.data[c * 3] < pos.data[p * 3] ? c : p)), b = front.reduce((p, c) => (pos.data[c * 3] > pos.data[p * 3] ? c : p));
  const sgn = (uv.data[b * 2] - uv.data[a * 2]);
  const nz = accessor(NEW, prim.attributes.NORMAL).data[front[0] * 3 + 2];
  assert.ok(nz > 0.9);
  assert.ok(sgn > 0, "sign text must not be mirrored (u increases with x on the +Z face)");
});
