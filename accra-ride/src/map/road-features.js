/**
 * Real OSM roadside/point features for the selected-road graph.
 *
 * Features (zebra crossings, traffic signals, stop/give-way and other signs,
 * guard rails and similar barriers) come from data/osm/<area>.features.json,
 * which is extracted from the same Geofabrik PBF as the road network by
 * scripts/import-osm-features.js. Nothing here invents a feature: a feature is kept
 * only if it lies on or beside an edge of the selected graph, and is placed at its
 * real OSM position.
 */
const EARTH_RADIUS_M = 6371008.8;

export function projectToLocal(lat, lon, origin) {
  const rad = Math.PI / 180;
  return {
    x: EARTH_RADIUS_M * (lon - origin.lon) * rad * Math.cos(origin.lat * rad),
    y: 0,
    z: -EARTH_RADIUS_M * (lat - origin.lat) * rad
  };
}

// Classify raw OSM tags into a renderable feature kind, or null.
export function classifyFeature(tags = {}, geometry = "point") {
  if (geometry === "point") {
    if (tags.highway === "crossing" || tags.crossing) return "crossing";
    if (tags.highway === "traffic_signals" || tags.crossing === "traffic_signals") return "traffic_signals";
    if (tags.highway === "stop") return "stop_sign";
    if (tags.highway === "give_way") return "give_way_sign";
    if (tags.traffic_sign) return "sign";
    if (tags.man_made === "gantry") return "gantry";
    if (tags.highway === "street_lamp") return "street_lamp";
    if (tags.highway === "bus_stop") return "bus_stop";
    if (tags.highway === "speed_camera") return "speed_camera";
    if (tags.barrier === "bollard") return "bollard";
    if (tags.traffic_calming) return "speed_hump";
    return null;
  }
  if (tags.man_made === "gantry") return "gantry";
  if (tags.highway === "footway" && tags.bridge && tags.bridge !== "no") return "pedestrian_bridge";
  if (tags.highway === "footway" && tags.footway === "sidewalk") return "sidewalk";
  if (["guard_rail", "jersey_barrier", "cable_barrier", "fence", "wall", "kerb"].includes(tags.barrier)) {
    return tags.barrier === "fence" || tags.barrier === "wall" || tags.barrier === "kerb" ? null : "barrier";
  }
  return null;
}

function nearestOnPolyline(line, x, z) {
  let best = { dist: Infinity, t: 0, dx: 1, dz: 0, px: 0, pz: 0 };
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const sx = b.x - a.x, sz = b.z - a.z, len2 = sx * sx + sz * sz;
    const len = Math.sqrt(len2);
    if (len < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - a.x) * sx + (z - a.z) * sz) / len2));
    const px = a.x + sx * t, py = a.y + (b.y - a.y) * t, pz = a.z + sz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.dist) best = { dist: d, along: walked + len * t, dx: sx / len, dz: sz / len, px, py, pz };
    walked += len;
  }
  return best;
}

/**
 * Keep only features on/next to the selected graph and attach the edge they belong to.
 * Point features within `snapM` of an edge centreline are kept; barrier lines are kept
 * when their middle vertex lies within `lineSnapM` of one.
 */
export function selectRoadFeatures(featureDocument, network, { snapM = 14, lineSnapM = 22 } = {}) {
  const features = featureDocument?.features;
  if (!Array.isArray(features) || !features.length) return [];
  const edges = network.edges.filter(e => e.centerline?.length >= 2);
  const cell = 80, grid = new Map();
  edges.forEach((e, i) => {
    // Index every grid cell crossed by each segment, not only cells containing
    // OSM vertices. Sparse long ways can otherwise be invisible to nearby-feature
    // lookups between their endpoints.
    const seen = new Set();
    for (let j = 1; j < e.centerline.length; j++) {
      const a = e.centerline[j - 1], b = e.centerline[j];
      const minX = Math.floor(Math.min(a.x, b.x) / cell);
      const maxX = Math.floor(Math.max(a.x, b.x) / cell);
      const minZ = Math.floor(Math.min(a.z, b.z) / cell);
      const maxZ = Math.floor(Math.max(a.z, b.z) / cell);
      for (let gx = minX; gx <= maxX; gx++) {
        for (let gz = minZ; gz <= maxZ; gz++) {
          const key = gx + "," + gz;
          if (seen.has(key)) continue;
          seen.add(key);
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(i);
        }
      }
    }
  });
  const candidates = (x, z, r) => {
    const out = new Set();
    for (let gx = Math.floor((x - r) / cell); gx <= Math.floor((x + r) / cell); gx++)
      for (let gz = Math.floor((z - r) / cell); gz <= Math.floor((z + r) / cell); gz++)
        for (const i of grid.get(gx + "," + gz) || []) out.add(i);
    return out;
  };
  const kept = [];
  for (const f of features) {
    const probe = f.line?.length ? f.line[Math.floor(f.line.length / 2)] : f.position;
    if (!probe || !Number.isFinite(probe.x)) continue;
    const limit = f.line ? lineSnapM : snapM;
    let best = null;
    for (const i of candidates(probe.x, probe.z, limit)) {
      const near = nearestOnPolyline(edges[i].centerline, probe.x, probe.z);
      if (near.dist <= limit && (!best || near.dist < best.near.dist)) best = { edge: edges[i], near };
    }
    if (!best) continue;
    const lx = -best.near.dz, lz = best.near.dx;
    const side = (probe.x - best.near.px) * lx + (probe.z - best.near.pz) * lz >= 0 ? 1 : -1; // +1 = left of travel
    const position = f.position ? { ...f.position, y: best.near.py } : f.position;
    const line = f.line ? f.line.map(point => {
      const nearest = nearestOnPolyline(best.edge.centerline, point.x, point.z);
      return { ...point, y: nearest?.py ?? best.near.py };
    }) : f.line;
    kept.push({ ...f, position, line, side, edgeId: best.edge.id, wayId: best.edge.selection?.sourceWayId ?? best.edge.osm?.wayId,
      heading: { x: best.near.dx, z: best.near.dz }, offsetM: Number(best.near.dist.toFixed(2)) });
  }
  return kept;
}
