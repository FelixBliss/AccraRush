import {
  buildNavigationIndex,
  createRandomDirectedRoute,
  sampleDirectedRoute
} from "./road-navigation.js";
import { createRoadMeshes } from "./three-road-renderer.js";

const SUPPORTED_AREAS = new Set(["accra-central", "lapaz"]);
const MAIN_ROAD_CLASSES = new Set(["motorway", "trunk", "primary", "secondary"]);
const FEATURED_ROADS = {
  "accra-central": ["Independence Avenue", "Ring Road Central", "Ring Road East", "Ring Road West Road", "Kwame Nkrumah Avenue"],
  "lapaz": ["Nsawam Road", "George Walker Bush Highway", "Kwashieman-Ofankor Road", "Achimota Forest Road", "J.A. Kuffour Avenue"]
};


export function selectFeaturedRoadEdges(sourceNetwork, areaId) {
  const names = FEATURED_ROADS[areaId] || [];
  const allMainEdges = sourceNetwork.edges.filter(edge => MAIN_ROAD_CLASSES.has(edge.osm?.highway));
  const featuredEdges = allMainEdges.filter(edge => names.includes(edge.osm?.name));
  if (!featuredEdges.length) throw new Error("The five featured roads are missing from " + areaId);

  const adjacency = new Map();
  const add = (node, next, edge) => {
    if (!adjacency.has(node)) adjacency.set(node, []);
    adjacency.get(node).push({ node: next, edge });
  };
  for (const edge of allMainEdges) {
    add(edge.fromNodeId, edge.toNodeId, edge);
    add(edge.toNodeId, edge.fromNodeId, edge);
  }

  const featuredAdjacency = new Map();
  const addFeatured = (node, next) => {
    if (!featuredAdjacency.has(node)) featuredAdjacency.set(node, []);
    featuredAdjacency.get(node).push(next);
  };
  for (const edge of featuredEdges) {
    addFeatured(edge.fromNodeId, edge.toNodeId);
    addFeatured(edge.toNodeId, edge.fromNodeId);
  }
  const components = [], visited = new Set();
  for (const start of featuredAdjacency.keys()) {
    if (visited.has(start)) continue;
    const nodes = new Set([start]), queue = [start];
    visited.add(start);
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i];
      for (const next of featuredAdjacency.get(node) || []) {
        if (!visited.has(next)) { visited.add(next); nodes.add(next); queue.push(next); }
      }
    }
    const edges = new Map();
    for (const edge of featuredEdges) if (nodes.has(edge.fromNodeId) && nodes.has(edge.toNodeId)) edges.set(edge.id, edge);
    components.push({ nodes, edges });
  }

  const selected = new Map(components[0].edges);
  const connectedNodes = new Set(components[0].nodes);
  for (const component of components.slice(1)) {
    const queue = [...connectedNodes], parent = new Map(queue.map(node => [node, null]));
    let target = null;
    for (let i = 0; i < queue.length && target === null; i++) {
      const node = queue[i];
      if (component.nodes.has(node)) { target = node; break; }
      for (const next of adjacency.get(node) || []) {
        if (parent.has(next.node)) continue;
        parent.set(next.node, { node, edge: next.edge });
        if (component.nodes.has(next.node)) { target = next.node; break; }
        queue.push(next.node);
      }
    }
    if (target !== null) {
      let cursor = target;
      while (parent.get(cursor)) {
        const step = parent.get(cursor);
        selected.set(step.edge.id, step.edge);
        cursor = step.node;
        connectedNodes.add(cursor);
      }
    }
    for (const edge of component.edges.values()) selected.set(edge.id, edge);
    for (const node of component.nodes) connectedNodes.add(node);
  }
  return [...selected.values()];
}

export async function loadRoadNetworkRuntime({
  THREE,
  scene,
  areaId,
  fetcher = globalThis.fetch,
  trafficRouteSteps = 70,
  playerRouteSteps = 120
}) {
  if (!SUPPORTED_AREAS.has(areaId)) throw new Error("This OSM road network is not available yet: " + areaId);
  if (!THREE || !scene || typeof fetcher !== "function") {
    throw new Error("Three.js, a scene and fetch are required to load the road network");
  }

  const response = await fetcher("./data/osm/" + areaId + ".network.json", { cache: "force-cache" });
  if (!response?.ok) throw new Error("Could not load " + areaId + " road network (HTTP " + (response?.status ?? "unknown") + ")");
  const document = await response.json();
  const sourceNetwork = document?.network;
  if (!sourceNetwork?.nodes?.length || !sourceNetwork?.edges?.length) throw new Error("The " + areaId + " road network is empty");

  // Phase one deliberately loads only the major-road backbone. Main roads
  // retain four directional lanes (two each way where bidirectional).
  const featuredRoadNames = FEATURED_ROADS[areaId];
  const mainEdges = selectFeaturedRoadEdges(sourceNetwork, areaId);
  if (!mainEdges.length) throw new Error("No major roads were found in " + areaId);
  const usedNodeIds = new Set(mainEdges.flatMap(edge => [edge.fromNodeId, edge.toNodeId]));
  const network = {
    ...sourceNetwork,
    nodes: sourceNetwork.nodes.filter(node => usedNodeIds.has(node.id)),
    edges: mainEdges
  };

  const navigationIndex = buildNavigationIndex(network);
  const roadGroup = createRoadMeshes(THREE, network);

  // Spatial buckets make nearby street-name lookup cheap enough for mobile.
  const roadCellSize = 120, roadGrid = new Map();
  const cellKey = (x, z) => Math.floor(x / roadCellSize) + ":" + Math.floor(z / roadCellSize);
  for (const edge of network.edges) {
    for (let i = 1; i < edge.centerline.length; i++) {
      const a = edge.centerline[i - 1], b = edge.centerline[i];
      const minX = Math.floor(Math.min(a.x, b.x) / roadCellSize), maxX = Math.floor(Math.max(a.x, b.x) / roadCellSize);
      const minZ = Math.floor(Math.min(a.z, b.z) / roadCellSize), maxZ = Math.floor(Math.max(a.z, b.z) / roadCellSize);
      const segment = { edge, a, b };
      for (let gx = minX; gx <= maxX; gx++) for (let gz = minZ; gz <= maxZ; gz++) {
        const key = gx + ":" + gz;
        if (!roadGrid.has(key)) roadGrid.set(key, []);
        roadGrid.get(key).push(segment);
      }
    }
  }
  function findNearestRoad(x, z, maxDistanceM = 45) {
    const gx = Math.floor(x / roadCellSize), gz = Math.floor(z / roadCellSize);
    let best = null, bestDistance = maxDistanceM, bestNamed = null, bestNamedDistance = maxDistanceM;
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      for (const segment of roadGrid.get((gx + ox) + ":" + (gz + oz)) ?? []) {
        const { a, b, edge } = segment;
        const dx = b.x - a.x, dz = b.z - a.z, lengthSq = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq));
        const distance = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
        const candidate = { edge, distanceM: distance, forwardX: dx / Math.sqrt(lengthSq), forwardZ: dz / Math.sqrt(lengthSq) };
        if (distance < bestDistance) { bestDistance = distance; best = candidate; }
        if (edge.osm?.name && distance < bestNamedDistance) { bestNamedDistance = distance; bestNamed = candidate; }
      }
    }
    // Prefer a nearby named corridor over an unnamed slip/link segment so street-entry toasts remain reliable at junctions.
    return bestNamed && (!best || bestNamed.distanceM <= best.distanceM + 14) ? bestNamed : best;
  }
  const featuredRoadNames = FEATURED_ROADS[areaId];
  const mapPoints = network.edges.flatMap(edge => edge.centerline);
  const minimapBounds = mapPoints.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x), maxX: Math.max(bounds.maxX, point.x),
    minZ: Math.min(bounds.minZ, point.z), maxZ: Math.max(bounds.maxZ, point.z)
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const minimap = {
    areaId,
    bounds: minimapBounds,
    featuredRoadNames,
    edges: network.edges.map(edge => ({
      name: edge.osm?.name || "",
      featured: featuredRoadNames.includes(edge.osm?.name),
      centerline: edge.centerline
    }))
  };
  scene.add(roadGroup);

  let disposed = false;
  const runtime = {
    areaId,
    document,
    network,
    navigationIndex,
    roadGroup,
    findNearestRoad,
    featuredRoadNames,
    minimap,
    connectorEdgeCount: mainEdges.filter(edge => !featuredRoadNames.includes(edge.osm?.name)).length,
    playerRoute: createRandomDirectedRoute(navigationIndex, { stepCount: playerRouteSteps, startNodeId: mainEdges.find(edge => featuredRoadNames.includes(edge.osm?.name))?.fromNodeId }),
    createTrafficRoute(startNodeId = null) {
      if (disposed) throw new Error("Road network runtime has been disposed");
      return createRandomDirectedRoute(navigationIndex, { stepCount: trafficRouteSteps, startNodeId });
    },
    sample(route, distanceM) {
      if (disposed) return null;
      return sampleDirectedRoute(route, distanceM);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(roadGroup);
      roadGroup.traverse(object => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
        else object.material?.dispose?.();
      });
    }
  };
  return runtime;
}
