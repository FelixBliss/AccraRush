import {
  buildNavigationIndex,
  createRandomDirectedRoute,
  sampleDirectedRoute,
  buildClosedCircuitRoute,
  buildDirectedRoute
} from "./road-navigation.js";
import { createRoadMeshes } from "./three-road-renderer.js";
import { selectRoadFeatures } from "./road-features.js";
import { createRoadFeatureMeshes } from "./road-feature-renderer.js";
import { createAreaEntrySignMeshes } from "./area-entry-sign-renderer.js";
import { createAreaBuildingMeshes, decodeAreaBuildingDocument } from "./area-building-renderer.js";
import { buildMapModel, selectCircuitRoadGraph, selectHighwayRouteGraph } from "./selected-road-graph.js";

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

  const response = await fetcher("./data/osm/" + areaId + ".network.json?v=lapaz-madina-20261125a", { cache: "no-store" });
  if (!response?.ok) throw new Error("Could not load " + areaId + " road network (HTTP " + (response?.status ?? "unknown") + ")");
  const document = await response.json();
  const sourceNetwork = document?.network;
  if (!sourceNetwork?.nodes?.length || !sourceNetwork?.edges?.length) throw new Error("The " + areaId + " road network is empty");

  // Both selectable areas now use explicit point-to-point OSM corridors.
  const isHighwayCorridor = true;
  const manifestPath = areaId === "lapaz"
    ? "./data/osm/lapaz-madina-route.json?v=lapaz-madina-20261125a"
    : "./data/osm/accra-labadi-route.json?v=route2-accra-labadi-20261126a";
  const routeResponse = await fetcher(manifestPath, { cache: "no-store" });
  if (!routeResponse?.ok) throw new Error("Could not load " + (areaId === "lapaz" ? "Lapaz–Madina highway route" : "Accra–Labadi highway route") +
    " (HTTP " + (routeResponse?.status ?? "unknown") + ")");
  const routeManifest = await routeResponse.json();
  const selected = isHighwayCorridor
    ? selectHighwayRouteGraph(sourceNetwork, routeManifest)
    : selectCircuitRoadGraph(sourceNetwork, routeManifest);
  const { network, report: selection } = selected;
  if (!selection.connected) throw new Error("OSM route graph for " + areaId + " is not connected");
  const navigationIndex = buildNavigationIndex(network);
  const raceCircuit = isHighwayCorridor
    ? buildDirectedRoute(navigationIndex, routeManifest)
    : buildClosedCircuitRoute(navigationIndex, routeManifest);
  const returnHighwayRoute = isHighwayCorridor
    ? buildDirectedRoute(navigationIndex, {
        ...routeManifest, routeId: routeManifest.returnRouteId,
        startNodeId: routeManifest.endNodeId, endNodeId: routeManifest.startNodeId,
        steps: routeManifest.returnSteps, namedRoads: routeManifest.returnNamedRoads,
        waypoints: routeManifest.returnWaypoints
      })
    : null;
  const createSpawnRoute = () => {
    const segment = raceCircuit.segments[0];
    if (!segment || segment.edge.selection?.role !== "route") {
      throw new Error("The race circuit must begin on a featured road before player spawn");
    }
    const step = { edgeId: segment.edgeId, laneId: segment.laneId, direction: segment.direction };
    return {
      id: "race-start-" + areaId, networkId: network.id,
      startNodeId: segment.fromNodeId, destinationNodeId: segment.toNodeId,
      steps: [step], distanceM: segment.lengthM,
      segments: [{ ...segment, startM: 0 }]
    };
  };
  const roadGroup = createRoadMeshes(THREE, network);

  // Physical community-entry signs are static scenery attached to existing
  // approved route edges. Missing/invalid sign data must never block driving.
  let areaEntrySigns = { available: false, count: 0, signIds: [] };
  let roadsideBuildings = { available: false, count: 0 };
  if (areaId === "lapaz") {
    try {
      const signResponse = await fetcher("./data/osm/lapaz-madina-area-signs.json?v=lapaz-madina-20261125b", { cache: "no-store" });
      if (signResponse?.ok) {
        const signDocument = await signResponse.json();
        const signGroup = createAreaEntrySignMeshes(THREE, signDocument, network);
        roadGroup.add(signGroup);
        areaEntrySigns = { available: true, count: signGroup.userData.count, signIds: signGroup.userData.signIds };
      }
    } catch (error) {
      areaEntrySigns = { available: false, count: 0, signIds: [], error: String(error?.message || error) };
    }
  }

  // Compact, batched building footprints add mapped roadside massing to the
  // first approved Lapaz section. This optional scenery never changes the graph.
  if (areaId === "lapaz") {
    try {
      const buildingResponse = await fetcher("./data/osm/lapaz-akweteyman-buildings.json.gz.b64?v=lapaz-akweteyman-20261125a", { cache: "no-store" });
      if (buildingResponse?.ok) {
        const buildingDocument = await decodeAreaBuildingDocument(await buildingResponse.text());
        const buildingGroup = createAreaBuildingMeshes(THREE, buildingDocument);
        roadGroup.add(buildingGroup);
        roadsideBuildings = {
          available: true,
          count: buildingGroup.userData.buildingCount,
          rejectedCount: buildingGroup.userData.rejectedCount,
          terrainElevationVerified: false
        };
      }
    } catch (error) {
      roadsideBuildings = { available: false, count: 0, error: String(error?.message || error) };
    }
  }

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
    const featureResponse = await fetcher("./data/osm/" + areaId + ".features.json?v=phase1-20261124b", { cache: "no-store" });
    if (featureResponse?.ok) {
      const matched = selectRoadFeatures(await featureResponse.json(), network);
      const featureGroup = createRoadFeatureMeshes(THREE, matched, network);
      roadGroup.add(featureGroup);
      roadFeatures = { available: true, matched: matched.length, counts: featureGroup.userData.counts, items: matched };
    }
  } catch { /* features are optional enrichment; the road network never depends on them */ }
  const minimap = buildMapModel(network, areaId);
  const outboundEdgeIds = raceCircuit.steps.map(step => step.edgeId);
  const returnEdgeIds = returnHighwayRoute?.steps.map(step => step.edgeId) || [];
  if (isHighwayCorridor) {
    const startNode = network.nodes.find(node => node.id === routeManifest.startNodeId);
    const endNode = network.nodes.find(node => node.id === routeManifest.endNodeId);
    if (!startNode || !endNode) throw new Error("The " + routeManifest.title + " minimap endpoints are missing from the selected route graph");
    // Route 2 has two distinct carriageways which must both appear on its map.
    // Keep the established single-spine minimap for Lapaz–Madina unchanged.
    const displayedEdgeIds = areaId === "accra-central"
      ? [...outboundEdgeIds, ...returnEdgeIds]
      : outboundEdgeIds;
    const corridorIds = new Set(displayedEdgeIds);
    minimap.roads = minimap.roads.filter(road => corridorIds.has(road.id));
    const points = minimap.roads.flatMap(road => road.centerline);
    if (!points.length) throw new Error(routeManifest.title + " outbound map has no road geometry");
    minimap.bounds = {
      minX: Math.min(...points.map(point => point.x)), maxX: Math.max(...points.map(point => point.x)),
      minZ: Math.min(...points.map(point => point.z)), maxZ: Math.max(...points.map(point => point.z))
    };
    minimap.routeEndpoints = {
      start: { x: startNode.position.x, z: startNode.position.z },
      end: { x: endNode.position.x, z: endNode.position.z }
    };
  }
  minimap.raceCircuit = { edgeIds: [...new Set([...outboundEdgeIds, ...returnEdgeIds])], outboundEdgeIds, returnEdgeIds, distanceM: raceCircuit.distanceM, returnDistanceM: returnHighwayRoute?.distanceM || 0, namedRoads: raceCircuit.namedRoads, closed: raceCircuit.closed, waypoints: raceCircuit.waypoints || [] };
  scene.add(roadGroup);

  let disposed = false;
  const runtime = {
    areaId,
    document,
    network,
    navigationIndex,
    roadGroup,
    findNearestRoad,
    featuredRoadNames: routeManifest.namedRoads || [],
    minimap,
    selection,
    roadFeatures,
    areaEntrySigns,
    roadsideBuildings,
    connectorEdgeCount: selection.connectorSegmentCount ?? 0,
    playerRoute: createSpawnRoute(),
    raceCircuit,
    returnHighwayRoute,
    createCircuitTrafficRoute() {
      if (disposed) throw new Error("Road network runtime has been disposed");
      return raceCircuit;
    },
    createReturnHighwayTrafficRoute() {
      if (disposed) throw new Error("Road network runtime has been disposed");
      return returnHighwayRoute || raceCircuit;
    },
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
