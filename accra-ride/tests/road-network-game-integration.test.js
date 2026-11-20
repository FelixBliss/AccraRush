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
  assert.match(menu, /mainClasses=new Set\(\["motorway","trunk","primary","secondary"\]\)/, "area previews must show the main-road phase only");
  assert.match(menu, /Accra Central/);
  assert.match(menu, /Lapaz/);
  assert.doesNotMatch(menu, /REAL OSM ROAD NETWORK LOADS WHEN YOU DRIVE/);
});
