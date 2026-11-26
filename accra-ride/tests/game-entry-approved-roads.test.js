import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../accrarush.html", import.meta.url), "utf8");
const runtime = await readFile(new URL("../src/map/road-network-runtime.js", import.meta.url), "utf8");

test("Play Game uses one compact loading indicator, not a second full-screen menu", () => {
  assert.match(html, /id="ar-launch-status"[^>]*role="status"/);
  assert.match(html, /top:max\(12px,env\(safe-area-inset-top\)\)/);
  assert.doesNotMatch(html, /ar-launch-retry|ar-launch-dismiss/);
  assert.match(html, /AccraRushHideLaunchStatus\?\.\(\);reset\(\)/);
});

test("road startup errors remain visible without replacing the menu with another dialogue", () => {
  assert.match(html, /Road network failed: '\+detail,true/);
  assert.match(html, /watchdog=setTimeout\([\s\S]*?25000\)/);
  assert.match(html, /addEventListener\("unhandledrejection"/);
  assert.match(html, /networkLoading=false;\$\('start'\)\.disabled=false;return/);
});

test("Lapaz runtime loads the accepted route, elevation profile and mapped infrastructure", () => {
  assert.match(runtime, /lapaz-madina-route\.json/);
  assert.match(runtime, /lapaz-elevation\.json/);
  assert.match(runtime, /applyRoadElevationProfile\(network/);
  assert.match(runtime, /areaId \+ "\.features\.json/);
  assert.match(runtime, /createRoadFeatureMeshes\(THREE, matchedRoadFeatures, network\)/);
  assert.match(runtime, /createRoadTerrainMesh/);
  assert.match(runtime, /buildBusStopAccessEdges/);
});
