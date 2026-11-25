/**
 * Procedural pedestrian footbridge (AR-ROAD-01).
 *
 * OSM normally supplies only the bridge position (highway=footway + bridge=yes, or man_made=bridge)
 * and not its dimensions. Everything in this file is therefore a *procedural fallback*: every
 * dimension is reported in plan.measurements with provenance "configurable-default" or
 * "caller-override" and is never presented as an OSM measurement. Only the anchor (position) may
 * come from OSM, and only when an OSM element id is supplied.
 *
 * Local frame: u runs across the road (+u = left of travel), v runs along the road, y is up, and
 * u = 0 is the structure's reference line (normally the road/median centre).
 * Generation (buildFootbridgeBoxes) is separate from placement (appendFootbridge) so the geometry
 * can be validated without Three.js. appendFootbridge accepts any batch exposing
 * box(cx, cy, cz, sx, sy, sz, yaw, [r, g, b]) as used by road-feature-renderer.js.
 */
export const FOOTBRIDGE_DEFAULTS = Object.freeze({
  verticalClearanceM: 5.5,    // underside of structure above the carriageway (assumed design value)
  deckThicknessM: 0.45,       // slab plus girder depth
  deckWidthM: 2.2,
  railHeightM: 1.2,
  columnSizeM: 0.5,
  endClearanceM: 1.5,         // gap between carriageway edge and the end tower
  stairWidthM: 1.8,
  stairRiseMax: 0.175,
  stairRunM: 0.3,
  landingLengthM: 1.8,
  maxFlightRiseM: 3.2,
  medianColumnMinWidthM: 1.2,
  pointSymmetricStairs: true, // left stair descends along +v, right stair along -v
  palette: Object.freeze({
    steel: [0.28, 0.36, 0.45], deck: [0.55, 0.55, 0.53], tread: [0.62, 0.62, 0.6],
    rail: [0.2, 0.26, 0.32], mesh: [0.5, 0.54, 0.57], column: [0.4, 0.42, 0.44]
  })
});

const STRINGER_DEPTH_M = 0.35;
const finite = (value, name) => { if (!Number.isFinite(value)) throw new Error("Footbridge: " + name + " must be a finite number"); return value; };

/**
 * crossSection: { leftOuterM, rightOuterM, median?: { leftM, rightM } } — metres from the reference
 * line to the outer carriageway edges (both positive magnitudes); the median interval is expressed
 * in u (leftM > rightM) and must lie inside the road.
 */
export function planFootbridge({ crossSection, overrides = {} } = {}) {
  if (!crossSection) throw new Error("Footbridge: crossSection is required");
  const p = { ...FOOTBRIDGE_DEFAULTS, ...overrides };
  const left = finite(crossSection.leftOuterM, "leftOuterM"), right = finite(crossSection.rightOuterM, "rightOuterM");
  if (left <= 0 || right <= 0) throw new Error("Footbridge: carriageway extents must be positive");
  const median = crossSection.median || null;
  if (median && !(median.leftM > median.rightM && median.leftM <= left && median.rightM >= -right)) throw new Error("Footbridge: median must lie inside the carriageway extents");
  const medianWidthM = median ? median.leftM - median.rightM : 0;
  const walkingY = p.verticalClearanceM + p.deckThicknessM;
  const flights = Math.max(1, Math.ceil(walkingY / p.maxFlightRiseM));
  const stepsPerFlight = Math.ceil(walkingY / flights / p.stairRiseMax);
  const stairRiseM = walkingY / flights / stepsPerFlight;
  const towerOffset = p.endClearanceM + p.columnSizeM / 2;
  const plan = {
    kind: "footbridge", params: p, crossSection: { leftOuterM: left, rightOuterM: right, median },
    leftTowerU: left + towerOffset, rightTowerU: -(right + towerOffset),
    walkingY, flights, stepsPerFlight, stairRiseM, medianColumn: !!median && medianWidthM >= p.medianColumnMinWidthM,
    medianCentreU: median ? (median.leftM + median.rightM) / 2 : null
  };
  plan.spanM = plan.leftTowerU - plan.rightTowerU;
  const tag = key => (overrides[key] !== undefined ? "caller-override" : "configurable-default");
  plan.measurements = {
    verticalClearanceM: { value: p.verticalClearanceM, provenance: tag("verticalClearanceM") },
    deckWidthM: { value: p.deckWidthM, provenance: tag("deckWidthM") },
    railHeightM: { value: p.railHeightM, provenance: tag("railHeightM") },
    spanM: { value: plan.spanM, provenance: "derived-from-carriageway-extents" },
    stairRiseM: { value: stairRiseM, provenance: "derived-from-clearance-and-stair-limits" },
    stairRunM: { value: p.stairRunM, provenance: tag("stairRunM") }
  };
  return plan;
}

/** Pure local-frame geometry: [{ part, u, y, v, su, sy, sv, color }] (u,v centre; y centre; sizes along u, y, v). */
export function buildFootbridgeBoxes(plan) {
  const p = plan.params, c = p.palette, boxes = [];
  const add = (part, u, y, v, su, sy, sv, color) => boxes.push({ part, u, y, v, su, sy, sv, color });
  const H = plan.walkingY, t = p.deckThicknessM, uMin = plan.rightTowerU, uMax = plan.leftTowerU;
  const dw = p.deckWidthM, col = p.columnSizeM;
  // Deck slab and twin edge girders spanning the carriageways.
  add("deck", (uMin + uMax) / 2, H - t / 2 - 0.05, 0, uMax - uMin + col, t - 0.1, dw, c.deck);
  for (const s of [-1, 1]) add("girder", (uMin + uMax) / 2, H - t / 2, s * (dw / 2 - 0.08), uMax - uMin + col, t, 0.16, c.steel);
  // End towers: paired columns at both outer ends, plus an optional column in a wide median.
  for (const u of [uMin, uMax]) for (const s of [-1, 1]) add("column", u, (H - t) / 2, s * (dw / 2 - col / 2), col, H - t, col, c.column);
  if (plan.medianColumn) {
    const size = Math.min(col, plan.crossSection.median.leftM - plan.crossSection.median.rightM - 0.4);
    for (const s of [-1, 1]) add("median-column", plan.medianCentreU, (H - t) / 2, s * (dw / 2 - size / 2), size, H - t, size, c.column);
  }
  // Deck guard: top rail, mid rail, posts every <=1.5 m and wire-mesh infill on both edges.
  const length = uMax - uMin + col, posts = Math.ceil(length / 1.5);
  for (const s of [-1, 1]) {
    const v = s * (dw / 2 - 0.04);
    add("rail", (uMin + uMax) / 2, H + p.railHeightM, v, length, 0.06, 0.06, c.rail);
    add("rail", (uMin + uMax) / 2, H + p.railHeightM / 2, v, length, 0.04, 0.04, c.rail);
    add("mesh", (uMin + uMax) / 2, H + p.railHeightM * 0.45, v, length, p.railHeightM * 0.8, 0.02, c.mesh);
    for (let i = 0; i <= posts; i++) add("post", uMin - col / 2 + (length * i) / posts, H + p.railHeightM / 2, v, 0.06, p.railHeightM, 0.06, c.rail);
  }
  // Stairs and landings on both sides. Each flight descends away from the tower along v.
  for (const side of [-1, 1]) {
    const u = side > 0 ? uMax : uMin, dir = p.pointSymmetricStairs ? side : 1;
    let v0 = dir * (dw / 2);
    const landing = (top, label) => {
      const vc = v0 + dir * p.landingLengthM / 2;
      add(label, u, top - 0.075, vc, p.stairWidthM, 0.15, p.landingLengthM, c.tread);
      for (const s of [-1, 1]) add("stringer", u + s * (p.stairWidthM / 2 - 0.06), top - 0.15 - STRINGER_DEPTH_M / 2, vc, 0.12, STRINGER_DEPTH_M, p.landingLengthM, c.steel);
      for (const s of [-1, 1]) {
        add("rail", u + s * (p.stairWidthM / 2 - 0.03), top + p.railHeightM, vc, 0.05, 0.05, p.landingLengthM, c.rail);
        add("mesh", u + s * (p.stairWidthM / 2 - 0.03), top + p.railHeightM * 0.45, vc, 0.02, p.railHeightM * 0.8, p.landingLengthM, c.mesh);
      }
      v0 += dir * p.landingLengthM;
    };
    landing(H, "landing");
    for (let f = 0; f < plan.flights; f++) {
      const startTop = H - f * (H / plan.flights);
      for (let i = 0; i < plan.stepsPerFlight; i++) {
        const top = startTop - (i + 1) * plan.stairRiseM, vc = v0 + dir * (i + 0.5) * p.stairRunM;
        add("step", u, top - 0.04, vc, p.stairWidthM, 0.08, p.stairRunM, c.tread);
        for (const s of [-1, 1]) {
          // Thin hanging stringer plate under the tread, not a solid wall down to the ground.
          const depth = Math.max(Math.min(top, STRINGER_DEPTH_M), 0.05);
          add("stringer", u + s * (p.stairWidthM / 2 - 0.06), top - depth / 2, vc, 0.12, depth, p.stairRunM, c.steel);
          add("rail", u + s * (p.stairWidthM / 2 - 0.03), top + 0.95, vc, 0.05, 0.05, p.stairRunM, c.rail);
          if (i % 3 === 0) add("post", u + s * (p.stairWidthM / 2 - 0.03), top + 0.45, vc, 0.05, 0.9, 0.05, c.rail);
        }
      }
      v0 += dir * plan.stepsPerFlight * p.stairRunM;
      if (f < plan.flights - 1) {
        const midTop = H - (f + 1) * (H / plan.flights);
        landing(midTop, "mid-landing");
        // Intermediate landing is carried on two columns at its far end.
        const vEnd = v0 - dir * col / 2;
        for (const s of [-1, 1]) add("column", u + s * (p.stairWidthM / 2 - col / 2), (midTop - 0.15) / 2, vEnd, col, midTop - 0.15, col, c.column);
      }
    }
  }
  return boxes;
}

/** Place a footbridge in the world. pose = { x, z, heading: {x, z} } with heading along the road. */
export function appendFootbridge(batch, plan, pose) {
  const len = Math.hypot(pose.heading.x, pose.heading.z) || 1, dx = pose.heading.x / len, dz = pose.heading.z / len;
  const nx = -dz, nz = dx, yaw = Math.atan2(dx, dz), boxes = buildFootbridgeBoxes(plan);
  for (const b of boxes) batch.box(pose.x + nx * b.u + dx * b.v, b.y, pose.z + nz * b.u + dz * b.v, b.su, b.sy, b.sv, yaw, b.color);
  return boxes.length;
}

/** Spec records must not claim an OSM position without an OSM element id. */
export function validateFootbridgeSpec(spec) {
  const errors = [];
  if (!spec?.id || !spec?.name) errors.push("spec needs id and name");
  const a = spec?.anchor;
  if (!a) errors.push("anchor is required (use provenance \"unplaced\" until an OSM position exists)");
  else if (a.provenance === "osm-mapped" && (!a.osmElementId || !Number.isFinite(a.lat) || !Number.isFinite(a.lon))) errors.push("osm-mapped anchor needs osmElementId, lat and lon");
  else if (a.provenance === "unplaced" && (a.osmElementId || a.lat != null || a.lon != null)) errors.push("unplaced anchor must not carry coordinates");
  return errors;
}
