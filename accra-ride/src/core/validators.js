import { COMPETITOR_STATES, MATCH_STATES, ROAD_DIRECTIONS, ROAD_LANE_DIRECTIONS } from "./constants.js";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isId = (value) => typeof value === "string" && value.trim().length > 0;
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const same = (a, b) => a === b;

function uniqueIds(items, label, errors) {
  const seen = new Set();
  for (const item of items) {
    if (!isId(item?.id)) errors.push(`${label} requires a non-empty stable id`);
    else if (seen.has(item.id)) errors.push(`${label} id "${item.id}" is duplicated`);
    else seen.add(item.id);
  }
  return seen;
}

export function validateRoadNetwork(network) {
  const errors = [];
  if (!isRecord(network)) return ["network must be an object"];
  if (!isId(network.id)) errors.push("network.id must be a non-empty stable id");
  if (!Number.isInteger(network.version) || network.version < 1) errors.push("network.version must be a positive integer");
  if (!Array.isArray(network.nodes) || !Array.isArray(network.edges)) return [...errors, "network.nodes and network.edges must be arrays"];

  const nodeIds = uniqueIds(network.nodes, "node", errors);
  uniqueIds(network.edges, "edge", errors);
  const laneIds = new Set();

  for (const node of network.nodes) {
    if (!isRecord(node)) {
      errors.push("network.nodes entries must be objects");
      continue;
    }
    if (!isRecord(node.position) || !["x", "y", "z"].every((axis) => isFiniteNumber(node.position[axis]))) {
      errors.push(`node "${node.id ?? "?"}" must have finite x, y and z coordinates`);
    }
  }

  for (const edge of network.edges) {
    if (!isRecord(edge)) {
      errors.push("network.edges entries must be objects");
      continue;
    }
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) errors.push(`edge "${edge.id ?? "?"}" references an unknown endpoint`);
    if (edge.fromNodeId === edge.toNodeId) errors.push(`edge "${edge.id ?? "?"}" cannot connect a node to itself`);
    if (!isFiniteNumber(edge.lengthM) || edge.lengthM <= 0) errors.push(`edge "${edge.id ?? "?"}" lengthM must be greater than zero`);
    if (!Array.isArray(edge.centerline) || edge.centerline.length < 2 || edge.centerline.some((p) => !isRecord(p) || !["x", "y", "z"].every((axis) => isFiniteNumber(p[axis])))) {
      errors.push(`edge "${edge.id ?? "?"}" needs at least two finite centreline points`);
    }
    if (!Array.isArray(edge.lanes) || edge.lanes.length === 0) {
      errors.push(`edge "${edge.id ?? "?"}" must define at least one lane`);
      continue;
    }
    for (const lane of edge.lanes) {
      if (!isRecord(lane)) {
        errors.push(`edge "${edge.id}" contains a lane that is not an object`);
        continue;
      }
      if (!isId(lane.id)) errors.push(`edge "${edge.id}" contains a lane without a stable id`);
      else if (laneIds.has(lane.id)) errors.push(`lane id "${lane.id}" is duplicated`);
      else laneIds.add(lane.id);
      if (!ROAD_LANE_DIRECTIONS.includes(lane.direction)) errors.push(`lane "${lane.id ?? "?"}" has an invalid direction`);
      if (!isFiniteNumber(lane.widthM) || lane.widthM <= 0) errors.push(`lane "${lane.id ?? "?"}" widthM must be greater than zero`);
    }
  }
  return errors;
}

export function validateRoute(route, network) {
  const errors = [];
  if (!isRecord(route)) return ["route must be an object"];
  if (!isId(route.id) || !isId(route.networkId)) errors.push("route.id and route.networkId are required");
  if (!isRecord(network) || !Array.isArray(network.nodes) || !Array.isArray(network.edges)) return [...errors, "a valid network is required"];

  // A route is only meaningful against a structurally valid graph.
  const networkErrors = validateRoadNetwork(network);
  for (const error of networkErrors) errors.push(`network: ${error}`);
  if (route.networkId !== network.id) errors.push("route.networkId does not match the supplied network");
  if (!isId(route.startNodeId) || !isId(route.destinationNodeId)) errors.push("route startNodeId and destinationNodeId are required");

  const nodeIds = new Set(network.nodes.map((node) => node?.id).filter(isId));
  if (isId(route.startNodeId) && !nodeIds.has(route.startNodeId)) errors.push("route.startNodeId does not exist in the supplied network");
  if (isId(route.destinationNodeId) && !nodeIds.has(route.destinationNodeId)) errors.push("route.destinationNodeId does not exist in the supplied network");
  if (!Array.isArray(route.steps) || route.steps.length === 0) return [...errors, "route.steps must contain at least one step"];

  const edges = new Map(network.edges.filter(isRecord).map((edge) => [edge.id, edge]));
  let expectedEntry = route.startNodeId;
  for (const [index, step] of route.steps.entries()) {
    const edge = edges.get(step?.edgeId);
    if (!edge) {
      errors.push(`route step ${index} references an unknown edge`);
      continue;
    }
    if (!ROAD_DIRECTIONS.includes(step.direction)) {
      errors.push(`route step ${index} has an invalid direction`);
      continue;
    }
    const entry = step.direction === "forward" ? edge.fromNodeId : edge.toNodeId;
    const exit = step.direction === "forward" ? edge.toNodeId : edge.fromNodeId;
    if (!same(entry, expectedEntry)) errors.push(`route step ${index} is disconnected from the previous step`);
    const lane = Array.isArray(edge.lanes) ? edge.lanes.find((candidate) => candidate?.id === step.laneId) : undefined;
    if (!lane) errors.push(`route step ${index} references a lane not on its edge`);
    else if (lane.direction !== step.direction) errors.push(`route step ${index} lane direction does not match travel direction`);
    expectedEntry = exit;
  }
  if (expectedEntry !== route.destinationNodeId) errors.push("route does not end at destinationNodeId");
  return errors;
}

export function validateVehicleState(vehicle) {
  const errors = [];
  if (!isRecord(vehicle)) return ["vehicle state must be an object"];
  for (const key of ["id", "vehicleType", "currentEdgeId", "currentLaneId"]) {
    if (!isId(vehicle[key])) errors.push(`vehicle.${key} must be a non-empty stable id`);
  }
  if (!isRecord(vehicle.position) || !["x", "y", "z"].every((axis) => isFiniteNumber(vehicle.position[axis]))) errors.push("vehicle.position must contain finite x, y and z");
  for (const key of ["headingRad", "speedMps", "accelerationMps2"]) if (!isFiniteNumber(vehicle[key])) errors.push(`vehicle.${key} must be finite`);
  if (isFiniteNumber(vehicle.speedMps) && vehicle.speedMps < 0) errors.push("vehicle.speedMps cannot be negative; direction belongs in gear/travelDirection");
  if (!isRecord(vehicle.dimensions) || !isFiniteNumber(vehicle.dimensions.lengthM) || vehicle.dimensions.lengthM <= 0 || !isFiniteNumber(vehicle.dimensions.widthM) || vehicle.dimensions.widthM <= 0) {
    errors.push("vehicle.dimensions must contain positive lengthM and widthM");
  }
  if (!["D", "R", "N"].includes(vehicle.gear)) errors.push("vehicle.gear must be D, R or N");
  return errors;
}

export function validateMatch(match) {
  const errors = [];
  if (!isRecord(match)) return ["match must be an object"];
  if (!isId(match.id)) errors.push("match.id is required");
  if (!MATCH_STATES.includes(match.status)) errors.push("match.status is invalid");
  if (!Array.isArray(match.competitors) || match.competitors.length < 2) return [...errors, "match requires at least two competitors"];

  const competitorIds = new Set();
  const passengerIds = new Set();
  const deliveredIds = [];
  const competitorById = new Map();
  let sharedPickup;
  let sharedDestination;
  for (const competitor of match.competitors) {
    if (!isRecord(competitor)) {
      errors.push("competitor entries must be objects");
      continue;
    }
    if (!isId(competitor.id) || competitorIds.has(competitor.id)) errors.push("competitor ids must be unique and non-empty");
    competitorIds.add(competitor.id);
    competitorById.set(competitor.id, competitor);
    if (!COMPETITOR_STATES.includes(competitor.status)) errors.push(`competitor "${competitor.id ?? "?"}" has an invalid status`);
    if (competitor.status === "delivered") deliveredIds.push(competitor.id);
    const passenger = competitor.passenger;
    if (!isRecord(passenger) || !isId(passenger.id) || !isId(passenger.pickupNodeId) || !isId(passenger.destinationNodeId)) {
      errors.push(`competitor "${competitor.id ?? "?"}" needs its own passenger id, pickup and destination`);
      continue;
    }
    if (passengerIds.has(passenger.id)) errors.push("each competitor must have a distinct passenger instance");
    passengerIds.add(passenger.id);
    if (sharedPickup === undefined) {
      sharedPickup = passenger.pickupNodeId;
      sharedDestination = passenger.destinationNodeId;
    } else if (passenger.pickupNodeId !== sharedPickup || passenger.destinationNodeId !== sharedDestination) {
      errors.push("competitors must receive the same pickup and destination");
    }
  }
  if (deliveredIds.length > 1) errors.push("a match can have only one delivered winner");
  if (match.winnerId != null && !competitorIds.has(match.winnerId)) errors.push("winnerId must reference a competitor in this match");
  if (match.winnerId != null && competitorById.get(match.winnerId)?.status !== "delivered") errors.push("winnerId must reference the delivered competitor");
  if (match.status === "completed") {
    if (!isId(match.winnerId)) errors.push("a completed match must have exactly one winnerId");
    if (deliveredIds.length !== 1 || deliveredIds[0] !== match.winnerId) errors.push("a completed match must have exactly one delivered winner matching winnerId");
  } else if (match.winnerId != null) {
    errors.push("winnerId can only be set when the match is completed");
  }
  return errors;
}
