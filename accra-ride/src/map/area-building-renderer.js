/**
 * Batched roadside building massing derived from OSM building footprints.
 * This is scenery only: it never creates roads, junctions or navigation edges.
 */
const finite = value => typeof value === "number" && Number.isFinite(value);

export async function decodeAreaBuildingDocument(encodedText) {
  const encoded = String(encodedText || "").trim();
  if (!encoded) throw new Error("Compressed building data is empty");
  if (typeof globalThis.atob !== "function" || typeof DecompressionStream !== "function") {
    throw new Error("Gzip decompression is unavailable in this browser");
  }
  const binary = globalThis.atob(encoded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const jsonText = await new Response(stream).text();
  const document = JSON.parse(jsonText);
  if (!Array.isArray(document?.buildings)) throw new Error("Building footprint document is malformed");
  document.buildings = document.buildings.map(record => {
    if (!Array.isArray(record) || record.length < 7) return null;
    const [id, kind, levels, heightM, distanceToRouteM, centroid, footprint, name] = record;
    return {
      id: "way/" + id, kind, levels, heightM, distanceToRouteM, name: name || null,
      centroid: { x: centroid?.[0] / 10, z: centroid?.[1] / 10 },
      footprint: Array.isArray(footprint) ? footprint.map(([x, z]) => ({ x: x / 10, z: z / 10 })) : []
    };
  }).filter(Boolean);
  return document;
}

function makeGeometry(THREE, positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createAreaBuildingMeshes(THREE, document, options = {}) {
  if (!THREE?.Group || !THREE?.BufferGeometry || !THREE?.Float32BufferAttribute ||
      !THREE?.Mesh || !THREE?.MeshStandardMaterial || !THREE?.Vector2 ||
      !THREE?.ShapeUtils?.triangulateShape) {
    throw new Error("Three.js buffer geometry and polygon triangulation support are required");
  }
  if (!Array.isArray(document?.buildings)) throw new Error("Building scenery requires a building array");

  const wallPositions = [], wallIndices = [], roofPositions = [], roofIndices = [];
  const groundY = finite(options.groundY) ? options.groundY : 0.02;
  let accepted = 0, rejected = 0;
  for (const building of document.buildings) {
    const raw = building?.footprint;
    if (!Array.isArray(raw) || raw.length < 3) { rejected++; continue; }
    const ring = raw.map(point => ({ x: point.x, z: point.z }));
    if (ring.some(point => !finite(point.x) || !finite(point.z))) { rejected++; continue; }
    if (ring.length > 3 && Math.hypot(ring[0].x - ring.at(-1).x, ring[0].z - ring.at(-1).z) < 0.01) ring.pop();
    if (ring.length < 3) { rejected++; continue; }

    const levels = finite(building.levels) && building.levels > 0 ? building.levels : 1;
    const taggedHeight = finite(building.heightM) && building.heightM > 0 ? building.heightM : null;
    const height = Math.max(2.5, Math.min(45, taggedHeight ?? levels * 3.0));
    const wallBase = wallPositions.length / 3;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const base = wallPositions.length / 3;
      wallPositions.push(
        a.x, groundY, a.z, b.x, groundY, b.z,
        b.x, groundY + height, b.z, a.x, groundY + height, a.z
      );
      wallIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    const contour = ring.map(point => new THREE.Vector2(point.x, point.z));
    const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
    const roofBase = roofPositions.length / 3;
    for (const point of ring) roofPositions.push(point.x, groundY + height, point.z);
    for (const triangle of triangles) {
      if (!Array.isArray(triangle) || triangle.length !== 3) continue;
      const [ia, ib, ic] = triangle;
      const a = ring[ia], b = ring[ib], c = ring[ic];
      if (!a || !b || !c) continue;
      // In the x/z ground plane, negative signed area gives an upward (+y) normal.
      const signed = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
      if (signed > 0) roofIndices.push(roofBase + ia, roofBase + ic, roofBase + ib);
      else roofIndices.push(roofBase + ia, roofBase + ib, roofBase + ic);
    }
    if (wallPositions.length / 3 === wallBase) rejected++;
    else accepted++;
  }

  const group = new THREE.Group();
  if (accepted) {
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xa69b8d, roughness: 0.96, metalness: 0,
      ...(THREE.DoubleSide !== undefined ? { side: THREE.DoubleSide } : {})
    });
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x625f59, roughness: 1, metalness: 0,
      ...(THREE.DoubleSide !== undefined ? { side: THREE.DoubleSide } : {})
    });
    const walls = new THREE.Mesh(makeGeometry(THREE, wallPositions, wallIndices), wallMaterial);
    walls.name = "osm-roadside-building-walls";
    const roofs = new THREE.Mesh(makeGeometry(THREE, roofPositions, roofIndices), roofMaterial);
    roofs.name = "osm-roadside-building-roofs";
    group.add(walls, roofs);
  }
  group.name = "osm-roadside-building-scenery";
  group.userData = {
    buildingCount: accepted,
    rejectedCount: rejected,
    source: document.source || null,
    routeId: document.routeId || null,
    routeGraphModified: false,
    navigationModified: false,
    minimapModified: false,
    terrainElevationVerified: false
  };
  return group;
}
