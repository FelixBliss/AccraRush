import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidenceDir = process.env.EVIDENCE_DIR || "artifacts";
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
  } catch { res.writeHead(404); res.end("Not found"); }
});
await mkdir(evidenceDir, { recursive:true });
await new Promise(resolveListen => server.listen(4173, "127.0.0.1", resolveListen));
const browser = await chromium.launch({ headless:true, args:["--no-sandbox","--enable-webgl","--ignore-gpu-blocklist","--use-gl=angle","--use-angle=swiftshader"] });
const pageErrors = [];
try {
  const context = await browser.newContext({ viewport:{width:832,height:384}, deviceScaleFactor:1, isMobile:true, hasTouch:true });
  const page = await context.newPage();
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:4173/accrarush.html?debug=1", { waitUntil:"domcontentloaded" });
  await page.waitForFunction(() => window.THREE && window.THREE.WebGLRenderer, null, { timeout:30000 });

  await page.locator("#menu-play").click();
  await page.waitForFunction(() => document.querySelector('[data-area-map="lapaz"] svg path'), null, { timeout:60000, polling:250 });
  const preview = await page.locator('[data-area-map="lapaz"]').evaluate(host => ({
    networkId:host.dataset.networkId || "",
    edgeCount:Number(host.dataset.edgeCount || 0),
    label:host.querySelector("svg")?.getAttribute("aria-label") || ""
  }));
  assert.equal(preview.networkId, "accrarush-lapaz-osm", "Lapaz preview must use the imported OSM network");
  assert.ok(preview.edgeCount >= 20, "Lapaz preview must show a meaningful corridor graph");

  await page.locator('[data-area-card="lapaz"]').click();
  await page.locator("#menu-areas [data-menu-back="home"]').click();
  await page.locator("#menu-start-setup").click();
  await page.waitForFunction(() => {
    const panel=document.querySelector("#ar-live-minimap");
    const runtime=window.AccraRushDebug?.roadRuntime;
    return panel && !panel.hidden && runtime && runtime.areaId === "lapaz";
  }, null, { timeout:90000, polling:250 });

  await page.waitForFunction(() => window.AccraRushDebug?.active === true, null, { timeout:30000 });
  const state = await page.evaluate(() => {
    const debug=window.AccraRushDebug, runtime=debug.roadRuntime;
    const canvas=document.querySelector("#ar-minimap-canvas");
    const ctx=canvas?.getContext("2d");
    const pixels=ctx?.getImageData(0,0,canvas.width,canvas.height).data;
    let painted=0;
    if(pixels) for(let i=3;i<pixels.length;i+=4) if(pixels[i]>0) painted++;
    return {
      areaId:runtime.areaId,
      sourceNetworkId:runtime.document?.network?.id,
      activeNetworkId:runtime.network?.id,
      closed:runtime.raceCircuit?.closed,
      startNodeId:runtime.raceCircuit?.startNodeId,
      endNodeId:runtime.raceCircuit?.destinationNodeId,
      waypoints:(runtime.raceCircuit?.waypoints || []).map(point=>point.name),
      returnStart:runtime.returnHighwayRoute?.startNodeId,
      returnEnd:runtime.returnHighwayRoute?.destinationNodeId,
      outboundEdges:runtime.raceCircuit?.steps?.map(step=>step.edgeId) || [],
      returnEdges:runtime.returnHighwayRoute?.steps?.map(step=>step.edgeId) || [],
      minimapEdges:runtime.minimap?.raceCircuit?.edgeIds || [],
      graphEdges:runtime.network?.edges?.map(edge=>edge.id) || [],
      routeRoles:[...new Set((runtime.network?.edges || []).map(edge=>edge.selection?.role))],
      featuredNames:runtime.featuredRoadNames || [],
      trafficCount:debug.traffic?.length || 0,
      trafficCorollaCount:debug.traffic?.filter(vehicle=>vehicle.userData.isCorollaGLB).length || 0,
      playerModelLoaded:window.AccraRushPlayerModelLoaded === true,
      minimapWidth:canvas?.width,
      minimapHeight:canvas?.height,
      minimapPainted:painted
    };
  });
  const expected=["Lapaz","Akweteyman","Achimota","Abofu","Dzorwulu","Airport Junction","Tetteh Quarshie","Shiashie","Okponglo","Legon","Madina"];
  assert.equal(state.areaId,"lapaz");
  assert.equal(state.sourceNetworkId,"accrarush-lapaz-osm");
  assert.equal(state.activeNetworkId,state.sourceNetworkId);
  assert.equal(state.closed,false,"Lapaz–Madina is a point-to-point highway, not a closed circuit");
  assert.notEqual(state.startNodeId,state.endNodeId);
  assert.deepEqual(state.waypoints,expected,"all eleven approved checkpoints must appear in order");
  assert.equal(state.returnStart,state.endNodeId,"opposing AI return route must start at Madina");
  assert.equal(state.returnEnd,state.startNodeId,"opposing AI return route must end at Lapaz");
  assert.ok(state.outboundEdges.length>=20 && state.returnEdges.length>=20,"both legal directions must contain real OSM edges");
  const expectedMapEdges=[...new Set([...state.outboundEdges,...state.returnEdges])].sort();
  assert.deepEqual([...state.minimapEdges].sort(),expectedMapEdges,"minimap must expose the exact outbound and return corridor graph");
  assert.deepEqual([...state.graphEdges].sort(),expectedMapEdges,"playable graph must contain only the selected corridor edges");
  assert.deepEqual(state.routeRoles,["route"],"playable graph must not include unrelated regional roads");
  assert.ok(state.featuredNames.length>0,"route guidance must expose named OSM roads");
  assert.ok(state.trafficCount>=5,"AI traffic must spawn on the highway corridor");
  assert.ok(state.minimapWidth>0 && state.minimapHeight>0 && state.minimapPainted>1000,"live minimap must draw the selected road graph");
  assert.ok(state.playerModelLoaded,"the production Corolla GLB must load");
  await page.screenshot({path:resolve(evidenceDir,"lapaz-madina-android-landscape.png"),fullPage:false});
  assert.deepEqual(pageErrors,[],"browser must not report uncaught page errors");
  console.log("Lapaz–Madina browser smoke passed: "+JSON.stringify({
    checkpoints:state.waypoints.length,
    outboundEdges:state.outboundEdges.length,
    returnEdges:state.returnEdges.length,
    selectedGraphEdges:state.graphEdges.length,
    aiTraffic:state.trafficCount,
    minimapPaintedPixels:state.minimapPainted
  }));
  await context.close();
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
