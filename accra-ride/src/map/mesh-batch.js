/**
 * Flat-shaded, explicitly-normalled mesh batch.
 *
 * The previous road/feature batches shared the eight corners of every box and then called
 * computeVertexNormals(), which averages the three face normals meeting at a corner. Box
 * faces were shaded as if rounded, so deck sides, parapets and signs lit inconsistently
 * and shadow terminators crawled across them. Here every face owns its four vertices and
 * a normal computed from its true winding, so shading is exact and winding is testable.
 *
 * Quads are oriented from an explicit outward hint rather than trusting call-site vertex
 * order: whichever way the four corners were supplied, the stored winding faces the hint.
 */
const EPSILON = 1e-12;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class MeshBatch {
  constructor({ colors = false } = {}) {
    this.positions = []; this.normals = []; this.uvs = []; this.indices = [];
    this.colors = colors ? [] : null;
    this.skippedDegenerate = 0;
  }
  get base() { return this.positions.length / 3; }
  get empty() { return this.positions.length === 0; }

  /**
   * Add one flat quad. a,b,c,d are [x,y,z]; hint is the direction the face must point
   * (a vector, not a point). uv is an optional array of four [u,v] pairs matching a,b,c,d.
   * Returns false when the quad is degenerate and nothing was added.
   */
  quad(a, b, c, d, { hint = [0, 1, 0], uv = null, color = null } = {}) {
    let normal = cross(sub(b, a), sub(c, a));
    let length = Math.hypot(...normal);
    if (length < EPSILON) { // first triangle degenerate: try the other diagonal before giving up
      normal = cross(sub(c, a), sub(d, a));
      length = Math.hypot(...normal);
      if (length < EPSILON) { this.skippedDegenerate++; return false; }
    }
    let order = [a, b, c, d], uvs = uv ? [uv[0], uv[1], uv[2], uv[3]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
    if (dot(normal, hint) < 0) { // wrong way round: reverse the winding, normal flips with it
      order = [a, d, c, b];
      uvs = [uvs[0], uvs[3], uvs[2], uvs[1]];
      normal = [-normal[0], -normal[1], -normal[2]];
      length = Math.hypot(...normal);
    }
    const n = [normal[0] / length, normal[1] / length, normal[2] / length];
    const base = this.base;
    for (let i = 0; i < 4; i++) {
      this.positions.push(order[i][0], order[i][1], order[i][2]);
      this.normals.push(n[0], n[1], n[2]);
      this.uvs.push(uvs[i][0], uvs[i][1]);
      if (this.colors) this.colors.push(color[0], color[1], color[2]);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return true;
  }

  /** Single upward triangle fan vertex helper for flat patches (junctions). */
  fan(centre, ring, { up = [0, 1, 0], uv = (p) => [0, 0], centreUv = [0.5, 0.5] } = {}) {
    const base = this.base;
    const push = (p, st) => {
      this.positions.push(p[0], p[1], p[2]); this.normals.push(up[0], up[1], up[2]); this.uvs.push(st[0], st[1]);
      if (this.colors) this.colors.push(0.3, 0.3, 0.3);
    };
    push(centre, centreUv);
    for (const p of ring) push(p, uv(p));
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      const a = sub(ring[i], centre), b = sub(ring[j], centre);
      const normalY = a[2] * b[0] - a[0] * b[2]; // y component of (v_i-c) x (v_j-c)
      if (Math.abs(normalY) < 1e-6) continue;
      if (normalY > 0) this.indices.push(base, base + 1 + i, base + 1 + j);
      else this.indices.push(base, base + 1 + j, base + 1 + i);
    }
  }

  /**
   * Closed box with per-face vertices. Local x is across, z is along; yaw rotates z onto
   * (sin yaw, cos yaw). `grade` shears the box along z so top and bottom follow a slope
   * (y += z * grade), keeping planar faces planar. Face order starts with the top so the
   * first triangle of a box is always upward-facing.
   */
  box(cx, cy, cz, sx, sy, sz, yaw = 0, { grade = 0, color = null } = {}) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const corner = (dx, dy, dz) => {
      const lx = dx * sx / 2, lz = dz * sz / 2;
      return [cx + lx * c + lz * s, cy + dy * sy / 2 + lz * grade, cz - lx * s + lz * c];
    };
    const p = {};
    for (const dy of [-1, 1]) for (const dz of [-1, 1]) for (const dx of [-1, 1]) p[`${dx}${dy}${dz}`] = corner(dx, dy, dz);
    const centre = [cx, cy, cz];
    const face = (names, normalHint) => this.quad(p[names[0]], p[names[1]], p[names[2]], p[names[3]], { hint: normalHint, color });
    const hintOf = (names) => {
      const sum = [0, 0, 0];
      for (const name of names) { const q = p[name]; sum[0] += q[0] / 4; sum[1] += q[1] / 4; sum[2] += q[2] / 4; }
      return sub(sum, centre);
    };
    const faces = [
      ["-11-1", "111-1".replace("111-1", "11-1"), "111", "-111"],
      ["-1-1-1", "1-1-1", "1-11", "-1-11"],
      ["-1-1-1", "-11-1", "-111", "-1-11"],
      ["1-1-1", "11-1", "111", "1-11"],
      ["-1-1-1", "1-1-1", "11-1", "-11-1"],
      ["-1-11", "1-11", "111", "-111"]
    ];
    // Keys are `${dx}${dy}${dz}`; the top face (dy = +1) is listed first.
    const top = ["-11-1", "11-1", "111", "-111"];
    const bottom = ["-1-1-1", "1-1-1", "1-11", "-1-11"];
    const left = ["-1-1-1", "-11-1", "-111", "-1-11"];
    const right = ["1-1-1", "11-1", "111", "1-11"];
    const back = ["-1-1-1", "1-1-1", "11-1", "-11-1"];
    const front = ["-1-11", "1-11", "111", "-111"];
    void faces;
    for (const names of [top, bottom, left, right, back, front]) face(names, hintOf(names));
  }

  /**
   * Prism extruded along a polyline: a ribbon `width` wide (centred on the line) from
   * bottomY to topY relative to each vertex's own y. Emits top, both sides and (optionally)
   * the bottom, with per-vertex mitred offsets so adjacent segments meet without gaps.
   */
  ribbonPrism(points, width, bottomOffset, topOffset, { bottom = false, uvScale = 2, color = null, mitre = true } = {}) {
    if (points.length < 2) return 0;
    const half = width / 2, left = [], right = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
      let dx = next.x - prev.x, dz = next.z - prev.z;
      const length = Math.hypot(dx, dz);
      if (length < 1e-9) { left.push(null); right.push(null); continue; }
      dx /= length; dz /= length;
      let nx = -dz, nz = dx, scale = 1;
      if (mitre && i > 0 && i < points.length - 1) {
        const ax = points[i].x - prev.x, az = points[i].z - prev.z, bx = next.x - points[i].x, bz = next.z - points[i].z;
        const al = Math.hypot(ax, az), bl = Math.hypot(bx, bz);
        if (al > 1e-9 && bl > 1e-9) {
          const m = [-(az / al) - (bz / bl) * 0, 0]; void m;
          const n1 = [-az / al, ax / al], n2 = [-bz / bl, bx / bl];
          let mx = n1[0] + n2[0], mz = n1[1] + n2[1];
          const ml = Math.hypot(mx, mz);
          if (ml > 1e-9) { mx /= ml; mz /= ml; const d = Math.max(0.5, mx * n1[0] + mz * n1[1]); nx = mx; nz = mz; scale = 1 / d; }
        }
      }
      const o = half * Math.min(scale, 2);
      left.push([points[i].x + nx * o, points[i].y, points[i].z + nz * o]);
      right.push([points[i].x - nx * o, points[i].y, points[i].z - nz * o]);
    }
    let added = 0, along = 0;
    for (let i = 1; i < points.length; i++) {
      if (!left[i - 1] || !left[i]) continue;
      const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
      const u0 = along / uvScale, u1 = (along + seg) / uvScale;
      along += seg;
      const L0 = left[i - 1], L1 = left[i], R0 = right[i - 1], R1 = right[i];
      const lift = (p, dy) => [p[0], p[1] + dy, p[2]];
      const v = (a, b, c, d) => this.quad(a, b, c, d, { hint: null, color });
      void v;
      // top (outward = up)
      added += this.quad(lift(L0, topOffset), lift(R0, topOffset), lift(R1, topOffset), lift(L1, topOffset),
        { hint: [0, 1, 0], uv: [[0, u0], [1, u0], [1, u1], [0, u1]], color }) ? 1 : 0;
      // left wall (outward = away from right)
      const outL = [L0[0] - R0[0], 0, L0[2] - R0[2]];
      added += this.quad(lift(L0, bottomOffset), lift(L1, bottomOffset), lift(L1, topOffset), lift(L0, topOffset),
        { hint: outL, uv: [[0, u0], [0, u1], [1, u1], [1, u0]], color }) ? 1 : 0;
      const outR = [R0[0] - L0[0], 0, R0[2] - L0[2]];
      added += this.quad(lift(R0, bottomOffset), lift(R1, bottomOffset), lift(R1, topOffset), lift(R0, topOffset),
        { hint: outR, uv: [[0, u0], [0, u1], [1, u1], [1, u0]], color }) ? 1 : 0;
      if (bottom) added += this.quad(lift(L0, bottomOffset), lift(R0, bottomOffset), lift(R1, bottomOffset), lift(L1, bottomOffset),
        { hint: [0, -1, 0], color }) ? 1 : 0;
    }
    return added;
  }

  toGeometry(THREE, { name } = {}) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    if (this.colors) geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere?.();
    if (name) geometry.name = name;
    return geometry;
  }
}
