import {
  buildNavigationIndex,
  createRandomDirectedRoute,
  sampleDirectedRoute,
  buildClosedCircuitRoute,
  buildDirectedRoute
} from "./road-navigation.js";
import { createRoadMeshes } from "./three-road-renderer.js";
import { projectToLocal, selectRoadFeatures } from "./road-features.js";
import { createRoadFeatureMeshes } from "./road-feature-renderer.js";
import { buildBusStopAccessEdges, buildPickupAccessEdges } from "./roadside-access.js";
import { applyRoadElevationProfile } from "./road-elevation.js";
import { createRoadTerrainMesh } from "./road-terrain.js";
import { buildMapModel, selectCircuitRoadGraph, selectHighwayRouteGraph } from "./selected-road-graph.js";

function authorCrossingSignals(network, features) {
  const existing = (features || []).filter(feature => feature.kind === "traffic_signals" && feature.position);
  const authored = [], chosen = existing.map(feature => feature.position);
  const signalRoads = new Set(["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link", "tertiary"]);
  for (const crossing of (features || []).filter(feature => feature.kind === "crossing" && feature.roadAnchor && feature.heading)) {
    const edge = network.edges.find(item => item.id === crossing.edgeId);
    if (!edge || !signalRoads.has(edge.osm?.highway) || (edge.lanes || []).length < 2) continue;
    const anchor = crossing.roadAnchor;
    if (chosen.some(point => Math.hypot(point.x - anchor.x, point.z - anchor.z) < 45)) continue;
    authored.push({
      id: "accrarush-authored-crossing-signal-" + crossing.id,
      kind: "traffic_signals", authored: true,
      position: { x: anchor.x, y: anchor.y, z: anchor.z },
      edgeId: crossing.edgeId, wayId: crossing.wayId, side: crossing.side || -1,
      offsetM: 0, heading: crossing.heading, roadAnchor: anchor,
      source: "AccraRush-authored three-aspect vehicle signals at a mapped zebra crossing"
    });
    chosen.push(anchor);
  }
  return { features: authored, count: authored.length };
}

function authorPedestrianBridges(network, features, areaId) {
  const mapped = (features || []).filter(feature => feature.kind === "pedestrian_bridge");
  const authored = [], confirmed = [];
  const majorRoads = new Set(["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link"]);
  const widthFor = edge => (edge.lanes || []).reduce((sum, lane) => sum + (lane.widthM || 3.5), 0);
  const shoulderFor = edge => ({
    motorway: 1, motorway_link: 0.55, trunk: 0.9, trunk_link: 0.55,
    primary: 0.65, primary_link: 0.45
  }[edge.osm?.highway] || 0);
  const featureDistance = (feature, point) => {
    if (feature.position) return Math.hypot(feature.position.x - point.x, feature.position.z - point.z);
    let best = Infinity;
    const line = feature.line || [];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], dx = b.x - a.x, dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq));
      best = Math.min(best, Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t)));
    }
    return best;
  };

  // These two footbridge locations were explicitly confirmed for the Lapaz
  // corridor. They are authored only when no mapped bridge already represents
  // the same location; their deck elevation is relative to the DEM-aligned road.
  if (areaId === "lapaz" && network.projection?.origin) {
    const locations = [
      { id: "lapaz-confirmed-bridge-01", lat: 5.607778351937281, lon: -0.24613031648589523 },
      { id: "lapaz-confirmed-bridge-02", lat: 5.60930426650831, lon: -0.238222386448117 }
    ];
    for (const location of locations) {
      const point = projectToLocal(location.lat, location.lon, network.projection.origin);
      if (mapped.some(feature => featureDistance(feature, point) < 18) ||
          confirmed.some(feature => featureDistance(feature, point) < 18)) continue;

      let nearest = null;
      for (const edge of network.edges) {
        if (!majorRoads.has(edge.osm?.highway) || (edge.lanes || []).length < 3 ||
            !Array.isArray(edge.centerline) || edge.centerline.length < 2) continue;
        for (let i = 1; i < edge.centerline.length; i++) {
          const a = edge.centerline[i - 1], b = edge.centerline[i];
          const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
          if (length < 0.5) continue;
          const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (length * length)));
          const anchor = {
            x: a.x + dx * t, y: a.y + (b.y - a.y) * t, z: a.z + dz * t,
            heading: { x: dx / length, z: dz / length }
          };
          const distance = Math.hypot(point.x - anchor.x, point.z - anchor.z);
          if (!nearest || distance < nearest.distance) nearest = { edge, anchor, distance };
        }
      }
      if (!nearest || nearest.distance > 22) continue;

      const { edge, anchor, distance } = nearest;
      const heading = anchor.heading, nx = -heading.z, nz = heading.x;
      const baseWidth = widthFor(edge);
      let minAcross = -baseWidth / 2, maxAcross = baseWidth / 2;
      // Include all parallel carriageways in the local crossing span. The
      // renderer then builds one deck across the complete divided corridor.
      for (const candidate of network.edges) {
        if (!majorRoads.has(candidate.osm?.highway) ||
            !Array.isArray(candidate.centerline) || candidate.centerline.length < 2) continue;
        const candidateWidth = widthFor(candidate) + shoulderFor(candidate);
        for (let i = 1; i < candidate.centerline.length; i++) {
          const a = candidate.centerline[i - 1], b = candidate.centerline[i];
          const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
          if (length < 0.5 || Math.abs((dx / length) * heading.x + (dz / length) * heading.z) < 0.72) continue;
          const t = Math.max(0, Math.min(1, ((anchor.x - a.x) * dx + (anchor.z - a.z) * dz) / (length * length)));
          const px = a.x + dx * t, pz = a.z + dz * t;
          if (Math.hypot(anchor.x - px, anchor.z - pz) > 65) continue;
          const across = (px - anchor.x) * nx + (pz - anchor.z) * nz;
          minAcross = Math.min(minAcross, across - candidateWidth / 2);
          maxAcross = Math.max(maxAcross, across + candidateWidth / 2);
        }
      }
      const startM = minAcross - 2, endM = maxAcross + 2;
      confirmed.push({
        id: "accrarush-confirmed-pedestrian-bridge-" + location.id,
        kind: "pedestrian_bridge", authored: true,
        position: { x: anchor.x, y: anchor.y, z: anchor.z },
        line: [
          { x: anchor.x + nx * startM, y: anchor.y, z: anchor.z + nz * startM },
          { x: anchor.x + nx * endM, y: anchor.y, z: anchor.z + nz * endM }
        ],
        edgeId: edge.id, wayId: "user-confirmed-coordinate",
        heading, roadAnchor: { x: anchor.x, y: anchor.y, z: anchor.z },
        side: 0, offsetM: Number(distance.toFixed(2)),
        source: "User-confirmed Lapaz pedestrian-bridge coordinate; deck is elevated relative to the DEM-aligned road"
      });
    }
  }

  authored.push(...confirmed);
  const chosen = [...mapped, ...confirmed].map(feature => {
    if (feature.position) return feature.position;
    const line = feature.line || [];
    return line.length ? line[Math.floor(line.length / 2)] : null;
  }).filter(Boolean);

  // Keep the previous sparse crossing-based fallback, but only after the
  // confirmed locations have been considered and only where mapped coverage
  // remains low. This does not fabricate extra bridges at arbitrary road ends.
  if (mapped.length + confirmed.length < 4) {
    const candidates = (features || []).filter(feature => feature.kind === "crossing" &&
      feature.position && feature.roadAnchor && feature.heading)
      .map(feature => ({ feature, edge: network.edges.find(edge => edge.id === feature.edgeId) }))
      .filter(item => item.edge && majorRoads.has(item.edge.osm?.highway) &&
        (item.edge.lanes || []).length >= 3)
      .sort((a, b) => a.feature.position.x - b.feature.position.x || a.feature.position.z - b.feature.position.z);
    for (const { feature, edge } of candidates) {
      if (mapped.length + authored.length >= 6) break;
      if (chosen.some(point => Math.hypot(point.x - feature.position.x, point.z - feature.position.z) < 900)) continue;
      const anchor = feature.roadAnchor, heading = feature.heading;
      const nx = -heading.z, nz = heading.x;
      const baseWidth = widthFor(edge);
      let minAcross = -baseWidth / 2, maxAcross = baseWidth / 2;
      for (const candidate of network.edges) {
        if (!majorRoads.has(candidate.osm?.highway) || !candidate.centerline?.length) continue;
        const width = widthFor(candidate) + shoulderFor(candidate);
        for (let i = 1; i < candidate.centerline.length; i++) {
          const a = candidate.centerline[i - 1], b = candidate.centerline[i];
          const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
          if (length < 0.5 || Math.abs((dx / length) * heading.x + (dz / length) * heading.z) < 0.72) continue;
          const t = Math.max(0, Math.min(1, ((anchor.x - a.x) * dx + (anchor.z - a.z) * dz) / (length * length)));
          const px = a.x + dx * t, pz = a.z + dz * t;
          if (Math.hypot(anchor.x - px, anchor.z - pz) > 65) continue;
          const across = (px - anchor.x) * nx + (pz - anchor.z) * nz;
          minAcross = Math.min(minAcross, across - width / 2);
          maxAcross = Math.max(maxAcross, across + width / 2);
        }
      }
      const startM = minAcross - 2, endM = maxAcross + 2;
      authored.push({
        id: "accrarush-authored-pedestrian-bridge-" + feature.id,
        kind: "pedestrian_bridge", authored: true,
        position: { x: anchor.x, y: anchor.y, z: anchor.z },
        line: [
          { x: anchor.x + nx * startM, y: anchor.y, z: anchor.z + nz * startM },
          { x: anchor.x + nx * endM, y: anchor.y, z: anchor.z + nz * endM }
        ],
        edgeId: feature.edgeId, wayId: feature.wayId, side: feature.side,
        heading: feature.heading, roadAnchor: anchor,
        source: "AccraRush-authored pedestrian bridge at a mapped major-road crossing"
      });
      chosen.push(feature.position);
    }
  }
  return { features: authored, count: authored.length, confirmedCount: confirmed.length };
}

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

  // Lapaz now loads the approved point-to-point highway corridor; Accra Central
  // retains its existing independently scoped circuit until a later route is approved.
  const isHighwayCorridor = areaId === "lapaz";
  const manifestPath = isHighwayCorridor
    ? "./data/osm/lapaz-madina-route.json?v=lapaz-madina-20261125a"
    : "./data/osm/" + areaId + ".candidate-race-circuit.json?v=phase1-20261124b";
  const routeResponse = await fetcher(manifestPath, { cache: "no-store" });
  if (!routeResponse?.ok) throw new Error("Could not load " + (isHighwayCorridor ? "Lapaz–Madina highway route" : areaId + " race circuit") +
    " (HTTP " + (routeResponse?.status ?? "unknown") + ")");
  const routeManifest = await routeResponse.json();
  const selected = isHighwayCorridor
    ? selectHighwayRouteGraph(sourceNetwork, routeManifest)
    : selectCircuitRoadGraph(sourceNetwork, routeManifest);
  const { network, report: selection } = selected;
  if (!selection.connected) throw new Error("OSM route graph for " + areaId + " is not connected");
  let elevationProfile = { available: false, appliedNodes: 0, appliedEdges: 0 };
  if (isHighwayCorridor) {
    try {
      const elevationResponse = await fetcher("./data/osm/lapaz-elevation.json?v=lapaz-dem-v1", { cache: "no-store" });
      if (elevationResponse?.ok) elevationProfile = applyRoadElevationProfile(network, await elevationResponse.json());
    } catch { /* the route remains playable on its source flat profile until a valid DEM file exists */ }
  }
  let featureDocumentAvailable = false;
  let matchedRoadFeatures = [];
  let authoredPedestrianBridgeCount = 0;
  let confirmedPedestrianBridgeCount = 0;
  let authoredCrossingSignalCount = 0;
  try {
    const featureResponse = await fetcher("./data/osm/" + areaId + ".features.json?v=lapaz-infrastructure-v2", { cache: "no-store" });
    if (featureResponse?.ok) {
      featureDocumentAvailable = true;
      matchedRoadFeatures = selectRoadFeatures(await featureResponse.json(), network);
      const authoredSignals = authorCrossingSignals(network, matchedRoadFeatures);
      matchedRoadFeatures.push(...authoredSignals.features);
      authoredCrossingSignalCount = authoredSignals.count;
      const authoredBridges = authorPedestrianBridges(network, matchedRoadFeatures, areaId);
      matchedRoadFeatures.push(...authoredBridges.features);
      authoredPedestrianBridgeCount = authoredBridges.count;
      confirmedPedestrianBridgeCount = authoredBridges.confirmedCount;
    }
  } catch { /* mapped features are optional; core route loading remains available */ }
  const busStopAccess = buildBusStopAccessEdges(network, matchedRoadFeatures);
  network.edges.push(...busStopAccess.edges);
  const mappedPickupCount = matchedRoadFeatures.filter(feature => feature.kind === "pickup_zone").length;
  if (mappedPickupCount < 3) {
    // OSM does not consistently map informal taxi pickup points. Where fewer
    // than three taxi ranks/platforms are mapped, author a sparse fallback at
    // every fifth usable bus-stop location, on the opposite side of its bus bay.
    const candidates = matchedRoadFeatures.filter(feature => feature.kind === "bus_stop" &&
      feature.accessBay && feature.roadAnchor && feature.heading).sort((a, b) => a.roadAnchor.alongM - b.roadAnchor.alongM);
    const authored = [];
    for (let i = 0; i < candidates.length; i += 5) {
      const source = candidates[i], edge = network.edges.find(item => item.id === source.edgeId);
      if (!edge?.centerline?.length) continue;
      const cumulative = [0];
      for (let p = 1; p < edge.centerline.length; p++) {
        cumulative.push(cumulative[p - 1] + Math.hypot(edge.centerline[p].x - edge.centerline[p - 1].x,
          edge.centerline[p].z - edge.centerline[p - 1].z));
      }
      const total = cumulative.at(-1), originalM = source.roadAnchor.alongM;
      let targetM = originalM + 70;
      if (targetM > total - 22) targetM = originalM - 70;
      if (targetM < 22 || targetM > total - 22) continue;
      let segment = 1;
      while (segment < cumulative.length - 1 && cumulative[segment] < targetM) segment++;
      const a = edge.centerline[segment - 1], b = edge.centerline[segment];
      const span = cumulative[segment] - cumulative[segment - 1];
      const t = span > 0 ? (targetM - cumulative[segment - 1]) / span : 0;
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1;
      const heading = { x: dx / length, z: dz / length };
      const anchor = { x: a.x + dx * t, y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * t,
        z: a.z + dz * t, alongM: targetM };
      const side = source.side, offsetM = Math.max(4.5, source.offsetM || 0);
      const nx = -heading.z, nz = heading.x;
      authored.push({
        ...source, id: "accrarush-authored-pickup-" + source.id, kind: "pickup_zone",
        side, offsetM, heading, roadAnchor: anchor,
        position: { x: anchor.x + nx * side * offsetM, y: anchor.y,
          z: anchor.z + nz * side * offsetM },
        accessBay: false, accessBayType: "pickup", authored: true,
        source: "AccraRush-authored fallback; separate pull-off downstream of the mapped bus stop"
      });
      if (mappedPickupCount + authored.length >= 8) break;
    }
    matchedRoadFeatures.push(...authored);
  }
  const pickupAccess = buildPickupAccessEdges(network, matchedRoadFeatures);
  network.edges.push(...pickupAccess.edges);

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
  const signalNodeIds = new Set();
  for (const feature of matchedRoadFeatures.filter(item => item.kind === "traffic_signals" && item.position)) {
    let nearest = null, nearestDistance = 10;
    for (const node of network.nodes) {
      const distance = Math.hypot(node.position.x - feature.position.x, node.position.z - feature.position.z);
      if (distance < nearestDistance) { nearestDistance = distance; nearest = node; }
    }
    if (nearest) signalNodeIds.add(nearest.id);
  }
  const roadGroup = createRoadMeshes(THREE, network, { signalNodeIds });
  roadGroup.renderOrder = 1;
  const terrainGroup = isHighwayCorridor ? createRoadTerrainMesh(THREE, network) : null;
  if (isHighwayCorridor && !terrainGroup) throw new Error("Lapaz–Madina DEM terrain could not be built; refusing to render elevated roads over a flat ground plane");
  if (terrainGroup) scene.add(terrainGroup);

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
        const length = Math.sqrt(lengthSq), forwardX = dx / length, forwardZ = dz / length;
        const leftX = -forwardZ, leftZ = forwardX;
        const roadWidthM = (edge.lanes || []).reduce((sum, lane) => sum + (Number.isFinite(lane.widthM) ? lane.widthM : 3.5), 0) || 6;
        const projectedX = a.x + dx * t, projectedZ = a.z + dz * t;
        const candidate = {
          edge, distanceM: distance, x: projectedX, z: projectedZ,
          y: a.y + (b.y - a.y) * t,
          lateralOffsetM: (x - projectedX) * leftX + (z - projectedZ) * leftZ,
          roadWidthM, leftX, leftZ,
          pitchRad: Math.atan2(b.y - a.y, length), forwardX, forwardZ
        };
        if (distance < bestDistance) { bestDistance = distance; best = candidate; }
        if (edge.osm?.name && distance < bestNamedDistance) { bestNamedDistance = distance; bestNamed = candidate; }
      }
    }
    // Driving and junction selection use the geometrically nearest OSM edge.
    // This prevents a nearby named highway from masking a real branch-road exit.
    return best;
  }
  // Render mapped OSM infrastructure after DEM alignment and connected bus-bay road generation.
  let roadFeatures = { available: featureDocumentAvailable, matched: matchedRoadFeatures.length, counts: {}, items: matchedRoadFeatures };
  if (featureDocumentAvailable) {
    try {
      const featureGroup = createRoadFeatureMeshes(THREE, matchedRoadFeatures, network);
      roadGroup.add(featureGroup);
      roadFeatures = { ...roadFeatures, counts: featureGroup.userData.counts };
    } catch { /* optional visual infrastructure must not prevent route startup */ }
  }
  const minimap = buildMapModel(network, areaId);
  const outboundEdgeIds = raceCircuit.steps.map(step => step.edgeId);
  const returnEdgeIds = returnHighwayRoute?.steps.map(step => step.edgeId) || [];
  if (isHighwayCorridor) {
    const startNode = network.nodes.find(node => node.id === routeManifest.startNodeId);
    const endNode = network.nodes.find(node => node.id === routeManifest.endNodeId);
    if (!startNode || !endNode) throw new Error("Lapaz–Madina minimap endpoints are missing from the selected route graph");
    // Display only the single Lapaz-to-Madina outbound spine. Return-direction
    // carriageways remain in the playable graph for traffic, but are not drawn
    // as apparent side branches on the route map.
    const outboundIds = new Set(outboundEdgeIds);
    minimap.roads = minimap.roads.filter(road => outboundIds.has(road.id));
    const points = minimap.roads.flatMap(road => road.centerline);
    if (!points.length) throw new Error("Lapaz-to-Madina outbound map has no road geometry");
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
    terrainGroup,
    findNearestRoad,
    featuredRoadNames: routeManifest.namedRoads || [],
    minimap,
    selection,
    roadFeatures,
    elevationProfile,
    busStopAccess: busStopAccess.report,
    pickupAccess: pickupAccess.report,
    authoredPedestrianBridgeCount,
    confirmedPedestrianBridgeCount,
    authoredCrossingSignalCount,
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
      if (terrainGroup) {
        scene.remove(terrainGroup);
        terrainGroup.geometry?.dispose?.();
        terrainGroup.material?.dispose?.();
      }
      roadGroup.traverse(object => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
        else object.material?.dispose?.();
      });
    }
  };
  return runtime;
}
