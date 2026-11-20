/** Directed road graph helpers shared by player route guidance and AI traffic. */
class MinHeap {
  constructor() { this.items = []; }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].cost <= item.cost) break;
      a[i] = a[p]; i = p;
    }
    a[i] = item;
  }
  pop() {
    const a = this.items;
    if (!a.length) return null;
    const root = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        let c = i * 2 + 1;
        if (c >= a.length) break;
        if (c + 1 < a.length && a[c + 1].cost < a[c].cost) c++;
        if (a[c].cost >= last.cost) break;
        a[i] = a[c]; i = c;
      }
      a[i] = last;
    }
    return root;
  }
  get size() { return this.items.length; }
}

export function buildNavigationIndex(network) {
  if (!Array.isArray(network?.nodes) || !Array.isArray(network?.edges)) {
    throw new Error("A road network with nodes and edges is required");
  }
  const nodes = new Map(network.nodes.map(node => [node.id, node]));
  const outgoing = new Map(network.nodes.map(node => [node.id, []]));
  for (const edge of network.edges) {
    for (const lane of edge.lanes ?? []) {
      const from = lane.direction === "forward" ? edge.fromNodeId : edge.toNodeId;
      const to = lane.direction === "forward" ? edge.toNodeId : edge.fromNodeId;
      if (nodes.has(from) && nodes.has(to)) outgoing.get(from).push({ edge, lane, from, to, cost: edge.lengthM });
    }
  }
  return { networkId: network.id, nodes, outgoing };
}

export function findRoadRoute(index, startNodeId, destinationNodeId) {
  if (!index?.nodes?.has(startNodeId) || !index.nodes.has(destinationNodeId)) return null;
  const distances = new Map([[startNodeId, 0]]), previous = new Map(), heap = new MinHeap(), settled = new Set();
  heap.push({ id: startNodeId, cost: 0 });
  while (heap.size) {
    const current = heap.pop();
    if (settled.has(current.id)) continue;
    settled.add(current.id);
    if (current.id === destinationNodeId) break;
    for (const arc of index.outgoing.get(current.id) ?? []) {
      if (settled.has(arc.to)) continue;
      const alt = current.cost + arc.cost;
      if (alt < (distances.get(arc.to) ?? Infinity)) {
        distances.set(arc.to, alt);
        previous.set(arc.to, { from: current.id, arc });
        heap.push({ id: arc.to, cost: alt });
      }
    }
  }
  if (!distances.has(destinationNodeId)) return null;
  const steps = [];
  let cursor = destinationNodeId;
  while (cursor !== startNodeId) {
    const item = previous.get(cursor);
    if (!item) return null;
    steps.push({ edgeId: item.arc.edge.id, laneId: item.arc.lane.id, direction: item.arc.lane.direction });
    cursor = item.from;
  }
  steps.reverse();
  return { id: "route-" + startNodeId + "-" + destinationNodeId, networkId: index.networkId,
    startNodeId, destinationNodeId, distanceM: distances.get(destinationNodeId), steps };
}

function geometryForDirection(edge, direction) {
  const points = direction === "forward" ? edge.centerline : [...edge.centerline].reverse();
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    cumulative.push(cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  return { points, cumulative, lengthM: cumulative[cumulative.length - 1] || 0 };
}

/**
 * Creates a real, directed route by walking the imported graph. This is used for
 * free-drive sessions and AI traffic; it never invents roads or ignores one-way lanes.
 */
export function createRandomDirectedRoute(index, options = {}) {
  if (!index?.outgoing || !index.nodes?.size) throw new Error("A built navigation index is required");
  const random = typeof options.random === "function" ? options.random : Math.random;
  const requestedSteps = Math.max(2, Math.min(500, Math.floor(options.stepCount ?? 80)));
  const minimumSteps = Math.max(2, Math.ceil(requestedSteps * 0.7));

  const collectNearbyStarts = startNodeId => {
    if (!startNodeId || !index.nodes.has(startNodeId)) return [];
    const visited = new Set([startNodeId]), queue = [{ id: startNodeId, depth: 0 }], found = [];
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i], arcs = index.outgoing.get(item.id) ?? [];
      if (arcs.length) found.push([item.id, arcs]);
      if (item.depth >= 3) continue;
      for (const arc of arcs) if (!visited.has(arc.to)) {
        visited.add(arc.to);
        queue.push({ id: arc.to, depth: item.depth + 1 });
      }
    }
    return found;
  };

  let starts = options.startNodeId ? collectNearbyStarts(options.startNodeId) : [];
  if (!starts.length) starts = [...index.outgoing.entries()].filter(([, arcs]) => arcs.length > 0);
  if (!starts.length) throw new Error("The road network has no directed traversable lanes");
  // Begin on a junction or a through-road node, never on a one-edge spur.
  starts = starts.filter(([, arcs]) => arcs.length >= 2 || arcs.some(arc =>
    (index.outgoing.get(arc.to) ?? []).some(next => next.edge.id !== arc.edge.id)
  ));
  if (!starts.length) throw new Error("The road network has no suitable through-road starting point");
  starts.sort((a, b) => b[1].length - a[1].length);
  const preferredCount = Math.max(1, Math.ceil(starts.length * 0.35));
  const preferredStarts = starts.slice(0, preferredCount);
  let best = null;

  for (let attempt = 0; attempt < 80; attempt++) {
    const preferred = attempt === 0 && options.startNodeId
      ? starts.find(([id]) => id === options.startNodeId)
      : preferredStarts[Math.floor(random() * preferredStarts.length)];
    let current = preferred?.[0] ?? starts[Math.floor(random() * starts.length)][0];
    const startNodeId = current, steps = [], segments = [];
    let previousEdgeId = null, distanceM = 0;

    for (let i = 0; i < requestedSteps; i++) {
      let arcs = index.outgoing.get(current) ?? [];
      if (!arcs.length) break;
      let alternatives = arcs.filter(arc => arc.edge.id !== previousEdgeId);
      // Reject a branch that would immediately strand the route at a dead end.
      alternatives = alternatives.filter(arc =>
        (index.outgoing.get(arc.to) ?? []).some(next => next.edge.id !== arc.edge.id)
      );
      if (!alternatives.length) break;
      // Prefer connected continuation choices over isolated one-edge branches.
      const through = alternatives.filter(arc =>
        (index.outgoing.get(arc.to) ?? []).filter(next => next.edge.id !== arc.edge.id).length >= 2
      );
      if (through.length) alternatives = through;
      const arc = alternatives[Math.floor(random() * alternatives.length)];
      const geometry = geometryForDirection(arc.edge, arc.lane.direction);
      if (geometry.lengthM <= 0) { current = arc.to; continue; }
      segments.push({
        edgeId: arc.edge.id, laneId: arc.lane.id, direction: arc.lane.direction,
        fromNodeId: arc.from, toNodeId: arc.to, startM: distanceM,
        lengthM: geometry.lengthM, edge: arc.edge, points: geometry.points,
        cumulative: geometry.cumulative
      });
      steps.push({ edgeId: arc.edge.id, laneId: arc.lane.id, direction: arc.lane.direction });
      distanceM += geometry.lengthM;
      previousEdgeId = arc.edge.id;
      current = arc.to;
    }

    const candidate = { id: "free-drive-" + startNodeId, networkId: index.networkId,
      startNodeId, destinationNodeId: current, steps, segments, distanceM };
    if (!best || candidate.steps.length > best.steps.length) best = candidate;
    if (candidate.steps.length >= minimumSteps && distanceM >= Math.min(500, requestedSteps * 10)) return candidate;
  }

  if (best?.steps.length >= minimumSteps && best.distanceM >= 500) return best;
  throw new Error("Could not build a sustained route without immediate dead-end branches from this road network");
}

/** Samples a route in metres and returns a world position, heading and lane context. */
export function sampleDirectedRoute(route, distanceM) {
  if (!route?.segments?.length || !(route.distanceM > 0)) return null;
  const wrapped = ((distanceM % route.distanceM) + route.distanceM) % route.distanceM;
  let segment = route.segments[route.segments.length - 1];
  for (const candidate of route.segments) {
    if (wrapped < candidate.startM + candidate.lengthM) { segment = candidate; break; }
  }
  const local = Math.max(0, Math.min(segment.lengthM, wrapped - segment.startM));
  const cumulative = segment.cumulative, points = segment.points;
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < local) i++;
  const span = cumulative[i] - cumulative[i - 1];
  const t = span > 0 ? (local - cumulative[i - 1]) / span : 0;
  const a = points[i - 1], b = points[i];
  const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
  const forwardX = dx / length, forwardZ = dz / length;
  // Vehicle models face local -Z; this heading maps that forward axis to the road direction.
  const headingRad = Math.atan2(forwardX, -forwardZ);
  return {
    x: a.x + dx * t, y: a.y + (b.y - a.y) * t, z: a.z + dz * t,
    headingRad, forwardX, forwardZ,
    leftX: forwardZ, leftZ: -forwardX,
    edge: segment.edge, edgeId: segment.edgeId, laneId: segment.laneId,
    direction: segment.direction, progressM: local, routeProgressM: wrapped
  };
}

/** Kept for callers that need a position on one edge rather than a route. */
export function sampleEdgeCenterline(edge, distanceM) {
  if (!edge?.centerline?.length || edge.centerline.length < 2) return null;
  const geometry = geometryForDirection(edge, "forward");
  const temporary = { distanceM: geometry.lengthM, segments: [{
    ...geometry, edge, edgeId: edge.id, laneId: edge.lanes?.[0]?.id ?? null,
    direction: "forward", startM: 0
  }] };
  return sampleDirectedRoute(temporary, distanceM);
}
