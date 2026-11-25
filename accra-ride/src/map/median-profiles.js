/**
 * Reusable median construction (AR-ROAD-01).
 *
 * Profiles: raised tiled-block pedestrian median, kerbed median with metallic mesh fencing, solid
 * concrete barrier and open (flush, painted) median, plus tapered transitions. Profiles are assigned
 * per chainage range from configuration so one design is never applied along the whole route.
 * A median with no configured range resolves to "open" (nothing physical is drawn) and is reported
 * as unassigned, never as a mapped or surveyed median. Accepts any batch exposing
 * box(cx, cy, cz, sx, sy, sz, yaw, [r, g, b]).
 */
export const MEDIAN_PROFILES = Object.freeze({
  "tiled-block": Object.freeze({ id: "tiled-block", label: "Raised tiled-block pedestrian median", kerbWidthM: 0.2, heightM: 0.18, tileLengthM: 0.8 }),
  "mesh-fence": Object.freeze({ id: "mesh-fence", label: "Kerbed median with metallic mesh fence", kerbWidthM: 0.2, heightM: 0.18, fenceHeightM: 1.5, postSpacingM: 2.5 }),
  "concrete-barrier": Object.freeze({ id: "concrete-barrier", label: "Solid concrete barrier", baseWidthM: 0.6, heightM: 1.0 }),
  open: Object.freeze({ id: "open", label: "Open flush median", heightM: 0.02 })
});

const COLORS = {
  kerb: [0.7, 0.7, 0.68], tileA: [0.66, 0.5, 0.42], tileB: [0.55, 0.55, 0.53], fill: [0.5, 0.5, 0.47],
  fence: [0.55, 0.6, 0.64], post: [0.3, 0.33, 0.36], concrete: [0.68, 0.68, 0.66], paint: [0.78, 0.7, 0.2]
};
export const MIN_NOSE_WIDTH_M = 0.25;

export function resolveMedianProfile(config, chainageM) {
  for (const range of config?.ranges || []) {
    if (chainageM >= range.fromM && chainageM < range.toM) {
      if (!MEDIAN_PROFILES[range.profile]) throw new Error("Unknown median profile " + range.profile);
      return { profileId: range.profile, provenance: range.provenance || "configured-range" };
    }
  }
  if (config?.default) {
    if (!MEDIAN_PROFILES[config.default]) throw new Error("Unknown median profile " + config.default);
    return { profileId: config.default, provenance: "configured-default" };
  }
  return { profileId: "open", provenance: "unassigned" };
}

/** Straight median segment a -> b with the given full width, centred on the segment. Returns the number of boxes added. */
export function appendMedianSegment(batch, { a, b, widthM, profileId }) {
  const profile = MEDIAN_PROFILES[profileId];
  if (!profile) throw new Error("Unknown median profile " + profileId);
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 0.05 || !(widthM > 0)) return 0;
  const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len, rx = dz, rz = -dx, yaw = Math.atan2(dx, dz);
  let count = 0;
  const put = (t, off, y, sx, sy, sz, color) => { batch.box(a.x + dx * t + rx * off, y, a.z + dz * t + rz * off, sx, sy, sz, yaw, color); count++; };
  const kerbed = () => {
    const k = Math.min(profile.kerbWidthM, widthM / 2);
    for (const s of [-1, 1]) put(len / 2, s * (widthM / 2 - k / 2), profile.heightM / 2, k, profile.heightM, len, COLORS.kerb);
    return k;
  };
  if (profileId === "tiled-block") {
    const k = kerbed(), inner = widthM - 2 * k, top = profile.heightM - 0.03;
    if (inner > 0.05) {
      put(len / 2, 0, top / 2, inner, top, len, COLORS.tileB);
      for (let t = 0; t < len; t += profile.tileLengthM * 2) {
        const seg = Math.min(profile.tileLengthM, len - t);
        put(t + seg / 2, 0, top + 0.004, inner, 0.008, seg, COLORS.tileA);
      }
    }
  } else if (profileId === "mesh-fence") {
    const k = kerbed(), inner = widthM - 2 * k, top = profile.heightM - 0.03;
    if (inner > 0.05) put(len / 2, 0, top / 2, inner, top, len, COLORS.fill);
    put(len / 2, 0, profile.heightM + profile.fenceHeightM / 2 - 0.1, 0.03, profile.fenceHeightM - 0.2, len, COLORS.fence);
    put(len / 2, 0, profile.heightM + profile.fenceHeightM - 0.1, 0.06, 0.06, len, COLORS.post);
    for (let t = 0; t <= len + 1e-6; t += profile.postSpacingM) put(Math.min(t, len), 0, profile.heightM + profile.fenceHeightM / 2 - 0.1, 0.08, profile.fenceHeightM - 0.1, 0.08, COLORS.post);
  } else if (profileId === "concrete-barrier") {
    const w = Math.min(profile.baseWidthM, widthM);
    put(len / 2, 0, 0.125, w, 0.25, len, COLORS.concrete);
    put(len / 2, 0, 0.425, w * 0.7, 0.35, len, COLORS.concrete);
    put(len / 2, 0, 0.8, w * 0.45, 0.4, len, COLORS.concrete);
  } else {
    put(len / 2, 0, profile.heightM / 2, widthM, profile.heightM, len, COLORS.paint);
  }
  return count;
}

/**
 * Taper a median to a nose over lengthM, starting at `at` and travelling along `heading` (unit vector).
 * The piece widths narrow step by step to MIN_NOSE_WIDTH_M. The open profile needs no taper.
 */
export function appendMedianTransition(batch, { at, heading, widthM, profileId, lengthM = 6, steps = 4 }) {
  if (profileId === "open") return 0;
  const len = Math.hypot(heading.x, heading.z) || 1, dx = heading.x / len, dz = heading.z / len, piece = lengthM / steps;
  let count = 0;
  for (let i = 0; i < steps; i++) {
    const w = widthM - (widthM - MIN_NOSE_WIDTH_M) * ((i + 0.5) / steps);
    const a = { x: at.x + dx * piece * i, z: at.z + dz * piece * i }, b = { x: at.x + dx * piece * (i + 1), z: at.z + dz * piece * (i + 1) };
    // The fence stops after the first half of the taper so its panel never overhangs the nose.
    count += appendMedianSegment(batch, { a, b, widthM: w, profileId: profileId === "mesh-fence" && i >= steps / 2 ? "tiled-block" : profileId });
  }
  return count;
}
