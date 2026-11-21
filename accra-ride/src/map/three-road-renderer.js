/**
 * Batched Three.js road renderer.
 * Roads are grouped by OSM class to keep draw calls low for city-scale networks.
 */
const CLASS_WIDTH = {
  motorway: 14, trunk: 12, trunk_link: 10, primary: 10, primary_link: 9,
  secondary: 8, secondary_link: 7, tertiary: 7, tertiary_link: 6.5,
  residential: 6, unclassified: 6, living_street: 5, service: 4.5
};
const CLASS_COLORS = {
  motorway: 0x55585a, trunk: 0x50565a, trunk_link: 0x50565a,
  primary: 0x4a5054, primary_link: 0x4a5054,
  secondary: 0x454b4f, secondary_link: 0x454b4f,
  tertiary: 0x3e4549, tertiary_link: 0x3e4549,
  residential: 0x363d41, unclassified: 0x363d41,
  living_street: 0x42484b, service: 0x4a4f52
};
const roadWidth = edge => {
  const mapped = CLASS_WIDTH[edge.osm?.highway] ?? 6;
  const laneWidth = Array.isArray(edge.lanes)
    ? edge.lanes.reduce((sum, lane) => sum + (Number.isFinite(lane.widthM) ? lane.widthM : 0), 0)
    : 0;
  return Math.max(mapped, laneWidth);
};
const roadClass = edge => CLASS_WIDTH[edge.osm?.highway] ? edge.osm.highway : "residential";
const materialFor = (THREE, color) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
import { buildRoadRibbon, buildJunctionPatch, appendRibbonTriangles, appendJunctionTriangles } from "./road-geometry.js";

function endpointDirection(item) {
  const points=item.ribbon.points;
  const node=item.atStart?points[0]:points[points.length-1];
  const adjacent=item.atStart?points[1]:points[points.length-2];
  const dx=adjacent.x-node.x,dz=adjacent.z-node.z,length=Math.hypot(dx,dz);
  return length>1e-8?{x:dx/length,z:dz/length}:null;
}

function requiresJunctionPatch(incidents) {
  if(incidents.length>=3) return true;
  if(incidents.length!==2) return false;
  const [a,b]=incidents;
  if(Math.abs((a.widthM??0)-(b.widthM??0))>0.25) return true;
  const da=endpointDirection(a),db=endpointDirection(b);
  if(!da||!db) return false;
  // A straight degree-two continuation has outward tangents in opposite directions.
  // Only construct a node patch when the two road arms genuinely change direction.
  return da.x*db.x+da.z*db.z>-0.995;
}

export function createRoadMeshes(THREE, network, options = {}) {
  if (!THREE?.BufferGeometry || !THREE?.Mesh || !Array.isArray(network?.edges)) {
    throw new Error("Three.js and a valid road network are required");
  }
  const group = new THREE.Group();
  const batches = new Map();
  const markingVertices = [];
  let renderedEdges = 0;
  let junctionPatchCount = 0;
  let junctionCandidateCount = 0;

  const incidentByNode = new Map();
  for (const edge of network.edges) {
    const points = edge.centerline;
    if (!Array.isArray(points) || points.length < 2) continue;
    const type = roadClass(edge);
    if (!batches.has(type)) batches.set(type, { vertices: [], indices: [], material: null });
    const batch = batches.get(type);
    const ribbon = buildRoadRibbon(points, roadWidth(edge));
    appendRibbonTriangles(batch, ribbon);
    if (edge.fromNodeId) {
      if (!incidentByNode.has(edge.fromNodeId)) incidentByNode.set(edge.fromNodeId, []);
      incidentByNode.get(edge.fromNodeId).push({ ribbon, atStart: true, type, widthM: roadWidth(edge) });
    }
    if (edge.toNodeId) {
      if (!incidentByNode.has(edge.toNodeId)) incidentByNode.set(edge.toNodeId, []);
      incidentByNode.get(edge.toNodeId).push({ ribbon, atStart: false, type, widthM: roadWidth(edge) });
    }
    const twoWay = edge.lanes?.some(lane => lane.direction === "forward") && edge.lanes?.some(lane => lane.direction === "reverse");
    if (twoWay) for (let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i]; markingVertices.push(a.x,a.y+.045,a.z,b.x,b.y+.045,b.z);
    }
    renderedEdges++;
  }
  const nodeById = new Map((network.nodes ?? []).map(node => [node.id, node.position ?? node]));
  for (const [nodeId, incidents] of incidentByNode) {
    if (!requiresJunctionPatch(incidents)) continue;
    junctionCandidateCount++;
    const node=nodeById.get(nodeId); if(!node) continue;
    const patch=buildJunctionPatch(node,incidents); if(!patch) continue;
    const type=incidents[0]?.type ?? "residential";
    appendJunctionTriangles(batches.get(type),patch);
    junctionPatchCount++;
  }

  for (const [type, batch] of batches) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(batch.vertices, 3));
    geometry.setIndex(batch.indices);
    geometry.computeVertexNormals();
    const material = options.roadMaterial ?? materialFor(THREE, CLASS_COLORS[type] ?? 0x363d41);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "osm-roads:" + type;
    mesh.userData = { highwayClass: type };
    group.add(mesh);
  }

  if (markingVertices.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(markingVertices, 3));
    const material = options.markingMaterial ?? new THREE.LineBasicMaterial({ color: 0xd8cfa8, transparent: true, opacity: 0.72 });
    const markings = new THREE.LineSegments(geometry, material);
    markings.name = "osm-road-centre-markings";
    group.add(markings);
  }

  group.userData = {
    roadMeshCount: batches.size,
    edgeCount: renderedEdges,
    junctionCandidateCount,
    junctionPatchCount,
    junctionNodeCount: incidentByNode.size,
    networkId: network.id,
    batched: true
  };
  return group;
}
