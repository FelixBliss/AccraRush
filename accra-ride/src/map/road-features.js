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
    // Signals take precedence over generic crossing tags: OSM often records
    // crossing=traffic_signals on the same node as highway=traffic_signals.
    if (tags.highway === "traffic_signals" || tags.crossing === "traffic_signals") return "traffic_signals";
    if (tags.highway === "crossing" || tags.crossing) return "crossing";
    if (tags.highway === "stop") return "stop_sign";
    if (tags.highway === "give_way") return "give_way_sign";
    if (tags.highway === "mini_roundabout" || tags.junction === "roundabout") return "roundabout_island";
    if (tags.highway === "street_lamp") return "street_lamp";
    if (tags.highway === "bus_stop") return "bus_stop";
    if (tags.highway === "speed_camera") return "speed_camera";
    if (tags.barrier === "bollard") return "bollard";
    if (tags.traffic_calming) return "speed_hump";
    if (tags.traffic_sign || tags.maxspeed) {
      const sign = String(tags.traffic_sign ?? "").toLowerCase();
      const speed = String(tags.maxspeed ?? "").match(/[0-9]{1,3}/)?.[0]
        ?? sign.match(/(?:^|[:;_])([0-9]{1,3})(?:$|[:;_])/i)?.[1];
      if (speed) return "speed_limit";
      if (/roundabout|mini[_ -]?roundabout/.test(sign)) return "roundabout_sign";
      if (/no[_ -]?entry|noentry/.test(sign)) return "no_entry_sign";
      if (/one[_ -]?way|oneway/.test(sign)) return "one_way_sign";
      if (/give[_ -]?way|yield/.test(sign)) return "give_way_sign";
      if (/stop/.test(sign)) return "stop_sign";
      if (/pedestrian|crossing/.test(sign)) return "pedestrian_sign";
      if (/warning|danger|curve|bend|junction|children|school/.test(sign)) return "warning_sign";
      return "sign";
    }
    if (tags.man_made === "gantry") return "gantry";
    return null;
  }
  if (tags.man_made === "gantry") return "gantry";
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
    const px = a.x + sx * t, pz = a.z + sz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.dist) best = { dist: d, along: walked + len * t, dx: sx / len, dz: sz / len, px, pz };
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
    const mappedKind = f.osm?.tags ? classifyFeature(f.osm.tags, f.line ? "line" : "point") : null;
    kept.push({ ...f, kind: mappedKind ?? f.kind, side: f.side ?? side, edgeId: best.edge.id, wayId: best.edge.selection?.sourceWayId ?? best.edge.osm?.wayId,
      heading: f.heading ?? { x: best.near.dx, z: best.near.dz }, offsetM: Number(best.near.dist.toFixed(2)) });
  }
  return kept;
}

/**
 * Build approach signs only from real OSM roundabout/circular junction edges in
 * the selected graph. The sign is placed 12 m before the junction on each
 * directed incoming approach; outgoing directions are deliberately excluded.
 */
export function createRoundaboutApproachSignFeatures(network, setbackM = 12) {
  const roundabout = new Set(["roundabout", "circular"]);
  const roundaboutNodes = new Set();
  for (const edge of network?.edges ?? []) {
    if (!roundabout.has(edge.osm?.junction)) continue;
    roundaboutNodes.add(edge.fromNodeId);
    roundaboutNodes.add(edge.toNodeId);
  }
  if (!roundaboutNodes.size) return [];
  const generated = [], seen = new Set();
  const add = (edge, towardStart) => {
    const line = Array.isArray(edge.centerline) ? edge.centerline : [];
    if (line.length < 2) return;
    // Walk outwards from the roundabout node to find the sign position.
    const outward = towardStart ? line : [...line].reverse();
    const totalLength = outward.slice(1).reduce((sum, point, index) =>
      sum + Math.hypot(point.x - outward[index].x, point.z - outward[index].z), 0);
    if (totalLength < 0.5) return;
    // Short connector links still get a sign placed on their usable approach length.
    let remaining = Math.min(Math.max(1, setbackM), totalLength * 0.7), position = null, outwardHeading = null;
    for (let i = 1; i < outward.length; i++) {
      const a = outward[i - 1], b = outward[i];
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (length < 0.01) continue;
      if (remaining <= length) {
        const t = remaining / length;
        position = { x: a.x + dx * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + dz * t };
        outwardHeading = { x: dx / length, z: dz / length };
        break;
      }
      remaining -= length;
    }
    if (!position || !outwardHeading) return;
    const key = edge.id + ":" + (towardStart ? "start" : "end");
    if (seen.has(key)) return;
    seen.add(key);
    generated.push({
      id: "osm-roundabout-approach-" + key,
      kind: "roundabout_sign",
      position,
      heading: { x: -outwardHeading.x, z: -outwardHeading.z },
      side: -1,
      generatedFrom: "osm:junction=roundabout"
    });
  };
  for (const edge of network.edges ?? []) {
    if (roundabout.has(edge.osm?.junction)) continue;
    const directions = new Set((edge.lanes ?? []).map(lane => lane.direction));
    const forward = !directions.size || directions.has("forward") || directions.has("both");
    const reverse = !directions.size || directions.has("reverse") || directions.has("backward") || directions.has("both");
    if (roundaboutNodes.has(edge.toNodeId) && forward) add(edge, false);
    if (roundaboutNodes.has(edge.fromNodeId) && reverse) add(edge, true);
  }
  return generated;
}
