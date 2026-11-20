import {
  buildNavigationIndex,
  createRandomDirectedRoute,
  sampleDirectedRoute
} from "./road-navigation.js";
import { createRoadMeshes } from "./three-road-renderer.js";

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
  const network = document?.network;
  if (!network?.nodes?.length || !network?.edges?.length) throw new Error("The " + areaId + " road network is empty");

  const navigationIndex = buildNavigationIndex(network);
  const roadGroup = createRoadMeshes(THREE, network);
  scene.add(roadGroup);

  let disposed = false;
  const runtime = {
    areaId,
    document,
    network,
    navigationIndex,
    roadGroup,
    playerRoute: createRandomDirectedRoute(navigationIndex, { stepCount: playerRouteSteps }),
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
