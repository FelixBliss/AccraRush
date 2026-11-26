import test from "node:test";
import assert from "node:assert/strict";
import { MeshBatch } from "../src/map/mesh-batch.js";

const faceNormals = batch => {
  const out = [];
  for (let i = 0; i < batch.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => batch.indices[i + k] * 3);
    const P = batch.positions;
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n);
    out.push({ n: n.map(x => x / l), centroid: [0, 1, 2].map(k => (P[a + k] + P[b + k] + P[c + k]) / 3), stored: [batch.normals[a], batch.normals[a + 1], batch.normals[a + 2]] });
  }
  return out;
};

for (const [name, grade, yaw] of [["flat", 0, 0], ["sloped", 0.06, 0], ["yawed and sloped", 0.06, 0.7]]) {
  test(`box (${name}): every triangle faces outward and its stored normal equals its winding`, () => {
    const batch = new MeshBatch();
    batch.box(10, 2, -5, 1.2, 0.8, 3, yaw, { grade });
    assert.equal(batch.positions.length / 3, 24, "each face owns its vertices (no shared corners)");
    for (const f of faceNormals(batch)) {
      const out = [f.centroid[0] - 10, f.centroid[1] - 2, f.centroid[2] + 5];
      assert.ok(f.n[0] * out[0] + f.n[1] * out[1] + f.n[2] * out[2] > 0, "inward-facing triangle");
      assert.ok(Math.abs(f.n[0] - f.stored[0]) + Math.abs(f.n[1] - f.stored[1]) + Math.abs(f.n[2] - f.stored[2]) < 1e-6, "stored normal disagrees with winding");
    }
  });
}

test("box lists its top face first and it points upward", () => {
  const batch = new MeshBatch();
  batch.box(0, 0, 0, 1, 1, 1, 0.3);
  assert.ok(faceNormals(batch)[0].n[1] > 0.99);
});

test("quad corrects reversed winding from the hint and rejects degenerate input", () => {
  const batch = new MeshBatch();
  assert.equal(batch.quad([0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0], { hint: [0, 1, 0] }), true);
  assert.equal(batch.quad([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], { hint: [0, 1, 0] }), true);
  for (const f of faceNormals(batch)) assert.ok(f.n[1] > 0.99);
  assert.equal(batch.quad([0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]), false);
  assert.equal(batch.skippedDegenerate, 1);
});

test("ribbonPrism follows a bend and slope with no gaps: adjacent segments share their mitred edge", () => {
  const batch = new MeshBatch();
  const line = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0.2, z: -10 }, { x: 8, y: 0.4, z: -18 }, { x: 20, y: 0.4, z: -18 }];
  const added = batch.ribbonPrism(line, 0.4, -0.1, 0.9);
  assert.ok(added >= 9);
  for (const f of faceNormals(batch)) assert.ok(Number.isFinite(f.n[0] + f.n[1] + f.n[2]));
  // Consecutive top faces must share their two mitred edge vertices exactly (no gap, no overlap sliver).
  const P = batch.positions, tops = [];
  for (let q = 0; q < P.length / 3; q += 4) if (batch.normals[q * 3 + 1] > 0.99) {
    tops.push([0, 1, 2, 3].map(k => [P[(q + k) * 3], P[(q + k) * 3 + 1], P[(q + k) * 3 + 2]].map(x => x.toFixed(9)).join(",")));
  }
  assert.equal(tops.length, 3);
  for (let i = 1; i < tops.length; i++) {
    const shared = tops[i].filter(v => tops[i - 1].includes(v));
    assert.equal(shared.length, 2, "segment " + i + " must share both mitred edge vertices with the previous one");
  }
});
