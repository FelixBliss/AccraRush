/**
 * RD-04 continuous road-surface geometry.
 * Consumes RD-03 foundations; never offsets raw directed OSM edges itself.
 */
import { validateFoundationConnection } from "./road-foundations.js";

const EPSILON = 1e-8;
const finite = value => typeof value === "number" && Number.isFinite(value);
const distance3D = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

function validateBoundaryPair(foundation) {
  const left = foundation?.boundaries?.left;
  const right = foundation?.boundaries?.right;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length < 2 || left.length !== right.length) {
    throw new Error("RD-04 requires matching left/right RD-03 boundary alignments");
  }
  for (let i = 0; i < left.length; i++) {
    if (![left[i]?.x, left[i]?.y, left[i]?.z, right[i]?.x, right[i]?.y, right[i]?.z].every(finite)) {
      throw new Error("Road surface boundaries must contain finite metric coordinates");
    }
    if (distance3D(left[i], right[i]) <= EPSILON) throw new Error("Road surface has a collapsed cross-section");
  }
  return { left, right };
}

/** Return deterministic indexed vertex data, suitable for a Three.js BufferGeometry. */
export function buildRoadSurfaceData(foundation, options = {}) {
  const { left, right } = validateBoundaryPair(foundation);
  const surfaceOffsetM = options.surfaceOffsetM ?? 0.035;
  const uvRepeatM = options.uvRepeatM ?? 8;
  if (!finite(surfaceOffsetM) || !finite(uvRepeatM) || uvRepeatM <= 0) {
    throw new Error("Surface offset and UV repeat must be finite; UV repeat must be positive metres");
  }

  const positions = [], uvs = [], indices = [];
  let distanceM = 0, minWidthM = Infinity, maxWidthM = 0;
  for (let i = 0; i < left.length; i++) {
    if (i > 0) distanceM += (distance3D(left[i - 1], left[i]) + distance3D(right[i - 1], right[i])) / 2;
    const width = distance3D(left[i], right[i]);
    minWidthM = Math.min(minWidthM, width);
    maxWidthM = Math.max(maxWidthM, width);
    positions.push(left[i].x, left[i].y + surfaceOffsetM, left[i].z);
    positions.push(right[i].x, right[i].y + surfaceOffsetM, right[i].z);
    uvs.push(distanceM / uvRepeatM, 0, distanceM / uvRepeatM, 1);
    if (i > 0) {
      const n = i * 2;
      indices.push(n - 2, n, n - 1, n - 1, n, n + 1);
    }
  }

  let degenerateTriangles = 0, invertedTriangles = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const point = index => ({
      x: positions[index * 3], y: positions[index * 3 + 1], z: positions[index * 3 + 2]
    });
    const normal = cross(subtract(point(indices[i + 1]), point(indices[i])),
      subtract(point(indices[i + 2]), point(indices[i])));
    const area2 = Math.hypot(normal.x, normal.y, normal.z);
    if (area2 <= EPSILON) degenerateTriangles++;
    else if (normal.y <= 0) invertedTriangles++;
  }
  if (degenerateTriangles || invertedTriangles) {
    throw new Error("Road surface contains degenerate or inverted triangles (" +
      degenerateTriangles + " degenerate, " + invertedTriangles + " inverted)");
  }

  return {
    positions, uvs, indices,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
    lengthM: distanceM,
    minWidthM, maxWidthM,
    diagnostics: { degenerateTriangles, invertedTriangles, winding: "upward" }
  };
}

/** Build a renderable Three.js mesh from RD-03 foundation data. */
export function createRoadSurfaceMesh(THREE, foundation, options = {}) {
  if (!THREE?.BufferGeometry || !THREE?.Mesh || !THREE?.Float32BufferAttribute) {
    throw new Error("Three.js BufferGeometry, Float32BufferAttribute and Mesh are required");
  }
  const data = buildRoadSurfaceData(foundation, options);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(data.uvs, 2));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox?.();
  geometry.computeBoundingSphere?.();
  const material = options.material ?? new THREE.MeshStandardMaterial({
    color: options.color ?? 0x454b4f, roughness: 1, metalness: 0
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "road-surface:" + foundation.edgeId;
  mesh.userData = {
    edgeId: foundation.edgeId,
    physicalRoadId: foundation.physicalRoadId,
    carriagewayId: foundation.carriagewayId,
    roadFoundationVersion: foundation.schemaVersion,
    roadSurfaceVersion: 1,
    vertexCount: data.vertexCount,
    triangleCount: data.triangleCount,
    widthRangeM: [data.minWidthM, data.maxWidthM],
    lengthM: data.lengthM
  };
  return mesh;
}

function horizontalDirection(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
  return length > EPSILON ? { x: dx / length, z: dz / length } : null;
}

/**
 * Fill only a small, graph-connected endpoint gap on a near-continuous road.
 * Real turning junctions are deliberately left for RD-05.
 */
export function buildRoadEndpointTransition(a, b, options = {}) {
  const toleranceM = options.toleranceM ?? 0.75;
  const connection = validateFoundationConnection(a, b, toleranceM);
  if (!connection.connected) return { built: false, reason: connection.reason, connection };
  const aEnd = a.alignment[a.alignment.length - 1];
  const bStart = b.alignment[0];
  const gapM = connection.gapM;
  const widthA = distance3D(a.boundaries.left.at(-1), a.boundaries.right.at(-1));
  const widthB = distance3D(b.boundaries.left[0], b.boundaries.right[0]);
  const widthDeltaM = Math.abs(widthA - widthB);
  const widthToleranceM = options.widthToleranceM ?? 0.15;
  if (gapM <= EPSILON) {
    return {
      built: false,
      reason: widthDeltaM <= widthToleranceM ? "coincident-endpoint-no-gap" : "width-step-requires-junction-transition",
      connection, widthDeltaM
    };
  }

  const aDirection = horizontalDirection(a.alignment.at(-2), aEnd);
  const bDirection = horizontalDirection(bStart, b.alignment[1]);
  if (!aDirection || !bDirection) return { built: false, reason: "invalid-endpoint-tangent", connection };
  const dot = aDirection.x * bDirection.x + aDirection.z * bDirection.z;
  const minimumDot = options.minimumDirectionDot ?? Math.cos(Math.PI / 6);
  if (dot < minimumDot) {
    return { built: false, reason: "turning-junction-reserved-for-rd05", connection, directionDot: dot };
  }

  const vertices = [
    a.boundaries.left.at(-1), b.boundaries.left[0],
    a.boundaries.right.at(-1), b.boundaries.right[0]
  ];
  const indices = [0, 1, 2, 2, 1, 3];
  const triangleNormal = cross(subtract(vertices[1], vertices[0]), subtract(vertices[2], vertices[0]));
  if (Math.hypot(triangleNormal.x, triangleNormal.y, triangleNormal.z) <= EPSILON || triangleNormal.y <= 0) {
    return { built: false, reason: "transition-would-be-degenerate-or-inverted", connection };
  }
  return {
    built: true, reason: "short-connected-endpoint-gap",
    positions: vertices.flatMap(point => [point.x, point.y + (options.surfaceOffsetM ?? 0.035), point.z]),
    indices, gapM, widthDeltaM, directionDot: dot,
    diagnostics: { triangleCount: 2, winding: "upward", graphConnected: true }
  };
}
