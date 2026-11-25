/** Canonical simulation units and shared state values. */
export const WORLD_UNITS = Object.freeze({
  distance: "metres",
  speed: "metres-per-second",
  acceleration: "metres-per-second-squared",
  angle: "radians",
});

export const ROAD_DIRECTIONS = Object.freeze(["forward", "reverse", "both"]);
export const MATCH_STATES = Object.freeze(["waiting", "countdown", "racing", "completed", "cancelled"]);
export const COMPETITOR_STATES = Object.freeze(["toPickup", "passengerOnboard", "delivered", "disqualified"]);
export const GAME_EVENTS = Object.freeze([
  "match:started",
  "competitor:pickup",
  "competitor:delivered",
  "competitor:disqualified",
  "vehicle:collision",
  "vehicle:damageChanged",
  "ability:activated",
  "ability:hit",
]);
