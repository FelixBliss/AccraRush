import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("playable AccraRush scene loads the selected OSM graph and drives along sampled road geometry", async () => {
  const html = await readFile(new URL("../accrarush.html", import.meta.url), "utf8");
  const gameplayModules = [...html.matchAll(/<script\b(?=[^>]*\btype=["']module["'])(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).filter(source => source.trim());
  assert.equal(gameplayModules.length, 1, "expected one inline gameplay ES module");
  const gameplaySource = gameplayModules[0].replace(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?["'][^"']+["'];?\s*$/gm, "");
  assert.doesNotThrow(() => new Function(gameplaySource), "gameplay module body must parse after removing static imports");
  assert.match(gameplaySource, /loadRoadNetworkRuntime/);
  assert.match(gameplaySource, /roadRuntime\.createTrafficRoute/);
  assert.match(gameplaySource, /roadRuntime\.createReturnHighwayTrafficRoute/);
  assert.match(gameplaySource, /u\.route\.closed===false&&nextRouteProgress>=u\.route\.distanceM/, "open highway traffic must stop at its endpoint instead of teleporting back to Lapaz");
  assert.match(gameplaySource, /roadRuntime\.sample/);
  assert.match(gameplaySource, /roadLaneOffset/);
  assert.match(gameplaySource, /u\.overtaking=true/);
  assert.match(gameplaySource, /opposingNear/);
  assert.match(gameplaySource, /applyRoadPose/);
  assert.match(gameplaySource, /player\.rotation\.y-=/, "player steering must control vehicle heading");
  assert.match(gameplaySource, /findNearestRoad/);
  assert.doesNotMatch(gameplaySource, /playerRouteDistance\+=move/, "player must not be pulled along an automatic route");
  assert.match(gameplaySource, /speed\/3\.6/);
  assert.doesNotMatch(gameplaySource, /box\(160,\.15,50000/);
  assert.doesNotMatch(gameplaySource, /for\(let i=0;i<16;i\+\+\)\{addTraffic/);
});

test("main menu previews are loaded from both real OSM datasets, not placeholder loops", async () => {
  const menu = await readFile(new URL("../src/ui/phase-2-navigation.js", import.meta.url), "utf8");
  assert.match(menu, /loadRealAreaNetworks/);
  assert.match(menu, /\.\/data\/osm\/"\+area\+"\.network\.json/);
  assert.match(menu, /drawRealOsmPreview/);
  assert.match(menu, /selectCircuitRoadGraph\(net,manifest\)/, "Accra Central must retain its own existing circuit graph");
  assert.match(menu, /selectHighwayRouteGraph\(net,manifest\)/, "Lapaz must preview the same open highway graph as gameplay");
  assert.match(menu, /lapaz-madina-route\.json/);
  assert.match(menu, /\.candidate-race-circuit\.json/, "only Accra Central continues using the circuit manifest");
  assert.match(menu, /buildMapModel\(selected,area\)/);
  assert.match(menu, /mapModel\.roads=mapModel\.roads\.filter\(road=>outboundIds\.has\(road\.id\)\)/, "the Lapaz map preview must show only the single outbound corridor, not return-route branches");
  assert.doesNotMatch(menu, /selectRoadGraph\(net,area\)|APPROVED_ROADS/, "no legacy five-road filter may override the generated circuit preview");
  assert.match(menu, /Accra Central/);
  assert.match(menu, /Lapaz/);
  assert.match(menu, /Lapaz to Madina/);
  assert.doesNotMatch(menu, /REAL OSM ROAD NETWORK LOADS WHEN YOU DRIVE/);
});


test("live gameplay HUD displays the loaded OSM map and tracks the moving player", async () => {
  const html = await readFile(new URL("../accrarush.html", import.meta.url), "utf8");
  const hud = await readFile(new URL("../src/ui/standalone-game-hud.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/ui/standalone-game-hud.css", import.meta.url), "utf8");
  assert.match(hud, /id="ar-live-minimap"/, "the driving HUD must contain a minimap surface");
  assert.match(hud, /id="ar-minimap-canvas"/, "the minimap must render a live canvas");
  assert.match(hud, /setMap\(map\)/, "the HUD must accept the selected area's real road graph");
  assert.match(hud, /drawMinimap\(d\.playerX,d\.playerZ,d\.playerForwardX,d\.playerForwardZ,d\.playerHeading\)/, "the minimap must use the vehicle's actual nose vector");
  assert.match(hud, /routeEndpoints/, "the map must use the verified Lapaz and Madina endpoints");
  assert.match(hud, /angle=Math\.PI\/2-Math\.atan2\(dy,dx\)/, "Lapaz must be oriented at the bottom and Madina toward the top");
  assert.match(hud, /projectWorld\(playerX,playerZ\)/, "the pointer must move with the car's actual world position");
  assert.match(hud, /rotate\(markerAngle\)/, "the vehicle pointer must rotate to the car's heading after map orientation");
  assert.match(hud, /LAPAZ TO MADINA/, "the live minimap must use the approved corridor name");
  assert.match(hud, /moveTo\(0,-10\)/, "the vehicle marker must have a clear forward tip");
  assert.match(html, /minimap\.routeEndpoints = \{/,"the live map must receive the verified route endpoints");
  assert.match(html, /setMap\(roadRuntime\.minimap\)/, "the game must pass its loaded OSM network into the HUD");
  assert.match(html, /playerX:player\.position\.x,playerZ:player\.position\.z,playerForwardX:forwardX,playerForwardZ:forwardZ,playerHeading:player\.rotation\.y,reverse:reverse&&speed<0/, "the game loop must pass the car's actual world forward vector and reverse state");
  assert.match(css, /#ar-live-minimap/, "the live minimap must have visible gameplay styling");
});
