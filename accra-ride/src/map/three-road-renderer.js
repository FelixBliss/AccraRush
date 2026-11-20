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

function offsetPoint(a, b, offset) {
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
  return { x: -dz / len * offset, z: dx / len * offset };
}

export function createRoadMeshes(THREE, network, options = {}) {
  if (!THREE?.BufferGeometry || !THREE?.Mesh || !Array.isArray(network?.edges)) {
    throw new Error("Three.js and a valid road network are required");
  }
  const group = new THREE.Group();
  const batches = new Map();
  const markingVertices = [];
  let renderedEdges = 0;

  for (const edge of network.edges) {
    const points = edge.centerline;
    if (!Array.isArray(points) || points.length < 2) continue;
    const type = roadClass(edge);
    if (!batches.has(type)) batches.set(type, { vertices: [], indices: [], material: null });
    const batch = batches.get(type);
    const half = roadWidth(edge) / 2;
    const base = batch.vertices.length / 3;

    for (let i = 0; i < points.length; i++) {
      const previous = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const offset = offsetPoint(previous, next, half);
      const p = points[i];
      batch.vertices.push(p.x + offset.x, p.y + 0.025, p.z + offset.z);
      batch.vertices.push(p.x - offset.x, p.y + 0.025, p.z - offset.z);
      if (i > 0) {
        const n = base + i * 2;
        batch.indices.push(n - 2, n, n - 1, n - 1, n, n + 1);
      }
    }

    const twoWay = edge.lanes?.some(lane => lane.direction === "forward") &&
      edge.lanes?.some(lane => lane.direction === "reverse");
    if (twoWay) {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        markingVertices.push(a.x, a.y + 0.045, a.z, b.x, b.y + 0.045, b.z);
      }
    }
    renderedEdges++;
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
    networkId: network.id,
    batched: true
  };
  return group;
}
