import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mime = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".glb":"model/gltf-binary", ".svg":"image/svg+xml" };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const file = resolve(root, "." + pathname);
    if (file !== root && !file.startsWith(root + sep)) throw new Error("Invalid path");
    const info = await stat(file);
    const target = info.isDirectory() ? resolve(file, "index.html") : file;
    res.writeHead(200, { "content-type": mime[extname(target)] || "application/octet-stream", "cache-control":"no-store" });
    res.end(await readFile(target));
  } catch {
    res.writeHead(404); res.end("Not found");
  }
});
await new Promise(resolveListen => server.listen(4173, "127.0.0.1", resolveListen));

const browser = await chromium.launch({ headless:true, args:["--no-sandbox","--enable-webgl","--ignore-gpu-blocklist","--use-gl=angle","--use-angle=swiftshader"] });
const failures = [];
try {
  for (const area of [{id:"accra-central",label:"Accra Central"},{id:"lapaz",label:"Lapaz"}]) {
    const page = await browser.newPage({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
    page.on("pageerror", error => failures.push(area.id + ": " + error.message));
    await page.goto("http://127.0.0.1:4173/accrarush.html", { waitUntil:"domcontentloaded" });
    await page.waitForFunction(() => window.THREE && window.THREE.WebGLRenderer, null, { timeout:30000 });
    await page.locator("#menu-play").click();
    await page.locator('[data-area-card="' + area.id + '"]').click();
    await page.locator('[data-menu-back="home"]').click();
    await page.locator("#menu-start-setup").click();
    await page.waitForFunction(() => document.querySelector("#startcover").style.display === "none" ||
      document.querySelector("#mission").textContent.includes("ROAD NETWORK LOAD FAILED"), null, { timeout:90000 });
    const mission = await page.locator("#mission").innerText();
    assert.ok(!mission.includes("ROAD NETWORK LOAD FAILED"), area.label + " road network failed to load: " + mission);
    assert.ok(mission.toUpperCase().includes(area.label.toUpperCase()), area.label + " not selected in live gameplay: " + mission);
    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state:"visible", timeout:10000 });
    assert.ok(await canvas.evaluate(el => el.width > 0 && el.height > 0), area.label + " renderer canvas has no drawing surface");
    await page.locator("#gas").dispatchEvent("pointerdown", { pointerId:1, pointerType:"mouse", isPrimary:true, button:0, buttons:1 });
    await page.waitForFunction(() => Number(document.querySelector("#speed").textContent) > 0, null, { timeout:10000 });
    await page.locator("#gas").dispatchEvent("pointerup", { pointerId:1, pointerType:"mouse", isPrimary:true, button:0, buttons:0 });
    const speed = await page.locator("#speed").innerText();
    await page.screenshot({ path:"artifacts/" + area.id + "-landscape.png" });
    console.log(area.label + ": OSM load passed; landscape renderer active; vehicle movement confirmed at " + speed + " km/h");
    await page.close();
  }
  assert.deepEqual(failures, [], "Uncaught browser errors: " + failures.join("; "));
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
