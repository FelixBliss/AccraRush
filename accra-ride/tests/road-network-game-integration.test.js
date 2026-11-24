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
  assert.match(menu, /selectRoadGraph\(net,area\)/, "area previews must use the same selected-road graph as gameplay");
  assert.match(menu, /buildMapModel\(selected,area\)/);
  assert.doesNotMatch(menu, /selectFeaturedRoadEdges|featuredCorridors|geometryByClass/, "no second road selection or full-extract preview may remain");
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
  assert.match(hud, /drawMinimap\(d\.playerX,d\.playerZ,d\.playerForwardX,d\.playerForwardZ,d\.playerHeading,!!d\.reverse\)/, "the heading-up map must use the vehicle's world forward vector");
  assert.match(hud, /screenForwardY=-fz\/length/, "world Z must be inverted into canvas Y");
  assert.match(hud, /if\\(driveDirectionReverse\\)\\{fx=-fx;fz=-fz\\}/, "reverse travel must invert the marker travel vector so steering stays consistent");
  assert.match(hud, /rotate\(-angle\)/, "the road map must rotate with the vehicle so forward travel stays screen-up");
  assert.match(hud, /moveTo\(cx,cy-9\)/, "the heading-up player marker must stay pointed toward the top of the minimap");
  assert.match(html, /setMap\(roadRuntime\.minimap\)/, "the game must pass its loaded OSM network into the HUD");
  assert.match(html, /playerX:player\.position\.x,playerZ:player\.position\.z,playerForwardX:forwardX,playerForwardZ:forwardZ,playerHeading:player\.rotation\.y,reverse:reverse&&speed<0/, "the game loop must pass the car's actual world forward vector and reverse state");
  assert.match(css, /#ar-live-minimap/, "the live minimap must have visible gameplay styling");
});
