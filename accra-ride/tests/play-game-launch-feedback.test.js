import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../accrarush.html", import.meta.url), "utf8");

test("Play Game exposes a visible startup and recovery panel", () => {
  assert.match(html, /id="ar-launch-status"[^>]*role="status"/);
  assert.match(html, /id="ar-launch-retry"/);
  assert.match(html, /id="ar-launch-dismiss"/);
});

test("Play Game startup is observable before the 3D module responds", () => {
  assert.match(html, /addEventListener\("click",event=>\{[\s\S]*?closest\("#menu-start-setup"\)/);
  assert.match(html, /watchdog=setTimeout\([\s\S]*?25000\)/);
  assert.match(html, /addEventListener\("unhandledrejection"/);
});

test("road-network startup failures are surfaced and loading state is released", () => {
  assert.match(html, /AccraRushShowLaunchStatus\?\.\('Road network failed: '\+detail,true\)/);
  assert.match(html, /networkLoading=false;\$\('start'\)\.disabled=false;return/);
  assert.match(html, /AccraRushHideLaunchStatus\?\.\(\);\$\('startcover'\)\.style\.display='none'/);
});

test("the game marks its launch handler ready only after registering it", () => {
  assert.match(html, /\}\);window\.AccraRushGameBooted=true;window\.AccraRushHideLaunchStatus/);
});
