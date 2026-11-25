// One authoritative selected-road graph per area.
//
// The committed OSM extracts (data/osm/*.network.json, Geofabrik-derived) are the
// source of truth. This module reduces an extract to exactly five approved
// principal roads plus the real OSM connectors needed to join them, and returns
// that reduced graph. Rendering, menu previews, the live minimap, player
// navigation and AI traffic must all consume this one result.
//
// Nothing here invents geometry: every edge returned is an unmodified source edge
// (same id, node ids, centreline, lanes, OSM way identity) with a `selection`
// annotation recording why it was kept.

export const APPROVED_ROADS = Object.freeze({
  "accra-central": Object.freeze([
    "Independence Avenue",
    "Ring Road Central",
    "Ring Road East",
    "Ring Road West Road",
    "Kwame Nkrumah Avenue"
  ]),
  "lapaz": Object.freeze([
    "George Walker Bush Highway",
    "Osu N Street",
    "Tieku Baah Street",
    "Golden Street",
    "Christ Home Avenue",
    "Kumordji Street",
    "Grape Avenue",
    "Nii Okaiman Street",
    "Flower Street",
    "Nii Okaiman West Main Road"
  ])
});

// OSM street-name variants for the user's approved Lapaz labels.
const APPROVED_ROAD_ALIASES = Object.freeze({
  "lapaz": Object.freeze({
    "Osu N Street": Object.freeze(["Osu N Street", "Osun Street"]),
    "Tieku Baah Street": Object.freeze(["Tieku Baah Street", "Teiku Baah Street"]),
    "Grape Avenue": Object.freeze(["Grape Avenue", "Grapes Avenue"]),
    "Nii Okaiman Street": Object.freeze(["Nii Okaiman Street", "Nii Okaiman Avenue"]),
    "Nii Okaiman West Main Road": Object.freeze(["Nii Okaiman West Main Road", "Nii Okaiman West Main Street"])
  })
});

// Flower Street is named by addresses around Lapaz New Market but is not name-tagged
// in the current OSM extract. This exact OSM way is the drivable residential segment
// nearest the confirmed Flower Street address point (5.608928, -0.256985). Its
// geometry is retained unchanged; the game keeps the user's canonical route label.
const APPROVED_ROAD_WAY_IDS = Object.freeze({
  "lapaz": Object.freeze({
    "Flower Street": Object.freeze(["42781388"])
  })
});

// Connector candidates: real, drivable, non-residential roads. Residential ways
// are only a last resort (heavier weight) so the graph never wanders into the
// deep residential network unless there is no other real connection.
const MAJOR = new Set([
  "motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
  "secondary", "secondary_link", "tertiary", "tertiary_link"
]);
const LAST_RESORT = new Set(["residential", "unclassified", "living_street"]);
const ROUNDABOUT = new Set(["roundabout", "circular"]);

export function normaliseRoadName(name) {
  return String(name ?? "").toLowerCase().replace(/[–—-]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}


const wayIdOf = edge => edge.roadModel?.sourceWayId || edge.osm?.wayId || edge.id;

function geoDistanceM(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lon) ||
      !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) return Infinity;
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const lat1 = a.lat * rad, lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}


class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {
    const a = this.a; a.push(item);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

function componentsOf(edges) {
  const parent = new Map();
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const e of edges) for (const n of [e.fromNodeId, e.toNodeId]) if (!parent.has(n)) parent.set(n, n);
  for (const e of edges) parent.set(find(e.fromNodeId), find(e.toNodeId));
  const groups = new Map();
  for (const e of edges) {
    const r = find(e.fromNodeId);
    if (!groups.has(r)) groups.set(r, { nodes: new Set(), edges: [] });
    const g = groups.get(r); g.nodes.add(e.fromNodeId); g.nodes.add(e.toNodeId); g.edges.push(e);
  }
  return [...groups.values()].sort((a, b) => b.edges.length - a.edges.length);
}

// Strongly connected components over directed lane movement (Tarjan, iterative).
export function directedComponents(edges) {
  const out = new Map();
  const add = (a, b) => { if (!out.has(a)) out.set(a, []); if (!out.has(b)) out.set(b, []); out.get(a).push(b); };
  for (const e of edges) {
    const dirs = new Set((e.lanes || []).map(l => l.direction));
    if (!dirs.size || dirs.has("forward") || dirs.has("both")) add(e.fromNodeId, e.toNodeId);
    if (!dirs.size || dirs.has("reverse") || dirs.has("backward") || dirs.has("both")) add(e.toNodeId, e.fromNodeId);
    if (!out.has(e.fromNodeId)) out.set(e.fromNodeId, []);
    if (!out.has(e.toNodeId)) out.set(e.toNodeId, []);
  }
  let index = 0; const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], comps = [];
  for (const root of out.keys()) {
    if (idx.has(root)) continue;
    const work = [[root, 0]];
    idx.set(root, index); low.set(root, index); index++; stack.push(root); onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1], [v] = frame, nbrs = out.get(v);
      if (frame[1] < nbrs.length) {
        const w = nbrs[frame[1]++];
        if (!idx.has(w)) { idx.set(w, index); low.set(w, index); index++; stack.push(w); onStack.add(w); work.push([w, 0]); }
        else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
      } else {
        work.pop();
        if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(low.get(u), low.get(v))); }
        if (low.get(v) === idx.get(v)) {
          const comp = []; let w;
          do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
          comps.push(comp);
        }
      }
    }
  }
  return comps.sort((a, b) => b.length - a.length);
}

export function selectRoadGraph(sourceNetwork, areaId) {
  const approved = APPROVED_ROADS[areaId];
  if (!approved) throw new Error("No approved road selection exists for area: " + areaId);
  if (!sourceNetwork?.edges?.length || !sourceNetwork?.nodes?.length) throw new Error("Source OSM network is empty for " + areaId);

  const aliases = APPROVED_ROAD_ALIASES[areaId] || {};
  const wanted = approved.map(label => ({
    label,
    keys: (aliases[label] || [label]).map(normaliseRoadName)
  }));
  const kept = new Map(); // edge id -> { edge, role, routeName }
  const keep = (edge, role, routeName = null) => { if (!kept.has(edge.id)) kept.set(edge.id, { edge, role, routeName }); };

  // 1. The approved roads: every source edge carrying an accepted OSM name.
  const missing = [];
  for (const road of wanted) {
    const accepted = new Set(road.keys);
    const explicitWayIds = new Set((APPROVED_ROAD_WAY_IDS[areaId]?.[road.label] || []).map(String));
    const matches = sourceNetwork.edges.filter(e => {
      if (accepted.has(normaliseRoadName(e.osm?.name))) return true;
      if (!explicitWayIds.size) return false;
      const rawId = String(wayIdOf(e));
      const normalisedId = rawId.replace(/^osm-way-w/, "").replace(/^w/, "").replace(/-segment-.*/, "");
      return explicitWayIds.has(normalisedId);
    });
    if (!matches.length) missing.push(road.label);
    for (const e of matches) keep(e, "route", road.label);
  }
  if (missing.length) throw new Error("Approved road(s) not found in " + areaId + " OSM data: " + missing.join(", "));

  // 2. Adjacency over real candidate connectors.
  const adjacency = new Map();
  const link = (a, b, edge, cost) => { if (!adjacency.has(a)) adjacency.set(a, []); adjacency.get(a).push({ to: b, edge, cost }); };
  for (const e of sourceNetwork.edges) {
    const hw = e.osm?.highway;
    const cost = MAJOR.has(hw) ? e.lengthM : LAST_RESORT.has(hw) ? e.lengthM * 4 : null;
    if (cost == null) continue;
    link(e.fromNodeId, e.toNodeId, e, cost);
    link(e.toNodeId, e.fromNodeId, e, cost);
  }

  // 3. Join separated components with the cheapest real connecting path.
  const connectorPaths = [];
  for (let guard = 0; guard < 200; guard++) {
    const comps = componentsOf([...kept.values()].map(k => k.edge));
    if (comps.length <= 1) break;
    const main = comps[0], others = new Map();
    comps.slice(1).forEach((c, i) => c.nodes.forEach(n => others.set(n, i + 1)));
    const dist = new Map(), prev = new Map(), heap = new MinHeap();
    main.nodes.forEach(n => { dist.set(n, 0); heap.push([0, n]); });
    let hit = null;
    while (heap.size) {
      const [d, v] = heap.pop();
      if (d > dist.get(v)) continue;
      if (others.has(v)) { hit = v; break; }
      for (const step of adjacency.get(v) || []) {
        const nd = d + step.cost;
        if (nd < (dist.get(step.to) ?? Infinity)) { dist.set(step.to, nd); prev.set(step.to, { from: v, edge: step.edge }); heap.push([nd, step.to]); }
      }
    }
    if (hit == null) break; // genuinely unreachable; reported below
    const path = [];
    for (let c = hit; prev.has(c); c = prev.get(c).from) path.push(prev.get(c).edge);
    path.forEach(e => keep(e, "connector"));
    connectorPaths.push({ toComponentEdges: comps[others.get(hit)].edges.length, edgeIds: path.map(e => e.id), lengthM: Math.round(path.reduce((s, e) => s + e.lengthM, 0)) });
  }

  // 4. Junction completion. A roundabout that the selected roads touch must be
  //    whole (all of its edges), and link/slip roads joining two retained nodes
  //    stay, otherwise the junction topology is broken.
  const retainedNodes = () => new Set([...kept.values()].flatMap(k => [k.edge.fromNodeId, k.edge.toNodeId]));
  let nodes = retainedNodes();
  const roundaboutWays = new Set();
  for (const e of sourceNetwork.edges) if (ROUNDABOUT.has(e.osm?.junction) && (nodes.has(e.fromNodeId) || nodes.has(e.toNodeId))) roundaboutWays.add(wayIdOf(e));
  for (const e of sourceNetwork.edges) if (roundaboutWays.has(wayIdOf(e)) && ROUNDABOUT.has(e.osm?.junction)) keep(e, "junction");
  nodes = retainedNodes();
  for (const e of sourceNetwork.edges) {
    if (/_link$/.test(e.osm?.highway || "") && nodes.has(e.fromNodeId) && nodes.has(e.toNodeId)) keep(e, "junction");
  }

  // 5. Directed usability. Dual carriageways are separate one-way OSM ways, so a
  //    selection of named roads alone leaves one-way pieces that traffic can enter
  //    but never leave. Join each stranded strongly-connected piece back to the main
  //    one with the cheapest REAL directed OSM paths (both ways), within a length cap.
  const arcs = new Map(), rarcs = new Map();
  const addArc = (m, a, b, edge, cost) => { if (!m.has(a)) m.set(a, []); m.get(a).push({ to: b, edge, cost }); };
  for (const e of sourceNetwork.edges) {
    const hw = e.osm?.highway;
    const cost = MAJOR.has(hw) ? e.lengthM : LAST_RESORT.has(hw) ? e.lengthM * 3 : null;
    if (cost == null) continue;
    const dirs = new Set((e.lanes || []).map(l => (l.direction === "both" ? "forward" : l.direction)));
    const both = (e.lanes || []).some(l => l.direction === "both");
    if (!dirs.size || dirs.has("forward") || both) { addArc(arcs, e.fromNodeId, e.toNodeId, e, cost); addArc(rarcs, e.toNodeId, e.fromNodeId, e, cost); }
    if (!dirs.size || dirs.has("reverse") || both) { addArc(arcs, e.toNodeId, e.fromNodeId, e, cost); addArc(rarcs, e.fromNodeId, e.toNodeId, e, cost); }
  }
  const shortest = (graph, sources, targets, capCost) => {
    const dist = new Map(), prev = new Map(), heap = new MinHeap();
    sources.forEach(n => { dist.set(n, 0); heap.push([0, n]); });
    while (heap.size) {
      const [d, v] = heap.pop();
      if (d > dist.get(v)) continue;
      if (d > capCost) return null;
      if (targets.has(v) && d > 0) {
        const path = [];
        for (let c = v; prev.has(c); c = prev.get(c).from) path.push(prev.get(c).edge);
        return path;
      }
      for (const s of graph.get(v) || []) {
        const nd = d + s.cost;
        if (nd < (dist.get(s.to) ?? Infinity)) { dist.set(s.to, nd); prev.set(s.to, { from: v, edge: s.edge }); heap.push([nd, s.to]); }
      }
    }
    return null;
  };
  const DIRECTED_CAP_COST = 5000; // weighted metres per direction
  const directedRepairs = [];
  const skipped = new Set();
  for (let guard = 0; guard < 600; guard++) {
    const sccs = directedComponents([...kept.values()].map(k => k.edge));
    const main = new Set(sccs[0]);
    const candidate = sccs.slice(1).find(c => !c.every(n => skipped.has(n)));
    if (!candidate) break;
    const own = new Set(candidate);
    const toMain = shortest(arcs, own, main, DIRECTED_CAP_COST);
    const fromMain = toMain && shortest(rarcs, own, main, DIRECTED_CAP_COST);
    if (!toMain || !fromMain) { candidate.forEach(n => skipped.add(n)); continue; }
    [...toMain, ...fromMain].forEach(e => keep(e, "connector"));
    directedRepairs.push({ nodes: candidate.length, edgeIds: [...new Set([...toMain, ...fromMain].map(e => e.id))] });
  }

  const selectedEdges = [...kept.values()].map(({ edge, role, routeName }) => ({
    ...edge,
    selection: { role, routeName, sourceWayId: wayIdOf(edge) }
  }));
  const usedNodes = new Set(selectedEdges.flatMap(e => [e.fromNodeId, e.toNodeId]));
  const selectedNodes = sourceNetwork.nodes.filter(n => usedNodes.has(n.id));

  const comps = componentsOf(selectedEdges);
  const scc = directedComponents(selectedEdges);
  const byRole = {};
  selectedEdges.forEach(e => byRole[e.selection.role] = (byRole[e.selection.role] || 0) + 1);
  const perRoad = approved.map(label => {
    const es = selectedEdges.filter(e => e.selection.role === "route" && e.selection.routeName === label);
    return {
      name: label,
      edges: es.length,
      wayIds: [...new Set(es.map(e => e.selection.sourceWayId))].sort(),
      highway: [...new Set(es.map(e => e.osm?.highway))].sort(),
      lengthM: Math.round(es.reduce((s, e) => s + e.lengthM, 0))
    };
  });

  const network = { ...sourceNetwork, nodes: selectedNodes, edges: selectedEdges };
  const report = {
    areaId,
    approvedRoads: [...approved],
    sourceEdgeCount: sourceNetwork.edges.length,
    sourceNodeCount: sourceNetwork.nodes.length,
    selectedEdgeCount: selectedEdges.length,
    selectedNodeCount: selectedNodes.length,
    routeSegmentCount: byRole.route || 0,
    connectorSegmentCount: (byRole.connector || 0) + (byRole.junction || 0),
    connectingPathSegments: byRole.connector || 0,
    junctionSegments: byRole.junction || 0,
    roads: perRoad,
    connectorPaths,
    directedRepairCount: directedRepairs.length,
    undirectedComponents: comps.length,
    largestStronglyConnectedNodes: scc[0]?.length || 0,
    stronglyConnectedShare: Number(((scc[0]?.length || 0) / Math.max(1, selectedNodes.length)).toFixed(3)),
    connected: comps.length === 1
  };
  return { network, report };
}

// Shared by menu previews and the live minimap, computed once from the selected graph.
export function buildMapModel(network, areaId) {
  const roads = [];
  let minX = Infinity, maxX = -Infinity, minZ = -Infinity, maxZ = -Infinity;
  minZ = Infinity;
  for (const edge of network.edges) {
    if (edge.selection?.role === "connector") continue;
    const line = edge.centerline;
    if (!Array.isArray(line) || line.length < 2) continue;
    for (const p of line) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    roads.push({
      id: edge.id,
      wayId: edge.selection?.sourceWayId ?? edge.osm?.wayId ?? null,
      name: edge.osm?.name || "",
      role: edge.selection?.role || "route",
      routeName: edge.selection?.routeName || null,
      centerline: line.map(p => ({ x: p.x, z: p.z }))
    });
  }
  return { areaId, bounds: { minX, maxX, minZ, maxZ }, roads, edgeCount: roads.length };
}


// Build the playable graph directly from an OSM-verified closed-circuit manifest.
// The complete imported regional network remains the source; only edges in the
// selected circuit are passed to the renderer, minimap, player and AI.
export function selectCircuitRoadGraph(sourceNetwork, manifest) {
  if (!sourceNetwork?.nodes?.length || !sourceNetwork?.edges?.length) {
    throw new Error("Source OSM network is empty");
  }
  if (!manifest?.closed || !Array.isArray(manifest.steps) || manifest.steps.length < 6) {
    throw new Error("Circuit manifest is not a closed multi-edge route");
  }
  if (manifest.networkId !== sourceNetwork.id) {
    throw new Error("Circuit manifest belongs to a different OSM network");
  }
  if (!manifest.startNodeId || manifest.startNodeId !== manifest.endNodeId) {
    throw new Error("Circuit manifest does not close at its exact start node");
  }
  const sourceEdges = new Map(sourceNetwork.edges.map(edge => [edge.id, edge]));
  const sourceNodes = new Map(sourceNetwork.nodes.map(node => [node.id, node]));
  const selectedEdges = new Map();
  let previousNode = manifest.startNodeId;
  for (const step of manifest.steps) {
    if (step.fromNodeId !== previousNode) {
      throw new Error("Circuit has a disconnected step at edge " + step.edgeId);
    }
    const edge = sourceEdges.get(step.edgeId);
    if (!edge) throw new Error("Circuit references an edge missing from the source OSM network: " + step.edgeId);
    const lane = (edge.lanes || []).find(item => item.id === step.laneId);
    if (!lane) throw new Error("Circuit references a missing OSM lane: " + step.laneId);
    const expectedFrom = step.direction === "reverse" ? edge.toNodeId : edge.fromNodeId;
    const expectedTo = step.direction === "reverse" ? edge.fromNodeId : edge.toNodeId;
    const laneAllowsDirection = lane.direction === "both" ||
      (step.direction === "forward" && lane.direction === "forward") ||
      (step.direction === "reverse" && (lane.direction === "reverse" || lane.direction === "backward"));
    if (expectedFrom !== step.fromNodeId || expectedTo !== step.toNodeId || !laneAllowsDirection) {
      throw new Error("Circuit step violates its source OSM edge or lane direction: " + step.edgeId);
    }
    if (!sourceNodes.has(step.fromNodeId) || !sourceNodes.has(step.toNodeId)) {
      throw new Error("Circuit step references an OSM node missing from the source network");
    }
    if (!selectedEdges.has(edge.id)) {
      selectedEdges.set(edge.id, {
        ...edge,
        selection: {
          role: "route",
          routeName: step.name || edge.osm?.name || "OSM circuit road",
          sourceWayId: edge.roadModel?.sourceWayId || edge.osm?.wayId || edge.id
        }
      });
    }
    previousNode = step.toNodeId;
  }
  if (previousNode !== manifest.startNodeId) {
    throw new Error("Circuit steps do not return to the exact start node");
  }
  const nodeIds = new Set(manifest.steps.flatMap(step => [step.fromNodeId, step.toNodeId]));
  const network = {
    ...sourceNetwork,
    nodes: sourceNetwork.nodes.filter(node => nodeIds.has(node.id)),
    edges: [...selectedEdges.values()]
  };
  return {
    network,
    report: {
      connected: true,
      selectedEdgeCount: network.edges.length,
      selectedNodeCount: network.nodes.length,
      connectorSegmentCount: 0,
      namedRoads: manifest.namedRoads || [],
      circuitEdgeCount: manifest.steps.length
    }
  };
}

/** Selects source OSM edges used by both directions of the approved open highway corridor. */
export function selectHighwayRouteGraph(sourceNetwork, manifest) {
  if (!sourceNetwork?.nodes?.length || !sourceNetwork?.edges?.length) throw new Error("Source OSM network is empty");
  if (manifest?.closed !== false || !Array.isArray(manifest.steps) || manifest.steps.length < 2 ||
      !Array.isArray(manifest.returnSteps) || manifest.returnSteps.length < 2) {
    throw new Error("Highway manifest must contain outbound and return point-to-point routes");
  }
  if (manifest.networkId !== sourceNetwork.id) throw new Error("Highway route manifest belongs to a different OSM network");
  if (!manifest.startNodeId || !manifest.endNodeId || manifest.startNodeId === manifest.endNodeId) {
    throw new Error("Highway route must have distinct Lapaz and Madina endpoints");
  }
  const sourceEdges = new Map(sourceNetwork.edges.map(edge => [edge.id, edge]));
  const sourceNodes = new Map(sourceNetwork.nodes.map(node => [node.id, node]));
  const selectedEdges = new Map();
  const sequences = [
    { start: manifest.startNodeId, end: manifest.endNodeId, steps: manifest.steps, label: "outbound" },
    { start: manifest.endNodeId, end: manifest.startNodeId, steps: manifest.returnSteps, label: "return" }
  ];
  for (const sequence of sequences) {
    let previousNode = sequence.start;
    for (const [i, step] of sequence.steps.entries()) {
      if (step.fromNodeId !== previousNode) throw new Error("Highway " + sequence.label + " route has a disconnected step at edge " + step.edgeId);
      const edge = sourceEdges.get(step.edgeId);
      if (!edge) throw new Error("Highway route references a missing source OSM edge: " + step.edgeId);
      const lane = (edge.lanes || []).find(item => item.id === step.laneId);
      if (!lane) throw new Error("Highway route references a missing OSM lane: " + step.laneId);
      const expectedFrom = step.direction === "reverse" ? edge.toNodeId : edge.fromNodeId;
      const expectedTo = step.direction === "reverse" ? edge.fromNodeId : edge.toNodeId;
      const laneAllowsDirection = lane.direction === "both" ||
        (step.direction === "forward" && lane.direction === "forward") ||
        (step.direction === "reverse" && (lane.direction === "reverse" || lane.direction === "backward"));
      if (expectedFrom !== step.fromNodeId || expectedTo !== step.toNodeId || !laneAllowsDirection) {
        throw new Error("Highway route step violates its source OSM edge or lane direction: " + step.edgeId);
      }
      if (!sourceNodes.has(step.fromNodeId) || !sourceNodes.has(step.toNodeId)) {
        throw new Error("Highway route references an OSM node missing from the source network");
      }
      if (!selectedEdges.has(edge.id)) selectedEdges.set(edge.id, {
        ...edge, selection: { role: "route", routeName: step.name || edge.osm?.name || "OSM highway",
          sourceWayId: edge.roadModel?.sourceWayId || edge.osm?.wayId || edge.id }
      });
      previousNode = step.toNodeId;
    }
    if (previousNode !== sequence.end) throw new Error("Highway " + sequence.label + " route does not reach its declared endpoint");
  }
  // Add explicitly bounded interchange context as render-only connectors.
  // These edges never enter the outbound/return route steps or AI traffic paths.
  let connectorEdgeCount = 0;
  for (const zone of manifest.renderZones || []) {
    const allowed = new Set(zone.allowedHighways || []);
    for (const edge of sourceNetwork.edges) {
      if (selectedEdges.has(edge.id) || !allowed.has(edge.osm?.highway)) continue;
      const from = sourceNodes.get(edge.fromNodeId)?.osm;
      const to = sourceNodes.get(edge.toNodeId)?.osm;
      const center = from && to ? { lat: (from.lat + to.lat) / 2, lon: (from.lon + to.lon) / 2 } : null;
      const nearest = Math.min(geoDistanceM(from, zone.center), geoDistanceM(to, zone.center), geoDistanceM(center, zone.center));
      if (nearest > zone.radiusM) continue;
      selectedEdges.set(edge.id, {
        ...edge,
        selection: { role: "connector", zoneId: zone.id, zoneName: zone.name,
          sourceWayId: edge.roadModel?.sourceWayId || edge.osm?.wayId || edge.id }
      });
      connectorEdgeCount++;
    }
  }
  const nodeIds = new Set([...selectedEdges.values()].flatMap(edge => [edge.fromNodeId, edge.toNodeId]));
  const network = { ...sourceNetwork,
    nodes: sourceNetwork.nodes.filter(node => nodeIds.has(node.id)),
    edges: [...selectedEdges.values()] };
  return { network, report: { connected: true, selectedEdgeCount: network.edges.length,
    selectedNodeCount: network.nodes.length, connectorSegmentCount: connectorEdgeCount, connectorEdgeCount,
    namedRoads: manifest.namedRoads || [], routeEdgeCount: manifest.steps.length,
    returnRouteEdgeCount: manifest.returnSteps.length, waypointCount: manifest.waypoints?.length || 2 } };
}
