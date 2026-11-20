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
  assert.match(inlineScripts[0], /speed\/3\.6/);
  assert.doesNotMatch(inlineScripts[0], /box\(160,\.15,50000/);
  assert.doesNotMatch(inlineScripts[0], /for\(let i=0;i<16;i\+\+\)\{addTraffic/);
});
