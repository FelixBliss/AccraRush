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
    await page.goto("http://127.0.0.1:4173/accrarush.html?debug=1", { waitUntil:"domcontentloaded" });
    await page.waitForFunction(() => window.THREE && window.THREE.WebGLRenderer, null, { timeout:30000 });
    await page.locator("#menu-play").click();
    await page.waitForFunction(() =>
      document.querySelector('[data-area-map="accra-central"] svg path') &&
      document.querySelector('[data-area-map="lapaz"] svg path'), null, { timeout:30000 });
    const mapPreview = await page.locator('[data-area-map="' + area.id + '"] svg path').count();
    assert.ok(mapPreview > 0, area.label + " actual OSM map preview did not render");
    await page.locator('[data-area-card="' + area.id + '"]').click();
    await page.locator("#menu-areas [data-menu-back=\"home\"]").click();
    await page.locator("#menu-start-setup").click();
    await page.waitForFunction(() => document.querySelector("#startcover").style.display === "none" ||
      document.querySelector("#mission").textContent.includes("ROAD NETWORK LOAD FAILED"), null, { timeout:90000 });
    const mission = await page.locator("#mission").innerText();
    assert.ok(!mission.includes("ROAD NETWORK LOAD FAILED"), area.label + " road network failed to load: " + mission);
    const liveMap = page.locator("#ar-live-minimap");
    assert.ok(await liveMap.isVisible(), area.label + " live gameplay minimap is not visible");
    const mapState = await page.evaluate(() => {
      const canvas = document.querySelector("#ar-minimap-canvas");
      const ctx = canvas?.getContext("2d");
      const pixels = ctx?.getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0;
      if (pixels) for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted++;
      const runtime = window.AccraRushDebug?.roadRuntime;
      return {
        width: canvas?.width, height: canvas?.height, painted,
        featuredNames: runtime?.featuredRoadNames || [],
        networkNames: [...new Set((runtime?.network?.edges || []).map(edge => edge.osm?.name).filter(Boolean))]
      };
    });
    assert.equal(mapState.width, 320, area.label + " minimap canvas width is wrong");
    assert.equal(mapState.height, 210, area.label + " minimap canvas height is wrong");
    assert.ok(mapState.painted > 1000, area.label + " minimap did not draw its OSM roads");
    assert.equal(mapState.featuredNames.length, 5, area.label + " must expose exactly five featured roads");
    for (const name of mapState.featuredNames) {
      assert.ok(mapState.networkNames.includes(name), area.label + " missing featured road in live graph: " + name);
    }
    await page.waitForFunction(() => {
      const text = document.querySelector("#toast")?.textContent || "";
      return window.AccraRushDebug?.roadRuntime?.featuredRoadNames?.some(name => text.includes(name));
    }, null, { timeout:10000 });
    assert.ok(mission.toUpperCase().includes(area.label.toUpperCase()), area.label + " not selected in live gameplay: " + mission);
    try {
      await page.waitForFunction(() => {
        const debug = window.AccraRushDebug;
        if (!debug?.active || !debug.roadRuntime || !debug.playerPose) return false;
        debug.player.updateMatrixWorld(true);
        debug.camera.updateMatrixWorld(true);
        const center = new THREE.Box3().setFromObject(debug.player).getCenter(new THREE.Vector3()).project(debug.camera);
        const direction = debug.camera.getWorldDirection(new THREE.Vector3());
        const forward = new THREE.Vector3(debug.playerPose.forwardX,0,debug.playerPose.forwardZ);
        return debug.camera.position.distanceTo(debug.player.position) < 15 &&
          direction.dot(forward) > 0.95 && center.z >= -1 && center.z <= 1 &&
          Math.abs(center.x) <= 1 && Math.abs(center.y) <= 1;
      }, null, { timeout:15000 });
    } catch (error) {
      const diagnostic = await page.evaluate(() => {
        const d=window.AccraRushDebug;if(!d)return {debug:"missing"};
        if(!d.playerPose)return {active:d.active,roadRuntime:!!d.roadRuntime,playerPose:null};
        d.player.updateMatrixWorld(true);d.camera.updateMatrixWorld(true);
        const center=new THREE.Box3().setFromObject(d.player).getCenter(new THREE.Vector3()).project(d.camera);
        const direction=d.camera.getWorldDirection(new THREE.Vector3());
        const forward=new THREE.Vector3(d.playerPose.forwardX,0,d.playerPose.forwardZ);
        return {active:d.active,area:d.roadRuntime?.areaId,routeDistance:d.roadRuntime?.playerRoute?.distanceM,
          player:{x:d.player.position.x,y:d.player.position.y,z:d.player.position.z},
          camera:{x:d.camera.position.x,y:d.camera.position.y,z:d.camera.position.z},
          distance:d.camera.position.distanceTo(d.player.position),cameraForwardDot:direction.dot(forward),
          projectedCenter:{x:center.x,y:center.y,z:center.z},forward:{x:forward.x,z:forward.z}};
      });
      console.error(area.label+" camera diagnostics: "+JSON.stringify(diagnostic));
      throw error;
    }
    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state:"visible", timeout:10000 });
    assert.ok(await canvas.evaluate(el => el.width > 0 && el.height > 0), area.label + " renderer canvas has no drawing surface");
    await page.locator("#gas").dispatchEvent("pointerdown", { pointerId:1, pointerType:"mouse", isPrimary:true, button:0, buttons:1 });
    await page.waitForFunction(() => Number(document.querySelector("#speed").textContent) > 0, null, { timeout:10000 });
    await page.locator("#gas").dispatchEvent("pointerup", { pointerId:1, pointerType:"mouse", isPrimary:true, button:0, buttons:0 });
    const speed = await page.locator("#speed").innerText();
    const visual = await page.evaluate(() => {
      const debug = window.AccraRushDebug;
      const player = debug.player;
      player.updateMatrixWorld(true);
      debug.camera.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(player);
      const center = bounds.getCenter(new THREE.Vector3()).project(debug.camera);
      return {
        active:debug.active, playerChildren:player.children.length,
        playerCenter:{x:center.x,y:center.y,z:center.z},
        playerBounds:{minY:bounds.min.y,maxY:bounds.max.y},
        cameraDistance:debug.camera.position.distanceTo(player.position),
        cameraPosition:{x:debug.camera.position.x,y:debug.camera.position.y,z:debug.camera.position.z},
        roadMeshes:debug.roadRuntime.roadGroup.userData.roadMeshCount,
        roadEdges:debug.roadRuntime.roadGroup.userData.edgeCount,
        trafficCount:debug.traffic.length
      };
    });
    assert.ok(visual.active, area.label + " game loop did not become active");
    assert.ok(visual.playerChildren > 0, area.label + " player vehicle has no geometry");
    assert.ok(visual.roadMeshes > 0 && visual.roadEdges > 100, area.label + " road geometry was not added to the Three.js scene");
    assert.ok(visual.trafficCount >= 20, area.label + " AI traffic did not spawn");
    assert.ok(visual.playerCenter.z >= -1 && visual.playerCenter.z <= 1 &&
      Math.abs(visual.playerCenter.x) <= 1 && Math.abs(visual.playerCenter.y) <= 1,
      area.label + " player vehicle is outside the active camera frustum: " + JSON.stringify(visual));
    await page.screenshot({ path:"artifacts/" + area.id + "-landscape.png" });
    console.log(area.label + ": road surfaces, " + visual.roadEdges + " edges, " + visual.trafficCount +
      " AI vehicles; player is in camera frustum; movement confirmed at " + speed + " km/h");
    await page.close();
  }
  assert.deepEqual(failures, [], "Uncaught browser errors: " + failures.join("; "));
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
