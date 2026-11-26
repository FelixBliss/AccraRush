/**
 * The single vertical and depth-layering contract for road rendering, ground sampling
 * and vehicle placement. Before this file existed the same numbers were scattered and
 * disagreed: the renderer put asphalt 3.5 cm above each centreline, junction fans 5 mm
 * below that, markings 3 cm above it, while the game placed every vehicle at y = 0.
 * Tyres were buried in asphalt and coplanar layers fought for the depth buffer.
 *
 * Units are metres. Heights are measured from the (possibly derived) centreline y.
 */

/** Top of the asphalt above the centreline height. Vehicle wheels rest exactly here. */
export const ROAD_SURFACE_Y = 0.035;

/** Terrain / verge level. The road is a slab standing this far above the verge. */
export const GROUND_Y = -0.28;

/** Paint sits this far above the asphalt; depth bias (below) keeps it from fighting. */
export const MARKING_LIFT_Y = 0.008;

export const MEDIAN_HEIGHT_M = 0.28;
export const PARAPET_HEIGHT_M = 1.0;
export const PARAPET_CAP_HEIGHT_M = 0.12;
export const GUARDRAIL_HEIGHT_M = 1.0;

/** Slab depth under a grade-separated structure's surface. Crossing clearance is measured to the surface. */
export const DECK_THICKNESS_M = 0.9;
/** The slab extends this far beyond the carriageway edge, forming the kerb ledge the guardrail stands on. */
export const DECK_OVERHANG_M = 0.5;
/** Sloped shoulder from an at-grade road edge down to the terrain. */
export const VERGE_WIDTH_M = 1.2;
/** Guardrail centreline sits this far inside the carriageway edge; a car at lane offset clears it. */
export const GUARDRAIL_INSET_M = 0.3;
export const GUARDRAIL_COLLIDER_HALF_WIDTH_M = 0.1;
export const GUARDRAIL_POST_SPACING_M = 4;
/** Piers are placed under a structure every this many metres where no road passes beneath. */
export const PIER_SPACING_M = 30;

/**
 * Corolla GLB: the wheel pivots sit at y = 0.3175 and the tyre radius is 0.3175, so the
 * tyre bottoms touch model y = 0. A vehicle origin at the asphalt top is exactly on the road.
 */
export const VEHICLE_WHEEL_CONTACT_Y = 0;

export const ROAD_CLASS_RANK = Object.freeze({
  residential: 1, unclassified: 1, living_street: 1, service: 1,
  tertiary: 2, tertiary_link: 2,
  secondary: 3, secondary_link: 3,
  primary: 4, primary_link: 4,
  trunk: 5, trunk_link: 5,
  motorway: 6, motorway_link: 6
});
export const roadClassRank = highway => ROAD_CLASS_RANK[highway] ?? 1;

/**
 * Coplanar layers are separated by GPU depth bias, not by lifting geometry. polygonOffset
 * is applied before the depth test, so it is exact at every distance and on every slope,
 * unlike a fixed millimetre lift that disappears into depth-buffer precision beyond ~100 m.
 * Negative values pull towards the camera. Order, back to front:
 *   junction fan (+) < road classes by rank < paint decals.
 * Where roads of different class overlap, the higher class deterministically wins.
 */
export const DEPTH_BIAS = Object.freeze({
  junction: Object.freeze({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }),
  road: rank => Object.freeze({ polygonOffset: true, polygonOffsetFactor: -rank, polygonOffsetUnits: -2 * rank }),
  marking: Object.freeze({ polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -16 })
});

/** Draw order: ground, then asphalt, then structures, then paint decals last. */
export const RENDER_ORDER = Object.freeze({ road: 1, structure: 2, marking: 3, feature: 4 });
