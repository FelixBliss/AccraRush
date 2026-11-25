import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAreaEntrySignMeshes } from "../src/map/area-entry-sign-renderer.js";

class Group {
  constructor() { this.children = []; this.userData = {}; }
  add(child) { this.children.push(child); }
}
class Geometry {
  constructor(...dimensions) { this.dimensions = dimensions; }
}
class Material {
  constructor(options = {}) { this.options = options; }
}
class Texture {
  constructor(canvas) { this.canvas = canvas; this.needsUpdate = false; }
}
class Mesh {
  constructor(geometry, material) {
    this.geometry = geometry; this.material = material;
    this.position = { set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } };
    this.rotation = { y: 0 }; this.userData = {};
  }
}

const THREE = {
  Group, BoxGeometry: Geometry, MeshStandardMaterial: Material, CanvasTexture: Texture, Mesh,
  DoubleSide: 2, SRGBColorSpace: "srgb"
};
const canvasFactory = () => ({
  width: 0, height: 0,
  getContext: () => ({ fillRect() {}, strokeRect() {}, fillText() {} })
});
const network = { edges: [{
  id: "route-edge",
  selection: { role: "route" },
  centerline: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }],
  lanes: [{ id: "lane-a", widthM: 3.5, direction: "forward" }, { id: "lane-b", widthM: 3.5, direction: "reverse" }]
}] };

test("physical welcome signboards attach to the approved road edge and stay outside its carriageway", () => {
  const signs = { signs: [{
    id: "akweteyman-entry", areaName: "Akweteyman", text: "WELCOME TO AKWETEYMAN",
    routeEdgeId: "route-edge", edgeFraction: 0.5, side: 1, direction: "both",
    setbackM: 2.5, widthM: 2.8, heightM: 1, panelBottomM: 2.1
  }] };
  const before = JSON.stringify(network);
  const group = createAreaEntrySignMeshes(THREE, signs, network, { canvasFactory });
  assert.equal(group.userData.count, 1);
  assert.deepEqual(group.userData.signIds, ["akweteyman-entry"]);
  assert.deepEqual(group.userData.routeEdgeIds, ["route-edge"]);
  assert.equal(group.userData.roadGraphModified, false);
  assert.equal(group.children.length, 5, "one panel, two posts and two footings");
  const panel = group.children.find(child => child.name === "area-entry-sign:akweteyman-entry");
  assert.ok(panel);
  assert.equal(panel.position.x, 50);
  assert.equal(panel.position.y, 2.6);
  assert.ok(panel.position.z >= 6 - 1e-9, "sign panel must be at or beyond the 3.5 m carriageway half-width plus setback");
  assert.equal(panel.userData.routeOnly, true);
  assert.equal(JSON.stringify(network), before, "sign rendering must not mutate the road graph");
});

test("sign renderer rejects non-route edges and unknown edge references", () => {
  const sign = { id: "bad", text: "WELCOME", routeEdgeId: "connector", edgeFraction: 0.5,
    side: 1, direction: "both", setbackM: 2, widthM: 2, heightM: 1, panelBottomM: 2 };
  assert.throws(() => createAreaEntrySignMeshes(THREE, { signs: [sign] }, {
    edges: [{ ...network.edges[0], id: "connector", selection: { role: "connector" } }]
  }, { canvasFactory }), /approved route edge/);
  assert.throws(() => createAreaEntrySignMeshes(THREE, { signs: [{ ...sign, routeEdgeId: "missing" }] }, network, { canvasFactory }), /outside the selected graph/);
});

test("La Paz–Akweteyman section is a measured marker on the existing open corridor", async () => {
  const base = new URL("../data/osm/", import.meta.url);
  const [sectionText, routeText, signsText] = await Promise.all([
    readFile(new URL("lapaz-madina-area-sections.json", base), "utf8"),
    readFile(new URL("lapaz-madina-route.json", base), "utf8"),
    readFile(new URL("lapaz-madina-area-signs.json", base), "utf8")
  ]);
  const sections = JSON.parse(sectionText), route = JSON.parse(routeText), signs = JSON.parse(signsText);
  const section = sections.sections[0];
  assert.equal(section.id, "lapaz-to-akweteyman");
  assert.equal(section.start.routeChainageM, 0);
  assert.ok(Math.abs(section.distanceM - 3945.65) < 0.1);
  assert.equal(section.end.routeEdgeId, "osm-way-w509004581-segment-0");
  assert.equal(route.steps[31].edgeId, section.end.routeEdgeId);
  assert.equal(route.steps[31].direction, "forward");
  assert.equal(route.closed, false);
  assert.equal(route.steps.length, 125, "the accepted corridor must not gain or lose route steps");
  for (const sign of signs.signs) {
    assert.ok(route.steps.some(step => step.edgeId === sign.routeEdgeId), "every physical sign must reference an existing route edge");
  }
  assert.equal(section.boundaryVerification.status, "not-yet-georeferenced",
    "a landmark proxy must never be misrepresented as a surveyed community boundary");
});
