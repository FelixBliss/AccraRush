/**
 * Graph-authoritative navigation.
 * Only explicitly allowed directional lanes and allowed junction movements
 * are traversable. Unknown OSM facts are never promoted to legal turns.
 */
import { polylineLengthM, samplePolylineAtDistance } from "../../core/road-network.js";

const validDirection = d => d === "forward" || d === "reverse";
const edgeEntry = (edge, direction) => direction === "forward" ? edge.fromNodeId : edge.toNodeId;
const edgeExit = (edge, direction) => direction === "forward" ? edge.toNodeId : edge.fromNodeId;
const movementAllowed = (network, from, to, nodeId) =>
  (network.junctions ?? []).find(j => j.nodeId === nodeId)?.movements?.some(m =>
    m.fromEdgeId === from.edgeId && m.fromDirection === from.direction &&
    m.toEdgeId === to.edgeId && m.toDirection === to.direction && m.status === "allowed"
  ) === true;

function directedArcs(network) {
  const arcs = [];
  for (const edge of network.edges ?? []) {
    for (const lane of edge.lanes ?? []) {
      if (lane.status !== "allowed" || !validDirection(lane.direction)) continue;
      arcs.push({ edgeId: edge.id, laneId: lane.id, direction: lane.direction,
        fromNodeId: edgeEntry(edge, lane.direction), toNodeId: edgeExit(edge, lane.direction),
        costM: edge.lengthM, speedLimitKph: edge.speedLimitKph ?? null });
    }
  }
  return arcs;
}

/** Dijkstra over directed lane corridors; unknown/prohibited turns are excluded. */
export function findRoute(network, { startNodeId, destinationNodeId, routeId = "generated-route" } = {}) {
  if (!network || !Array.isArray(network.nodes) || !Array.isArray(network.edges) ||
      !startNodeId || !destinationNodeId) return { ok: false, reason: "invalid_request", route: null };
  const nodeIds = new Set(network.nodes.map(n => n.id));
  if (!nodeIds.has(startNodeId) || !nodeIds.has(destinationNodeId))
    return { ok: false, reason: "unknown_endpoint", route: null };
  if (startNodeId === destinationNodeId)
    return { ok: true, route: { id: routeId, networkId: network.id, startNodeId, destinationNodeId, steps: [], distanceM: 0 } };

  const arcs = directedArcs(network), byStart = new Map();
  for (const arc of arcs) {
    if (!byStart.has(arc.fromNodeId)) byStart.set(arc.fromNodeId, []);
    byStart.get(arc.fromNodeId).push(arc);
  }
  const key = a => [a.edgeId, a.direction, a.laneId].join("|");
  const distance = new Map(), previous = new Map(), unvisited = new Set();
  // State is a directed lane corridor; a transition is legal only at its junction.
  for (const arc of arcs) { distance.set(key(arc), Infinity); unvisited.add(key(arc)); }
  const starts = arcs.filter(a => a.fromNodeId === startNodeId);
  for (const arc of starts) distance.set(key(arc), arc.costM);
  let winner = null, winnerDistance = Infinity;
  while (unvisited.size) {
    let currentKey = null, currentDistance = Infinity;
    for (const k of unvisited) {
      const d = distance.get(k);
      if (d < currentDistance) { currentDistance = d; currentKey = k; }
    }
    if (currentKey === null || !Number.isFinite(currentDistance)) break;
    unvisited.delete(currentKey);
    const current = arcs.find(a => key(a) === currentKey);
    if (!current) continue;
    if (current.toNodeId === destinationNodeId) { winner = currentKey; winnerDistance = currentDistance; break; }
    for (const next of byStart.get(current.toNodeId) ?? []) {
      if (!movementAllowed(network, current, next, current.toNodeId)) continue;
      const nextKey = key(next);
      if (!unvisited.has(nextKey)) continue;
      const candidate = currentDistance + next.costM;
      if (candidate < distance.get(nextKey)) {
        distance.set(nextKey, candidate);
        previous.set(nextKey, currentKey);
      }
    }
  }
  if (!winner) return { ok: false, reason: "no_verified_route", route: null };
  const chain = [];
  for (let k = winner; k; k = previous.get(k)) chain.push(arcs.find(a => key(a) === k));
  chain.reverse();
  const route = { id: routeId, networkId: network.id, startNodeId, destinationNodeId,
    steps: chain.map(({ edgeId, laneId, direction }) => ({ edgeId, laneId, direction })),
    distanceM: winnerDistance };
  return { ok: true, route };
}

export function getRouteGuidance(network, route, stepIndex, distanceAlongEdgeM = 0) {
  const step = route?.steps?.[stepIndex];
  if (!step) return { status: "arrived", remainingDistanceM: 0, nextRoadName: null, nextMovement: null };
  const edgeIndex = new Map((network.edges ?? []).map(e => [e.id, e]));
  const edge = edgeIndex.get(step.edgeId);
  if (!edge) return { status: "invalid_route", remainingDistanceM: null };
  const remainingOnEdge = Math.max(0, edge.lengthM - Math.max(0, distanceAlongEdgeM));
  const later = route.steps.slice(stepIndex + 1);
  const remainingAfter = later.reduce((sum, item) => sum + (edgeIndex.get(item.edgeId)?.lengthM ?? 0), 0);
  const next = later[0] ? edgeIndex.get(later[0].edgeId) : null;
  const junctionNodeId = step.direction === "forward" ? edge.toNodeId : edge.fromNodeId;
  const movement = next ? (network.junctions ?? []).find(j => j.nodeId === junctionNodeId)?.movements?.find(m =>
    m.fromEdgeId === step.edgeId && m.fromDirection === step.direction &&
    m.toEdgeId === later[0].edgeId && m.toDirection === later[0].direction
  ) ?? null : null;
  return { status: "navigating", currentRoadName: edge.name ?? null, nextRoadName: next?.name ?? null,
    remainingDistanceM: remainingOnEdge + remainingAfter, distanceToNextMovementM: next ? remainingOnEdge : null,
    nextMovement: movement ? movement.status : null, destinationNodeId: route.destinationNodeId };
}

/** Return a world-space point and tangent on an edge in its legal travel direction. */
export function sampleDirectedEdge(edge, direction, distanceAlongEdgeM) {
  if (!edge || !validDirection(direction)) throw new TypeError("edge and direction are required");
  const points = direction === "forward" ? edge.centerline : [...edge.centerline].reverse();
  const position = samplePolylineAtDistance(points, distanceAlongEdgeM);
  const total = polylineLengthM(points), d = Math.max(0, Math.min(total, distanceAlongEdgeM));
  const a = samplePolylineAtDistance(points, Math.max(0, d - 0.5));
  const b = samplePolylineAtDistance(points, Math.min(total, d + 0.5));
  const length = Math.hypot(b.x-a.x, b.y-a.y, b.z-a.z) || 1;
  return { position, tangent: { x: (b.x-a.x)/length, y: (b.y-a.y)/length, z: (b.z-a.z)/length } };
}

/** Match a player lane-position result to route progress without guessing. */
export function updateRouteProgress(network, route, playerMatch, previousStepIndex = 0) {
  if (!route?.steps?.length || !playerMatch?.matched)
    return { onRoute: false, stepIndex: previousStepIndex, reason: "no_verified_player_match", guidance: null };
  const start = Math.max(0, Math.min(route.steps.length - 1, previousStepIndex));
  let stepIndex = -1;
  for (let i = start; i < route.steps.length; i++) {
    const step = route.steps[i];
    if (step.edgeId === playerMatch.edgeId && step.laneId === playerMatch.laneId &&
        step.direction === playerMatch.direction) { stepIndex = i; break; }
  }
  if (stepIndex < 0) {
    for (let i = 0; i < start; i++) {
      const step = route.steps[i];
      if (step.edgeId === playerMatch.edgeId && step.laneId === playerMatch.laneId &&
          step.direction === playerMatch.direction) { stepIndex = i; break; }
    }
  }
  if (stepIndex < 0)
    return { onRoute: false, stepIndex: previousStepIndex, reason: "player_not_on_route", guidance: null };
  return { onRoute: true, stepIndex, distanceAlongEdgeM: playerMatch.distanceAlongEdgeM,
    guidance: getRouteGuidance(network, route, stepIndex, playerMatch.distanceAlongEdgeM) };
}
