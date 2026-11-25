/**
 * Procedural bus shelter used in place of the old flat-roof bus-stop model (AR-ROAD-01).
 *
 * The OSM bus stop node supplies only the position. Structure, dimensions and style are a procedural
 * fallback (BUS_SHELTER_DEFAULTS) and are not OSM measurements. The shelter is built behind the
 * reference point, away from the road, so nothing but the roof overhang reaches towards the carriageway.
 *
 * Local frame: lr = metres from the reference point toward the road (negative = away from it),
 * lv = metres along the direction of travel. Accepts any batch exposing
 * box(cx, cy, cz, sx, sy, sz, yaw, [r, g, b]).
 */
export const BUS_SHELTER_DEFAULTS = Object.freeze({
  lengthM: 3.6, depthM: 1.6, roofHeightM: 2.6, roofThicknessM: 0.12, roofOverhangM: 0.25,
  platformHeightM: 0.15, benchLengthM: 2.2, provenance: "procedural-fallback",
  palette: Object.freeze({
    platform: [0.62, 0.62, 0.6], post: [0.2, 0.24, 0.28], roof: [0.82, 0.84, 0.86], fascia: [0.95, 0.72, 0.15],
    glass: [0.42, 0.58, 0.66], bench: [0.45, 0.3, 0.18], board: [0.12, 0.3, 0.55], sign: [0.1, 0.35, 0.75], pole: [0.32, 0.34, 0.36], bin: [0.15, 0.4, 0.25]
  })
});

/** Pure local-frame boxes: [{ part, lr, y, lv, sr, sy, sv, color }]. */
export function buildBusShelterBoxes(overrides = {}) {
  const p = { ...BUS_SHELTER_DEFAULTS, ...overrides }, c = p.palette, L = p.lengthM, D = p.depthM, boxes = [];
  const add = (part, lr, y, lv, sr, sy, sv, color) => boxes.push({ part, lr, y, lv, sr, sy, sv, color });
  // Raised boarding platform.
  add("platform", -D / 2, p.platformHeightM / 2, 0, D + 0.2, p.platformHeightM, L + 0.4, c.platform);
  // Four steel posts carrying the roof.
  for (const lr of [-0.1, -D + 0.05]) for (const s of [-1, 1]) add("post", lr, p.roofHeightM / 2, s * (L / 2 - 0.06), 0.08, p.roofHeightM, 0.08, c.post);
  // Roof slab with a forward overhang and a coloured fascia.
  add("roof", -D / 2 + p.roofOverhangM / 2, p.roofHeightM + p.roofThicknessM / 2, 0, D + p.roofOverhangM, p.roofThicknessM, L + 0.2, c.roof);
  add("fascia", p.roofOverhangM - 0.03, p.roofHeightM + p.roofThicknessM / 2, 0, 0.06, p.roofThicknessM + 0.1, L + 0.22, c.fascia);
  // Glazed back panel and one glazed end windbreak.
  add("glass", -D + 0.05, p.platformHeightM + 0.9 + 0.2, 0, 0.04, 1.8, L - 0.2, c.glass);
  add("glass", -D / 2, p.platformHeightM + 1.1, -(L / 2 - 0.06), D - 0.2, 1.8, 0.04, c.glass);
  // Slatted bench with backrest.
  add("bench", -D + 0.5, 0.5, 0.2, 0.4, 0.06, p.benchLengthM, c.bench);
  add("bench", -D + 0.3, 0.82, 0.2, 0.05, 0.4, p.benchLengthM, c.bench);
  for (const s of [-1, 1]) add("bench-leg", -D + 0.5, 0.3, 0.2 + s * (p.benchLengthM / 2 - 0.1), 0.35, 0.3, 0.05, c.post);
  // Route information board behind the shelter, litter bin, and the stop sign on its own pole.
  add("board", -D - 0.08, 1.4, L / 2 - 0.8, 0.1, 1.5, 1.0, c.board);
  add("bin", -D + 0.3, 0.35, L / 2 - 0.35, 0.35, 0.6, 0.35, c.bin);
  add("pole", -0.2, 1.3, -(L / 2 + 0.9), 0.07, 2.6, 0.07, c.pole);
  add("sign", -0.2, 2.35, -(L / 2 + 0.9), 0.5, 0.5, 0.05, c.sign);
  return boxes;
}

/**
 * Place a shelter. (x, z) is the roadside reference point, heading is the direction of travel and
 * side is the same +1/-1 convention as road-feature-renderer.js (+1 = left of travel).
 */
export function appendBusShelter(batch, { x, z, heading, side = -1, overrides = {} }) {
  const len = Math.hypot(heading.x, heading.z) || 1, dx = heading.x / len, dz = heading.z / len;
  // The road lies on the opposite side of the shelter to the left normal times side.
  const rx = dz * side, rz = -dx * side, yaw = Math.atan2(dx, dz), boxes = buildBusShelterBoxes(overrides);
  for (const b of boxes) batch.box(x + rx * b.lr + dx * b.lv, b.y, z + rz * b.lr + dz * b.lv, b.sr, b.sy, b.sv, yaw, b.color);
  return boxes.length;
}
