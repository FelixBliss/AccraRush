import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("playable AccraRush scene loads the selected OSM graph and drives along sampled road geometry", async () => {
  const html = await readFile(new URL("../accrarush.html", import.meta.url), "utf8");
  const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).filter(source => source.trim());
  assert.equal(inlineScripts.length, 1, "expected one inline gameplay script");
  assert.doesNotThrow(() => new Function(inlineScripts[0]), "gameplay script must parse as JavaScript");
  assert.match(inlineScripts[0], /loadRoadNetworkRuntime/);
  assert.match(inlineScripts[0], /roadRuntime\.createTrafficRoute/);
  assert.match(inlineScripts[0], /roadRuntime\.sample/);
  assert.match(inlineScripts[0], /roadLaneOffset/);
  assert.match(inlineScripts[0], /u\.overtaking=true/);
  assert.match(inlineScripts[0], /opposingNear/);
  assert.match(inlineScripts[0], /applyRoadPose/);
  assert.match(inlineScripts[0], /speed\/3\.6/);
  assert.match(inlineScripts[0], /player\.rotation\.y-=/, "player steering must control vehicle heading");
  assert.match(inlineScripts[0], /findNearestRoad/, "street names must be resolved from nearby OSM roads");
  assert.match(inlineScripts[0], /say\(streetName\)/, "entering a named street must show its name in the toast");
  assert.doesNotMatch(inlineScripts[0], /playerRouteDistance\+=move/, "player must not be pulled along an automatic route curve");
  assert.doesNotMatch(inlineScripts[0], /box\(160,\.15,50000/);
  assert.doesNotMatch(inlineScripts[0], /for\(let i=0;i<16;i\+\+\)\{addTraffic/);
});

test("main menu previews are loaded from both real OSM datasets, not placeholder loops", async () => {
  const menu = await readFile(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
  assert.match(menu, /loadRealAreaNetworks/);
  assert.match(menu, /\.\/data\/osm\/"\+area\+"\.network\.json/);
  assert.match(menu, /drawRealOsmPreview/);
  assert.match(menu, /geometryByClass/);
  assert.match(menu, /selectFeaturedRoadEdges\(net,area\)/, "area previews must use the same five-road selection as gameplay");
  assert.match(menu, /Accra Central/);
  assert.match(menu, /Lapaz/);
  assert.doesNotMatch(menu, /REAL OSM ROAD NETWORK LOADS WHEN YOU DRIVE/);
});


test("live gameplay HUD displays the loaded OSM map and tracks the moving player", async () => {
  const html = await readFile(new URL("../accrarush.html", import.meta.url), "utf8");
  const hud = await readFile(new URL("../src/ui/standalone-game-hud.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/ui/standalone-game-hud.css", import.meta.url), "utf8");
  assert.match(hud, /id="ar-live-minimap"/, "the driving HUD must contain a minimap surface");
  assert.match(hud, /id="ar-minimap-canvas"/, "the minimap must render a live canvas");
  assert.match(hud, /setMap\(map\)/, "the HUD must accept the selected area's real road graph");
  assert.match(hud, /drawMinimap\(d\.playerX,d\.playerZ,d\.playerHeading\)/, "the player marker must update from live coordinates");
  assert.match(html, /setMap\(roadRuntime\.minimap\)/, "the game must pass its loaded OSM network into the HUD");
  assert.match(html, /playerX:player\.position\.x,playerZ:player\.position\.z,playerHeading:player\.rotation\.y/, "the game loop must pass the moving car position and heading");
  assert.match(css, /#ar-live-minimap/, "the live minimap must have visible gameplay styling");
});
