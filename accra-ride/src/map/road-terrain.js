/**
 * DEM-derived terrain for the selected OSM road graph.
 *
 * Road elevations alone do not make a landscape: the old scene used one flat
 * green plane, so roads climbed away from it and appeared to float. This builds
 * a lightweight interpolated ground mesh from the same DEM-backed road nodes,
 * then cuts a shallow, continuous road corridor beneath the asphalt.
 */
const finite = value => typeof value === "number" && Number.isFinite(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function segmentBuckets(edges, cellSize) {
  const buckets = new Map();
  const key = (x, z) => Math.floor(x / cellSize) + ":" + Math.floor(z / cellSize);
  for (const edge of edges) {
    const points = edge.centerline || [];
    const roadHalfWidth = Math.max(2, (edge.lanes || []).reduce((sum, lane) => sum + (lane.widthM || 3.5), 0) / 2);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const dx = b.x - a.x, dz = b.z - a.z, lengthSq = dx * dx + dz * dz;
      if (!(lengthSq > 0)) continue;
      const segment = { a, b, dx, dz, lengthSq, roadHalfWidth };
      const minX = Math.floor((Math.min(a.x, b.x) - roadHalfWidth - 20) / cellSize);
      const maxX = Math.floor((Math.max(a.x, b.x) + roadHalfWidth + 20) / cellSize);
      const minZ = Math.floor((Math.min(a.z, b.z) - roadHalfWidth - 20) / cellSize);
      const maxZ = Math.floor((Math.max(a.z, b.z) + roadHalfWidth + 20) / cellSize);
      for (let gx = minX; gx <= maxX; gx++) for (let gz = minZ; gz <= maxZ; gz++) {
        const k = gx + ":" + gz, list = buckets.get(k) || [];
        list.push(segment); buckets.set(k, list);
      }
    }
  }
  return { buckets, key };
}

function interpolateGroundHeight(x, z, nodes, buckets, cellSize, corridorCutM) {
  const gx = Math.floor(x / cellSize), gz = Math.floor(z / cellSize);
  let roadHeight = null, nearestRoadDistance = Infinity;
  const seen = new Set();
  for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
    for (const segment of buckets.get((gx + ox) + ":" + (gz + oz)) || []) {
      if (seen.has(segment)) continue;
      seen.add(segment);
      const t = clamp(((x - segment.a.x) * segment.dx + (z - segment.a.z) * segment.dz) / segment.lengthSq, 0, 1);
      const px = segment.a.x + segment.dx * t, pz = segment.a.z + segment.dz * t;
      const distance = Math.hypot(x - px, z - pz);
      if (distance < nearestRoadDistance && distance <= segment.roadHalfWidth + 20) {
        nearestRoadDistance = distance;
        roadHeight = segment.a.y + (segment.b.y - segment.a.y) * t;
      }
    }
  }
  if (finite(roadHeight)) return roadHeight - corridorCutM;

  const nearest = [];
  for (const node of nodes) {
    const dx = node.position.x - x, dz = node.position.z - z, d2 = dx * dx + dz * dz;
    if (nearest.length < 4 || d2 < nearest[nearest.length - 1].d2) {
      nearest.push({ d2, y: node.position.y });
      nearest.sort((a, b) => a.d2 - b.d2);
      if (nearest.length > 4) nearest.pop();
    }
  }
  if (!nearest.length) return 0;
  if (nearest[0].d2 < 0.01) return nearest[0].y;
  let weighted = 0, totalWeight = 0;
  for (const item of nearest) {
    const weight = 1 / Math.max(25, item.d2);
    weighted += item.y * weight;
    totalWeight += weight;
  }
  return weighted / totalWeight;
}

export function buildRoadTerrainData(network, options = {}) {
  const nodes = (network?.nodes || []).filter(node =>
    finite(node.position?.x) && finite(node.position?.y) && finite(node.position?.z));
  if (nodes.length < 3 || !nodes.some(node => Math.abs(node.position.y) > 0.05)) {
    return { available: false, reason: "dem-elevation-not-available", positions: [], indices: [] };
  }
  const cellSizeM = Math.max(20, options.cellSizeM ?? 35);
  const paddingM = Math.max(100, options.paddingM ?? 350);
  const corridorCutM = Math.max(0.08, options.corridorCutM ?? 0.16);
  const xs = nodes.map(node => node.position.x), zs = nodes.map(node => node.position.z);
  const minX = Math.min(...xs) - paddingM, maxX = Math.max(...xs) + paddingM;
  const minZ = Math.min(...zs) - paddingM, maxZ = Math.max(...zs) + paddingM;
  const columns = Math.ceil((maxX - minX) / cellSizeM) + 1;
  const rows = Math.ceil((maxZ - minZ) / cellSizeM) + 1;
  if (columns * rows > (options.maxVertices ?? 180000)) {
    throw new Error("DEM terrain grid exceeds the mobile vertex budget");
  }
  const { buckets } = segmentBuckets(network.edges || [], 250);
  const positions = new Float32Array(columns * rows * 3);
  let minY = Infinity, maxY = -Infinity;
  for (let row = 0; row < rows; row++) {
    const z = minZ + row * cellSizeM;
    for (let column = 0; column < columns; column++) {
      const x = minX + column * cellSizeM;
      const y = interpolateGroundHeight(x, z, nodes, buckets, 250, corridorCutM);
      const index = (row * columns + column) * 3;
      positions[index] = x; positions[index + 1] = y; positions[index + 2] = z;
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const indices = new Uint32Array((columns - 1) * (rows - 1) * 6);
  let cursor = 0;
  for (let row = 0; row < rows - 1; row++) for (let column = 0; column < columns - 1; column++) {
    const a = row * columns + column, b = a + columns, c = a + 1, d = b + 1;
    // Winding is upward in Three.js world coordinates (Y is vertical).
    indices[cursor++] = a; indices[cursor++] = b; indices[cursor++] = c;
    indices[cursor++] = b; indices[cursor++] = d; indices[cursor++] = c;
  }
  return {
    available: true, positions, indices, columns, rows, cellSizeM,
    bounds: { minX, maxX, minZ, maxZ }, minY, maxY, elevationRangeM: maxY - minY,
    vertexCount: columns * rows, triangleCount: indices.length / 3
  };
}

export function createRoadTerrainMesh(THREE, network, options = {}) {
  if (!THREE?.BufferGeometry || !THREE?.Float32BufferAttribute || !THREE?.Mesh) {
    throw new Error("Three.js geometry and mesh constructors are required for terrain");
  }
  const data = buildRoadTerrainData(network, options);
  if (!data.available) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setIndex(THREE.BufferAttribute ? new THREE.BufferAttribute(data.indices, 1) : Array.from(data.indices));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox?.();
  geometry.computeBoundingSphere?.();
  const material = new THREE.MeshStandardMaterial({
    color: options.color ?? 0x789c62, roughness: 1, metalness: 0,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "dem-following-road-terrain";
  mesh.receiveShadow = true;
  mesh.userData = {
    source: "SRTM DEM interpolated from road graph node samples",
    vertexCount: data.vertexCount, triangleCount: data.triangleCount,
    cellSizeM: data.cellSizeM, bounds: data.bounds,
    elevationRangeM: data.maxY - data.minY
  };
  return mesh;
}
