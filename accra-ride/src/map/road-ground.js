/**
 * Ground sampling, vehicle placement and barrier collision, built from the SAME
 * triangles and barrier segments the renderer draws. Visible road, drivable surface and
 * solid barrier therefore cannot disagree: if a wheel is over a drawn triangle it rests
 * on that triangle's height; if a barrier is drawn, a barrier collides.
 *
 * Before this module the game had no ground model at all: every vehicle was pinned to
 * y = 0 and nothing could collide with a median or guardrail.
 *
 * No Three.js dependency, so it runs identically in the game, in Node tests and in tools.
 */
import { GROUND_Y } from "./road-surface-contract.js";

/** Corolla GLB: SteerPivot/SpinPivot at x = ±0.73, z = ±1.3, tyre radius 0.3175. */
export const VEHICLE_LAYOUT = Object.freeze({
  trackM: 1.46, wheelbaseM: 2.6, bodyHalfWidthM: 0.855, bodyHalfLengthM: 2.29,
  collisionRadiusM: 0.9, collisionOffsetsM: Object.freeze([-1.4, 0, 1.4]), heightM: 1.47
});

const CELL_M = 24;
const key = (gx, gz) => gx * 73856093 ^ gz * 19349663;

function addToGrid(grid, minX, minZ, maxX, maxZ, value) {
  for (let gx = Math.floor(minX / CELL_M); gx <= Math.floor(maxX / CELL_M); gx++) {
    for (let gz = Math.floor(minZ / CELL_M); gz <= Math.floor(maxZ / CELL_M); gz++) {
      const k = key(gx, gz);
      const cell = grid.get(k);
      if (cell) cell.push(value); else grid.set(k, [value]);
    }
  }
}

/**
 * @param {{triangles:number[], thickness?:number[], colliders?:object[]}} data
 *   triangles: flat x,y,z ×3 per triangle (world space, asphalt top included)
 *   thickness: per triangle, how far the structure extends below its top (0 = on the ground)
 *   colliders: { ax,ay,az,bx,by,bz, halfWidthM, heightM, kind } — ay/by are the base heights
 */
export function createRoadGround(data) {
  const tris = data.triangles, count = tris.length / 9;
  const thickness = data.thickness || new Array(count).fill(0);
  const colliders = data.colliders || [];
  const triGrid = new Map(), colGrid = new Map();
  for (let t = 0; t < count; t++) {
    const o = t * 9;
    addToGrid(triGrid, Math.min(tris[o], tris[o + 3], tris[o + 6]), Math.min(tris[o + 2], tris[o + 5], tris[o + 8]),
      Math.max(tris[o], tris[o + 3], tris[o + 6]), Math.max(tris[o + 2], tris[o + 5], tris[o + 8]), t);
  }
  colliders.forEach((c, i) => addToGrid(colGrid,
    Math.min(c.ax, c.bx) - c.halfWidthM, Math.min(c.az, c.bz) - c.halfWidthM,
    Math.max(c.ax, c.bx) + c.halfWidthM, Math.max(c.az, c.bz) + c.halfWidthM, i));

  /** Every drawn surface under (x, z): [{ y, thicknessM }], unsorted. */
  function surfacesAt(x, z) {
    const out = [], cell = triGrid.get(key(Math.floor(x / CELL_M), Math.floor(z / CELL_M)));
    if (!cell) return out;
    for (const t of cell) {
      const o = t * 9;
      const x0 = tris[o], z0 = tris[o + 2], x1 = tris[o + 3], z1 = tris[o + 5], x2 = tris[o + 6], z2 = tris[o + 8];
      const det = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
      if (Math.abs(det) < 1e-12) continue;
      const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / det;
      const l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / det;
      const l2 = 1 - l0 - l1, e = -1e-6;
      if (l0 < e || l1 < e || l2 < e) continue;
      out.push({ y: l0 * tris[o + 1] + l1 * tris[o + 4] + l2 * tris[o + 7], thicknessM: thickness[t] });
    }
    return out;
  }

  /**
   * Height of the drivable surface at (x, z). With hintY (where the wheel already is) the
   * surface chosen is the highest one that is not more than stepUpM above it, so a car on a
   * flyover stays on the flyover and a car beneath it stays on the road beneath. Without a
   * hint the highest surface wins (what a camera sees from above).
   */
  function sample(x, z, { hintY = null, stepUpM = 0.65 } = {}) {
    const found = surfacesAt(x, z);
    let best = null;
    for (const s of found) {
      if (hintY !== null && s.y > hintY + stepUpM) continue;
      if (!best || s.y > best.y) best = s;
    }
    return best ? { y: best.y, onRoad: true, thicknessM: best.thicknessM } : { y: GROUND_Y, onRoad: false, thicknessM: 0 };
  }

  /** Underside height of the lowest structure above `y` at (x, z), or Infinity. */
  function overheadAt(x, z, y, minGapM = 1.2) {
    let lowest = Infinity;
    for (const s of surfacesAt(x, z)) {
      if (s.y <= y + minGapM) continue;
      lowest = Math.min(lowest, s.y - Math.max(0.05, s.thicknessM));
    }
    return lowest;
  }

  /**
   * Place a vehicle from its four wheel contact points. `forward` is the unit heading in x/z,
   * with the vehicle's right = (-fz, fx). `state` carries y, pitch, roll between frames so the
   * body settles instead of snapping: it rises with the road instantly (no tyre clipping) and
   * falls under gravity when the surface drops away.
   */
  function place(x, z, fx, fz, state, dt = 1 / 60) {
    const rx = -fz, rz = fx, hw = VEHICLE_LAYOUT.trackM / 2, hl = VEHICLE_LAYOUT.wheelbaseM / 2;
    const hint = Number.isFinite(state.y) ? state.y : null;
    const wheel = (along, across) => sample(x + fx * along + rx * across, z + fz * along + rz * across, { hintY: hint });
    const fl = wheel(hl, -hw), fr = wheel(hl, hw), rl = wheel(-hl, -hw), rr = wheel(-hl, hw);
    const front = (fl.y + fr.y) / 2, rear = (rl.y + rr.y) / 2, left = (fl.y + rl.y) / 2, right = (fr.y + rr.y) / 2;
    const target = (front + rear) / 2;
    const pitch = Math.atan2(front - rear, VEHICLE_LAYOUT.wheelbaseM), roll = Math.atan2(right - left, VEHICLE_LAYOUT.trackM);
    if (!Number.isFinite(state.pitch)) state.pitch = pitch;
    if (!Number.isFinite(state.roll)) state.roll = roll;
    if (!Number.isFinite(state.vy)) state.vy = 0;
    if (!Number.isFinite(state.y)) state.y = target;
    else {
      if (target >= state.y) { state.y = target; state.vy = 0; }
      else { state.vy = Math.min(30, (state.vy || 0) + 22 * dt); state.y = Math.max(target, state.y - state.vy * dt); }
      const k = 1 - Math.exp(-dt * 16);
      state.pitch += (pitch - state.pitch) * k; state.roll += (roll - state.roll) * k;
    }
    state.onRoad = fl.onRoad || fr.onRoad || rl.onRoad || rr.onRoad;
    return state;
  }

  /**
   * Push a vehicle out of any barrier it overlaps. The body is three circles along its
   * length. A barrier only counts when it overlaps the vehicle's own height band, so a
   * deck guardrail 5 m overhead does not stop a car passing underneath.
   * Returns null, or { pushX, pushZ, nx, nz, penetrationM, kind } with n pointing away from the barrier.
   */
  function collide(x, z, fx, fz, y, { radiusM = VEHICLE_LAYOUT.collisionRadiusM, offsetsM = VEHICLE_LAYOUT.collisionOffsetsM } = {}) {
    let worst = null;
    const top = y + VEHICLE_LAYOUT.heightM;
    for (const along of offsetsM) {
      const cx = x + fx * along, cz = z + fz * along;
      const cell = colGrid.get(key(Math.floor(cx / CELL_M), Math.floor(cz / CELL_M)));
      if (!cell) continue;
      for (const i of cell) {
        const c = colliders[i];
        const dx = c.bx - c.ax, dz = c.bz - c.az, len2 = dx * dx + dz * dz;
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((cx - c.ax) * dx + (cz - c.az) * dz) / len2)) : 0;
        const px = c.ax + dx * t, pz = c.az + dz * t, base = c.ay + (c.by - c.ay) * t;
        if (base > top - 0.1 || base + c.heightM < y + 0.12) continue; // not in the vehicle's height band
        const ox = cx - px, oz = cz - pz, d = Math.hypot(ox, oz), reach = radiusM + c.halfWidthM;
        if (d >= reach) continue;
        let nx, nz;
        if (d > 1e-6) { nx = ox / d; nz = oz / d; }
        else { const sx = -dz, sz = dx, sl = Math.hypot(sx, sz) || 1; nx = sx / sl; nz = sz / sl; }
        const penetrationM = reach - d;
        if (!worst || penetrationM > worst.penetrationM) worst = { nx, nz, penetrationM, kind: c.kind };
      }
    }
    return worst ? { ...worst, pushX: worst.nx * worst.penetrationM, pushZ: worst.nz * worst.penetrationM } : null;
  }

  return { sample, surfacesAt, overheadAt, place, collide, triangleCount: count, colliderCount: colliders.length };
}

/**
 * Apply a collision to a vehicle's speed and heading. `forward` is the unit heading.
 * Head-on impacts lose most speed; glancing contacts scrape. Returns the impact severity (0..1).
 */
export function barrierResponse(hit, fx, fz, speedMps) {
  const into = -(fx * hit.nx + fz * hit.nz); // 1 = straight into the barrier, 0 = parallel
  const severity = Math.max(0, Math.min(1, into));
  const factor = into > 0.35 ? 0.3 : 1 - 0.05 * (1 - into);
  return { speedMps: speedMps * factor, severity, scrape: into <= 0.35 };
}
