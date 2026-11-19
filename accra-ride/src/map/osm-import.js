/**
 * Convert tiled Overpass JSON (out body geom) into the AccraRush road graph contract.
 * Coordinates are projected locally to metres; source OSM IDs and tags are retained.
 */
const EARTH_RADIUS_M = 6371008.8;
const ROAD_CLASSES = new Set(["motorway","trunk","primary","secondary","tertiary","unclassified","residential","living_street","service","motorway_link","trunk_link","primary_link","secondary_link","tertiary_link"]);
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const coordKey = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;

function haversine(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat-a.lat)*rad, dLon = (b.lon-a.lon)*rad;
  const h = Math.sin(dLat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
function project(p, origin) {
  const rad = Math.PI / 180;
  return { x: EARTH_RADIUS_M*(p.lon-origin.lon)*rad*Math.cos(origin.lat*rad), y: 0, z: -EARTH_RADIUS_M*(p.lat-origin.lat)*rad };
}
function laneCount(tags) {
  const n = Number.parseInt(tags.lanes, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 8) : 2;
}
function widthFor(tags) {
  const w = Number.parseFloat(tags.width);
  return Number.isFinite(w) && w > 0 ? Math.min(w, 30) : 3.5;
}
function directions(tags) {
  if (tags.oneway === "-1") return ["reverse"];
  if (tags.oneway === "yes" || tags.oneway === "1" || tags.oneway === "true" || tags.junction === "roundabout") return ["forward"];
  return ["forward", "reverse"];
}

export function importOsmRoadNetwork({ areaId, elements, bounds, version = 1 }) {
  if (!areaId || !Array.isArray(elements) || !bounds) throw new Error("areaId, elements and bounds are required");
  const ways = new Map();
  for (const el of elements) {
    if (el?.type !== "way" || !el.tags?.highway || !ROAD_CLASSES.has(el.tags.highway) || !Array.isArray(el.geometry) || el.geometry.length < 2) continue;
    const geometry = el.geometry.filter(p => finite(p?.lat) && finite(p?.lon));
    if (geometry.length >= 2) ways.set(String(el.id), { id: String(el.id), tags: el.tags, geometry });
  }
  if (!ways.size) throw new Error(`No supported highway ways found for ${areaId}`);

  const occurrences = new Map();
  for (const way of ways.values()) {
    for (const p of way.geometry) {
      const key = coordKey(p);
      if (!occurrences.has(key)) occurrences.set(key, new Set());
      occurrences.get(key).add(way.id);
    }
  }
  const origin = { lat: (bounds.south+bounds.north)/2, lon: (bounds.west+bounds.east)/2 };
  const nodeMap = new Map(), edges = [];
  const nodeId = p => {
    const key = coordKey(p);
    if (!nodeMap.has(key)) nodeMap.set(key, { id: `osm-node-${key.replace(",", "_")}`, position: project(p, origin), osm: { lat: p.lat, lon: p.lon } });
    return nodeMap.get(key).id;
  };

  for (const way of ways.values()) {
    let segment = [way.geometry[0]], segmentIndex = 0;
    const splitAt = (p, index) => index === way.geometry.length-1 || index === 0 || (occurrences.get(coordKey(p))?.size ?? 0) > 1;
    for (let i=1; i<way.geometry.length; i++) {
      segment.push(way.geometry[i]);
      if (!splitAt(way.geometry[i], i)) continue;
      if (segment.length >= 2) {
        const fromNodeId = nodeId(segment[0]), toNodeId = nodeId(segment[segment.length-1]);
        const points = segment.map(p => project(p, origin));
        let lengthM = 0;
        for (let j=1;j<segment.length;j++) lengthM += haversine(segment[j-1], segment[j]);
        if (lengthM > 0.5 && fromNodeId !== toNodeId) {
          const edgeId = `osm-way-${way.id}-segment-${segmentIndex++}`;
          const dirs = directions(way.tags), lanesEach = Math.max(1, Math.ceil(laneCount(way.tags)/dirs.length));
          const lanes = dirs.map((direction, index) => ({ id: `${edgeId}-${direction}`, direction, widthM: widthFor(way.tags)*lanesEach }));
          edges.push({ id: edgeId, fromNodeId, toNodeId, lengthM, centerline: points, lanes,
            osm: { wayId: way.id, highway: way.tags.highway, name: way.tags.name ?? null, ref: way.tags.ref ?? null, surface: way.tags.surface ?? null, maxspeed: way.tags.maxspeed ?? null, oneway: way.tags.oneway ?? null } });
        }
      }
      segment = [way.geometry[i]];
    }
  }
  const nodes = [...nodeMap.values()];
  const degree = new Map(nodes.map(n => [n.id, 0]));
  for (const e of edges) { degree.set(e.fromNodeId, degree.get(e.fromNodeId)+1); degree.set(e.toNodeId, degree.get(e.toNodeId)+1); }
  const isolatedNodeCount = [...degree.values()].filter(d => d === 0).length;
  const adjacency = new Map(nodes.map(n => [n.id, []]));
  for (const e of edges) { adjacency.get(e.fromNodeId).push(e.toNodeId); adjacency.get(e.toNodeId).push(e.fromNodeId); }
  let components = 0; const visited = new Set();
  for (const n of nodes) if (!visited.has(n.id)) {
    components++; const stack=[n.id]; visited.add(n.id);
    while(stack.length) for(const next of adjacency.get(stack.pop()) ?? []) if(!visited.has(next)){visited.add(next);stack.push(next);}
  }
  return {
    id: `accrarush-${areaId}-osm`, version, source: { provider:"OpenStreetMap", license:"ODbL-1.0", attribution:"© OpenStreetMap contributors", retrievedAt:new Date().toISOString(), bounds },
    projection: { type:"local-equirectangular", origin }, nodes, edges,
    diagnostics: { osmWays:ways.size, nodeCount:nodes.length, edgeCount:edges.length, connectedComponents:components, isolatedNodeCount,
      deadEndNodeCount:[...degree.values()].filter(d=>d===1).length, junctionNodeCount:[...degree.values()].filter(d=>d>=3).length,
      highwayClassCounts:[...ways.values()].reduce((a,w)=>(a[w.tags.highway]=(a[w.tags.highway]??0)+1,a),{}) }
  };
}

export function mergeOverpassTiles(tileResponses) {
  const ways = new Map();
  for (const response of tileResponses) {
    if (!Array.isArray(response?.elements)) throw new Error("Every Overpass tile must contain an elements array");
    for (const element of response.elements) if (element?.type === "way") ways.set(String(element.id), element);
  }
  return [...ways.values()];
}
