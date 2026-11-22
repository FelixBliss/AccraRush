import {
  buildNavigationIndex,
  createRandomDirectedRoute,
  sampleDirectedRoute
} from "./road-navigation.js";
import { createRoadMeshes } from "./three-road-renderer.js";
import { selectRoadFeatures } from "./road-features.js";
import { createRoadFeatureMeshes } from "./road-feature-renderer.js";
import { APPROVED_ROADS, buildMapModel, selectRoadGraph } from "./selected-road-graph.js";

const SUPPORTED_AREAS = new Set(["accra-central", "lapaz"]);
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

  // One authoritative selected-road graph: the five approved roads plus real OSM connectors.
  // Rendering, previews, minimap, navigation and AI traffic all use `network` below.
  const featuredRoadNames = [...APPROVED_ROADS[areaId]];
  const { network, report: selection } = selectRoadGraph(sourceNetwork, areaId);
  if (!selection.connected) throw new Error("Selected road graph for " + areaId + " is not connected");

  const navigationIndex = buildNavigationIndex(network);
  const createSpawnRoute = () => {
    const edge = network.edges.find(item => item.selection?.role === "route" && item.centerline?.length >= 2 && item.lanes?.length);
    if (!edge) throw new Error("No traversable featured road is available for player spawn");
    const lane = edge.lanes.find(item => item.direction === "forward") || edge.lanes[0];
    const points = lane.direction === "forward" ? edge.centerline : [...edge.centerline].reverse();
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      cumulative.push(cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    const lengthM = cumulative[cumulative.length - 1];
    const fromNodeId = lane.direction === "forward" ? edge.fromNodeId : edge.toNodeId;
    const toNodeId = lane.direction === "forward" ? edge.toNodeId : edge.fromNodeId;
    const step = { edgeId: edge.id, laneId: lane.id, direction: lane.direction };
    return {
      id: "featured-spawn-" + edge.id, networkId: network.id, startNodeId: fromNodeId,
      destinationNodeId: toNodeId, steps: [step], distanceM: lengthM,
      segments: [{ ...step, fromNodeId, toNodeId, startM: 0, lengthM, edge, points, cumulative }]
    };
  };
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
  // Real OSM crossings/signals/signs/barriers (data/osm/<area>.features.json), only those on the selected graph.
  let roadFeatures = { available: false, matched: 0, counts: {} };
  try {
    const featureResponse = await fetcher("./data/osm/" + areaId + ".features.json", { cache: "force-cache" });
    if (featureResponse?.ok) {
      const matched = selectRoadFeatures(await featureResponse.json(), network);
      const featureGroup = createRoadFeatureMeshes(THREE, matched, network);
      roadGroup.add(featureGroup);
      roadFeatures = { available: true, matched: matched.length, counts: featureGroup.userData.counts };
    }
  } catch { /* features are optional enrichment; the road network never depends on them */ }
  const minimap = buildMapModel(network, areaId);
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
    selection,
    roadFeatures,
    connectorEdgeCount: selection.connectorSegmentCount,
    playerRoute: createSpawnRoute(),
    createTrafficRoute(startNodeId = null) {
      if (disposed) throw new Error("Road network runtime has been disposed");
      const attempts = [...new Set([trafficRouteSteps, 40, 24, 14, 8])];
      for (const stepCount of attempts) {
        try { return createRandomDirectedRoute(navigationIndex, { stepCount, startNodeId }); } catch {}
      }
      for (const stepCount of attempts) {
        try { return createRandomDirectedRoute(navigationIndex, { stepCount }); } catch {}
      }
      return runtime.playerRoute;
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
