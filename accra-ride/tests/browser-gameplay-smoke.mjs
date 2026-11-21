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
    await page.waitForFunction(() => ["accra-central","lapaz"].every(id => {
      const canvas=document.querySelector('[data-area-map="'+id+'"] canvas');
      if(!canvas||canvas.width!==720||canvas.height!==420)return false;
      const data=canvas.getContext("2d")?.getImageData(0,0,canvas.width,canvas.height).data;
      if(!data)return false;
      let featured=0,roads=0;
      for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];if(r>205&&g>135&&g<225&&b<130)featured++;if(r>70&&g>90&&b>100&&r<220)roads++;}
      return featured>8&&roads>30;
    }), null, { timeout:60000 });
    const previews=await page.evaluate(()=>["accra-central","lapaz"].map(id=>{
      const canvas=document.querySelector('[data-area-map="'+id+'"] canvas'),data=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
      let featured=0,roads=0;for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];if(r>205&&g>135&&g<225&&b<130)featured++;if(r>70&&g>90&&b>100&&r<220)roads++;}
      return {area:id,width:canvas.width,height:canvas.height,featuredPixels:featured,roadPixels:roads};
    }));
    assert.ok(previews.every(item=>item.featuredPixels>8&&item.roadPixels>30),"Both area previews must show full roads and highlighted featured corridors: "+JSON.stringify(previews));

    await page.locator('[data-area-card="' + area.id + '"]').click();
    await page.locator("#menu-areas [data-menu-back=\"home\"]").click();
    await page.locator("#menu-start-setup").click();
    await page.waitForFunction(() => {
      const panel=document.querySelector("#ar-live-minimap"),base=document.querySelector("#ar-map-network"),marker=document.querySelector("#ar-map-player");
      if(!panel||panel.hidden||!base||!marker||base.width!==520||marker.width!==520)return false;
      const baseData=base.getContext("2d").getImageData(0,0,base.width,base.height).data;
      const markerData=marker.getContext("2d").getImageData(0,0,marker.width,marker.height).data;
      let roadPixels=0,markerPixels=0;
      for(let i=0;i<baseData.length;i+=4)if(baseData[i+3]>0)roadPixels++;
      for(let i=0;i<markerData.length;i+=4)if(markerData[i+3]>0)markerPixels++;
      return roadPixels>100&&markerPixels>10;
    }, null, { timeout:30000 });
    await page.waitForFunction(() => document.querySelector("#startcover").style.display === "none" ||
      document.querySelector("#mission").textContent.includes("ROAD NETWORK LOAD FAILED"), null, { timeout:90000 });
    const mission = await page.locator("#mission").innerText();
    assert.ok(!mission.includes("ROAD NETWORK LOAD FAILED"), area.label + " road network failed to load: " + mission);
    assert.ok(mission.toUpperCase().includes(area.label.toUpperCase()), area.label + " not selected in live gameplay: " + mission);
    await page.waitForFunction(() => {
      const debug = window.AccraRushDebug;
      if (!debug?.active || !debug.roadRuntime) return false;
      debug.player.updateMatrixWorld(true);
      debug.camera.updateMatrixWorld(true);
      const center = new THREE.Box3().setFromObject(debug.player).getCenter(new THREE.Vector3()).project(debug.camera);
      const direction = debug.camera.getWorldDirection(new THREE.Vector3());
      const forward = new THREE.Vector3(debug.playerPose.forwardX,0,debug.playerPose.forwardZ);
      return debug.camera.position.distanceTo(debug.player.position) < 15 &&
        direction.dot(forward) > 0.95 && center.z >= -1 && center.z <= 1 &&
        Math.abs(center.x) <= 1 && Math.abs(center.y) <= 1;
    }, null, { timeout:15000 });
    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state:"visible", timeout:10000 });
    assert.ok(await canvas.evaluate(el => el.width > 0 && el.height > 0), area.label + " renderer canvas has no drawing surface");
    await page.locator("#gas").dispatchEvent("pointerdown", { pointerId:1, pointerType:"mouse", isPrimary:true, button:0, buttons:1 });
    await page.waitForFunction(() => Number(document.querySelector("#speed").textContent) > 0, null, { timeout:10000 });
    await page.locator("#gas").dispatchEvent("pointerup", { pointerId:1, pointerType:"mouse", isPrimary:true, button:0, buttons:0 });
    const speed = await page.locator("#speed").innerText();
    assert.equal(await page.evaluate(() => window.AccraRushPlayerModelLoaded), true, area.label + " Corolla GLB did not load; procedural fallback is not an acceptable integration pass");
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
        trafficCount:debug.traffic.length,
        trafficCorollaCount:debug.traffic.filter(vehicle=>vehicle.userData.isCorollaGLB).length,
        trafficCorollaWheelSets:debug.traffic.filter(vehicle=>vehicle.userData.isCorollaGLB).every(vehicle=>vehicle.userData.wheelNodes?.length===4)
      };
    });
    assert.ok(visual.active, area.label + " game loop did not become active");
    assert.ok(visual.playerChildren > 0, area.label + " player vehicle has no geometry");
    assert.ok(visual.roadMeshes > 0 && visual.roadEdges > 1000, area.label + " road geometry was not added to the Three.js scene");
    assert.ok(visual.trafficCount >= 20, area.label + " AI traffic did not spawn");
    assert.ok(visual.trafficCorollaCount >= 20, area.label + " AI traffic is still using procedural cars instead of the Corolla GLB: " + visual.trafficCorollaCount);
    assert.ok(visual.trafficCorollaWheelSets, area.label + " AI Corolla wheel pivots were not connected");
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
