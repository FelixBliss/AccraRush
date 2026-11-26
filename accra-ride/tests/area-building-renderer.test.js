import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  decodeAreaBuildingDocument,
  createAreaBuildingMeshes
} from "../src/map/area-building-renderer.js";

class Group {
  constructor() { this.children = []; this.userData = {}; }
  add(...children) { this.children.push(...children); }
}
class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; }
  setAttribute(name, value) { this.attributes[name] = value; }
  setIndex(value) { this.index = value; }
  computeVertexNormals() { this.normalsComputed = true; }
}
class Float32BufferAttribute {
  constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
}
class Vector2 {
  constructor(x, y) { this.x = x; this.y = y; }
}
class Material {
  constructor(options) { this.options = options; }
}
class Mesh {
  constructor(geometry, material) { this.geometry = geometry; this.material = material; this.name = ""; }
}
const THREE = {
  Group, BufferGeometry, Float32BufferAttribute, Vector2, MeshStandardMaterial: Material, Mesh,
  DoubleSide: 2,
  ShapeUtils: { triangulateShape: contour => {
    const triangles = [];
    for (let i = 1; i < contour.length - 1; i++) triangles.push([0, i, i + 1]);
    return triangles;
  } }
};

test("compressed OSM building file decodes to metre-based footprints with provenance", async () => {
  const encoded = await readFile(new URL("../data/osm/lapaz-akweteyman-buildings.json.gz.b64", import.meta.url), "utf8");
  const document = await decodeAreaBuildingDocument(encoded);
  assert.equal(document.routeId, "lapaz-madina-highway");
  assert.equal(document.sectionId, "lapaz-to-akweteyman");
  assert.equal(document.source.license, "ODbL-1.0");
  assert.equal(document.source.attribution, "© OpenStreetMap contributors");
  assert.equal(document.minDistanceM, 12);
  assert.equal(document.maxDistanceM, 75);
  assert.equal(document.buildings.length, 423);
  assert.ok(document.buildings.every(building => building.footprint.length >= 3));
  assert.ok(document.buildings.every(building => building.footprint.every(point =>
    Number.isFinite(point.x) && Number.isFinite(point.z))));
});

test("roadside footprints batch into one wall mesh and one roof mesh without touching the road graph", () => {
  const document = {
    routeId: "lapaz-madina-highway",
    buildings: [{
      id: "way/1", levels: 2, heightM: null,
      footprint: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }]
    }]
  };
  const group = createAreaBuildingMeshes(THREE, document);
  assert.equal(group.userData.buildingCount, 1);
  assert.equal(group.userData.rejectedCount, 0);
  assert.equal(group.userData.routeGraphModified, false);
  assert.equal(group.userData.navigationModified, false);
  assert.equal(group.userData.minimapModified, false);
  assert.equal(group.userData.terrainElevationVerified, false);
  assert.deepEqual(group.children.map(child => child.name), [
    "osm-roadside-building-walls", "osm-roadside-building-roofs"
  ]);
  for (const mesh of group.children) {
    assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));
    assert.ok(mesh.geometry.index.length > 0);
    assert.equal(mesh.geometry.normalsComputed, true);
  }
});

test("invalid or incomplete building footprints are rejected safely", () => {
  const group = createAreaBuildingMeshes(THREE, { buildings: [
    { footprint: [{ x: 0, z: 0 }, { x: NaN, z: 1 }, { x: 1, z: 0 }] },
    { footprint: [{ x: 0, z: 0 }, { x: 1, z: 0 }] }
  ] });
  assert.equal(group.userData.buildingCount, 0);
  assert.equal(group.userData.rejectedCount, 2);
  assert.equal(group.children.length, 0);
});
