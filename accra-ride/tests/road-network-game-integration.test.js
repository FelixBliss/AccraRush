import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("playable AccraRush scene loads the selected OSM graph and drives along sampled road geometry", async () => {
  const html = await readFile(new URL("../accrarush.html", import.meta.url), "utf8");
  const gameplayModules = [...html.matchAll(/<script\\b(?=[^>]*\\btype=["']module["'])(?![^>]*\\bsrc=)[^>]*>([\\s\\S]*?)<\\/script>/gi)]
    .map(match => match[1]).filter(source => source.trim());
  assert.equal(gameplayModules.length, 1, "expected one inline gameplay ES module");
  const gameplaySource = gameplayModules[0].replace(/^\\s*import\\s+(?:[\\s\\S]*?\\s+from\\s+)?["'][^"']+["'];?\\s*$/gm, "");
  assert.doesNotThrow(() => new Function(gameplaySource), "gameplay module body must parse after removing static imports");
  assert.match(gameplaySource, /loadRoadNetworkRuntime/);
  assert.match(gameplaySource, /roadRuntime\\.createTrafficRoute/);
  assert.match(gameplaySource, /roadRuntime\\.sample/);
  assert.match(gameplaySource, /roadLaneOffset/);
  assert.match(gameplaySource, /u\\.overtaking=true/);
  assert.match(gameplaySource, /opposingNear/);
  assert.match(gameplaySource, /applyRoadPose/);
  assert.match(gameplaySource, /speed\\/3\\.6/);
  assert.doesNotMatch(gameplaySource, /box\\(160,\\.15,50000/);
  assert.doesNotMatch(gameplaySource, /for\\(let i=0;i<16;i\\+\\+\\)\\{addTraffic/);
});
