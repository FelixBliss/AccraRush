/**
 * Deterministic graph-following traffic agent.
 * No teleportation, illegal turn selection or inferred lane-change/overtake.
 */
import { sampleDirectedEdge } from "../navigation/route-service.js";

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const edgeMap = network => new Map((network.edges ?? []).map(edge => [edge.id, edge]));

export function createTrafficAgent(network, { id, edgeId, laneId, direction, distanceAlongEdgeM = 0, speedMps = 0 } = {}) {
  const edge = edgeMap(network).get(edgeId);
  const lane = edge?.lanes?.find(item => item.id === laneId);
  if (!edge || !lane || lane.direction !== direction || lane.status !== "allowed")
    throw new Error("traffic agent must start on an explicitly allowed directional lane");
  return { id: id ?? "traffic-agent", networkId: network.id, edgeId, laneId, direction,
    distanceAlongEdgeM: clamp(distanceAlongEdgeM, 0, edge.lengthM), speedMps: Math.max(0, speedMps),
    status: "driving", position: sampleDirectedEdge(edge, direction, distanceAlongEdgeM).position };
}

function legalNextSteps(network, agent) {
  const edge = edgeMap(network).get(agent.edgeId);
  const nodeId = agent.direction === "forward" ? edge.toNodeId : edge.fromNodeId;
  const junction = (network.junctions ?? []).find(item => item.nodeId === nodeId);
  const movements = (junction?.movements ?? []).filter(m =>
    m.fromEdgeId === agent.edgeId && m.fromDirection === agent.direction && m.status === "allowed");
  return movements.flatMap(m => {
    const next = edgeMap(network).get(m.toEdgeId);
    const lane = next?.lanes?.find(item => item.direction === m.toDirection && item.status === "allowed");
    return next && lane ? [{ edge: next, lane, movement: m }] : [];
  });
}

/**
 * Advance by dt seconds. A caller may provide chooseNext({agent, candidates}) at
 * a junction; the callback must return one candidate's edgeId/direction or the
 * agent stops safely. A same-corridor lead vehicle enforces a conservative gap.
 */
export function stepTrafficAgent(network, agent, dtSeconds, {
  accelerationMps2 = 2.2, brakingMps2 = 5.5, maxSpeedMps = 16.7,
  followingGapM = 8, leadVehicle = null, chooseNext = null
} = {}) {
  if (!Number.isFinite(dtSeconds) || dtSeconds < 0) throw new RangeError("dtSeconds must be non-negative");
  const edges = edgeMap(network), current = edges.get(agent.edgeId);
  if (!current) return { ...agent, status: "invalid_graph" };
  const lane = current.lanes?.find(item => item.id === agent.laneId);
  if (!lane || lane.direction !== agent.direction || lane.status !== "allowed")
    return { ...agent, status: "stopped_invalid_lane", speedMps: 0 };
  const speedLimit = Number.isFinite(current.speedLimitKph) ? current.speedLimitKph / 3.6 : maxSpeedMps;
  let targetSpeed = Math.min(maxSpeedMps, speedLimit);
  if (leadVehicle && leadVehicle.edgeId === agent.edgeId && leadVehicle.laneId === agent.laneId &&
      leadVehicle.direction === agent.direction) {
    const gap = leadVehicle.distanceAlongEdgeM - agent.distanceAlongEdgeM;
    if (gap >= 0 && gap < followingGapM + agent.speedMps * 1.2) targetSpeed = Math.min(targetSpeed, Math.max(0, (gap-followingGapM)/1.2));
  }
  const accelerating = targetSpeed > agent.speedMps;
  const speedMps = accelerating
    ? Math.min(targetSpeed, agent.speedMps + accelerationMps2 * dtSeconds)
    : Math.max(targetSpeed, agent.speedMps - brakingMps2 * dtSeconds);
  let distanceAlongEdgeM = agent.distanceAlongEdgeM + (agent.speedMps + speedMps) * 0.5 * dtSeconds;
  let nextState = { ...agent, speedMps, distanceAlongEdgeM, status: "driving" };
  if (distanceAlongEdgeM >= current.lengthM) {
    const candidates = legalNextSteps(network, agent);
    const selected = typeof chooseNext === "function" ? chooseNext({ agent, candidates }) : null;
    const next = candidates.find(item => item.edge.id === selected?.edgeId && item.movement.toDirection === selected?.direction);
    if (!next) {
      nextState.distanceAlongEdgeM = current.lengthM;
      nextState.speedMps = 0;
      nextState.status = candidates.length ? "waiting_for_legal_route_choice" : "stopped_at_dead_end";
    } else {
      const overflow = Math.min(2, distanceAlongEdgeM - current.lengthM);
      nextState = { ...agent, edgeId: next.edge.id, laneId: next.lane.id,
        direction: next.movement.toDirection, distanceAlongEdgeM: overflow,
        speedMps, status: "driving" };
    }
  }
  const activeEdge = edges.get(nextState.edgeId);
  if (activeEdge) nextState.position = sampleDirectedEdge(activeEdge, nextState.direction, nextState.distanceAlongEdgeM).position;
  return nextState;
}

/** Advance a fleet using the nearest same-lane lead vehicle from the prior tick. */
export function stepTrafficFleet(network, agents, dtSeconds, options = {}) {
  const snapshots = agents.map(agent => ({ ...agent }));
  return snapshots.map(agent => {
    const leadVehicle = snapshots
      .filter(other => other.id !== agent.id && other.edgeId === agent.edgeId &&
        other.laneId === agent.laneId && other.direction === agent.direction &&
        other.distanceAlongEdgeM > agent.distanceAlongEdgeM)
      .sort((a,b) => a.distanceAlongEdgeM - b.distanceAlongEdgeM)[0] ?? null;
    return stepTrafficAgent(network, agent, dtSeconds, { ...options, leadVehicle });
  });
}

/** Deterministic, spacing-aware spawn helper for explicitly allowed corridors. */
export function spawnTrafficAgents(network, { count = 0, seed = 1, minSpacingM = 24, initialSpeedMps = 0 } = {}) {
  const candidates = (network.edges ?? []).flatMap(edge =>
    (edge.lanes ?? []).filter(lane => lane.status === "allowed").map(lane => ({ edge, lane })))
    .filter(({ edge }) => edge.lengthM >= minSpacingM);
  if (!Number.isInteger(count) || count < 0 || !Number.isFinite(seed) || !candidates.length && count)
    throw new RangeError("valid count, seed and at least one verified spawn corridor are required");
  let state = (Math.trunc(seed) >>> 0) || 1;
  const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
  const agents = [];
  let attempts = 0;
  while (agents.length < count && attempts < count * Math.max(8, candidates.length * 4)) {
    attempts++;
    const { edge, lane } = candidates[Math.floor(random() * candidates.length)];
    const distanceAlongEdgeM = minSpacingM + random() * Math.max(0, edge.lengthM - minSpacingM * 2);
    const occupied = agents.some(agent => agent.edgeId === edge.id && agent.laneId === lane.id &&
      agent.direction === lane.direction && Math.abs(agent.distanceAlongEdgeM - distanceAlongEdgeM) < minSpacingM);
    if (occupied) continue;
    agents.push(createTrafficAgent(network, { id: "traffic-" + agents.length, edgeId: edge.id,
      laneId: lane.id, direction: lane.direction, distanceAlongEdgeM, speedMps: initialSpeedMps }));
  }
  return agents;
}
