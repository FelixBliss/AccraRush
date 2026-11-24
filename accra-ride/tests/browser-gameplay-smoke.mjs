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
// Offline sandboxes: set THREE_LOCAL_DIR to a three.js r160 checkout to serve the CDN imports locally.
const threeDir = process.env.THREE_LOCAL_DIR;
const evidenceDir = process.env.EVIDENCE_DIR || "artifacts";
const { mkdir } = await import("node:fs/promises");
await mkdir(evidenceDir, { recursive:true });

try {
  for (const area of [{id:"accra-central",label:"Accra Central"},{id:"lapaz",label:"Lapaz"}]) {
    const context = await browser.newContext({ viewport:{width:832,height:384}, deviceScaleFactor:1, isMobile:true, hasTouch:true });
    if (threeDir) {
      await context.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, async route => {
        const rel = route.request().url().match(/three@[^/]+\/(.*)$/)[1].split("?")[0];
        try { await route.fulfill({ body: await readFile(resolve(threeDir, rel)), contentType:"text/javascript" }); }
        catch { await route.abort(); }
      });
      await context.route(/ajax\.googleapis\.com|fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    }
    const page = await context.newPage();
    page.on("pageerror", error => failures.push(area.id + ": " + error.message));
    if (process.env.BROWSER_DEBUG) page.on("console", m => { if (!/GL Driver/.test(m.text())) console.log("[browser]", m.text().slice(0, 200)); });
    await page.goto("http://127.0.0.1:4173/accrarush.html?debug=1", { waitUntil:"domcontentloaded" });
    await page.waitForFunction(() => window.THREE && window.THREE.WebGLRenderer, null, { timeout:30000 });
    await page.locator("#menu-play").click();
    await page.waitForFunction(() =>
      document.querySelector('[data-area-map="accra-central"] svg path') &&
      document.querySelector('[data-area-map="lapaz"] svg path'), null, { timeout:60000, polling:250 });
    const mapPreview = await page.locator('[data-area-map="' + area.id + '"] svg path').count();
    assert.ok(mapPreview > 0, area.label + " actual OSM map preview did not render");
    await page.locator('[data-area-card="' + area.id + '"]').click();
    await page.locator("#menu-areas [data-menu-back=\"home\"]").click();
    await page.locator("#menu-start-setup").click();
    await page.waitForFunction(() => {
      const panel=document.querySelector("#ar-live-minimap"),canvas=document.querySelector("#ar-minimap-canvas");
      if(!panel||panel.hidden||!canvas)return false;
      const data=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
      let painted=0;for(let i=3;i<data.length;i+=4)if(data[i]>0)painted++;
      return painted>100;
    }, null, { timeout:60000, polling:250 });
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
    const norm = s => String(s).toLowerCase().replace(/[\u2013\u2014-]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
    for (const name of mapState.featuredNames) {
      assert.ok(mapState.networkNames.some(n => norm(n) === norm(name)), area.label + " missing featured road in live graph: " + name);
    }
    // A single successful toast is insufficient: verify that each of the five
    // featured corridors can independently resolve to its own street-name toast.
    const toastTargets = await page.evaluate(() => {
      const runtime = window.AccraRushDebug?.roadRuntime;
      if (!runtime) return [];
      return runtime.featuredRoadNames.map(name => {
        const key = s => String(s).toLowerCase().replace(/[\u2013\u2014-]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
        const edges = runtime.network.edges.filter(edge => key(edge.osm?.name) === key(name));
        for (const edge of edges) {
          const points = edge.centerline || [];
          const candidates = points.length > 2
            ? [points[Math.floor(points.length * .25)], points[Math.floor(points.length * .5)], points[Math.floor(points.length * .75)]]
            : points;
          for (const point of candidates) {
            if (point && key(runtime.findNearestRoad(point.x, point.z, 55)?.edge?.osm?.name) === key(name)) {
              return { name: edge.osm.name, x: point.x, z: point.z };
            }
          }
        }
        return { name, missing: true };
      });
    });
    assert.equal(toastTargets.length, 5, area.label + " must test all five featured-road toasts");
    for (const target of toastTargets) {
      assert.ok(!target.missing, area.label + " cannot resolve a named-road location for toast: " + target.name);
      // Move off-road first so the next frame must emit a fresh entry toast.
      await page.evaluate(() => window.AccraRushDebug.player.position.set(1000000, 0, 1000000));
      await page.waitForTimeout(80);
      await page.evaluate(({x,z}) => window.AccraRushDebug.player.position.set(x, 0, z), target);
      await page.waitForFunction(name => (document.querySelector("#toast")?.textContent || "") === name,
        target.name, { timeout:5000 });
    }
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
    assert.ok(visual.roadMeshes > 0 && visual.roadEdges > 100, area.label + " road geometry was not added to the Three.js scene");
    assert.ok(visual.trafficCount >= 20, area.label + " AI traffic did not spawn");
    assert.ok(visual.trafficCorollaCount >= 20, area.label + " AI traffic is still using procedural cars instead of the Corolla GLB: " + visual.trafficCorollaCount);
    assert.ok(visual.trafficCorollaWheelSets, area.label + " AI Corolla wheel pivots were not connected");
    assert.ok(visual.playerCenter.z >= -1 && visual.playerCenter.z <= 1 &&
      Math.abs(visual.playerCenter.x) <= 1 && Math.abs(visual.playerCenter.y) <= 1,
      area.label + " player vehicle is outside the active camera frustum: " + JSON.stringify(visual));
    // ---- selected-graph identity: world, minimap, navigation and AI share one graph ----
    const graph = await page.evaluate(() => {
      const d = window.AccraRushDebug, rt = d.roadRuntime;
      const edgeIds = new Set(rt.network.edges.map(e => e.id));
      const mapIds = rt.minimap.roads.map(r => r.id);
      const degree = new Map(), incident = new Map();
      for (const e of rt.network.edges) for (const nodeId of [e.fromNodeId, e.toNodeId]) {
        degree.set(nodeId, (degree.get(nodeId) || 0) + 1);
        if (!incident.has(nodeId)) incident.set(nodeId, []);
        incident.get(nodeId).push(e.osm?.name || e.osm?.highway || e.id);
      }
      const degreeHistogram = {};
      for (const value of degree.values()) degreeHistogram[value] = (degreeHistogram[value] || 0) + 1;
      const degreeOneExamples = [...degree].filter(([, value]) => value === 1).slice(0, 12)
        .map(([nodeId]) => ({ nodeId, roads: incident.get(nodeId) }));
      let onGraph = 0;
      for (const v of d.traffic) if (rt.findNearestRoad(v.position.x, v.position.z, 14)) onGraph++;
      return {
        edges: rt.network.edges.length, sceneEdges: rt.roadGroup.userData.edgeCount, skipped: rt.roadGroup.userData.skippedEdges,
        mapEdges: mapIds.length, mapSubset: mapIds.every(id => edgeIds.has(id)), selection: rt.selection,
        routeRoles: [...new Set(rt.network.edges.map(e => e.selection?.role))].sort(),
        traffic: d.traffic.length, trafficOnGraph: onGraph, degreeHistogram, degreeOneExamples
      };
    });
    console.log(area.label + ": selected graph topology " + JSON.stringify({ degreeHistogram: graph.degreeHistogram, degreeOneExamples: graph.degreeOneExamples, selectedEndpoints: graph.selection.selectedEndpoints }));
    assert.equal(graph.sceneEdges, graph.edges, area.label + " scene must render exactly the selected graph");
    assert.equal(graph.skipped, 0, area.label + " some selected edges failed to render");
    assert.equal(graph.mapEdges, graph.edges, area.label + " minimap must contain exactly the selected graph");
    assert.ok(graph.mapSubset, area.label + " minimap edge not in the playable graph");
    assert.ok(graph.edges < graph.selection.sourceEdgeCount * 0.2, area.label + " selected graph is not sufficiently reduced from its full OSM extract: " + graph.edges + "/" + graph.selection.sourceEdgeCount);
    const feat = await page.evaluate(() => { const r = window.AccraRushDebug.roadRuntime.roadFeatures; return { available: r.available, matched: r.matched, counts: r.counts, error: r.error || null }; });
    assert.ok(feat.available && feat.matched > 10 && feat.counts.crossing > 0 && feat.counts.traffic_signals > 0, area.label + " real OSM features must be rendered: " + JSON.stringify(feat));
    console.log(area.label + ": OSM features on selected graph " + JSON.stringify(feat.counts));
    assert.equal(graph.selection.connected, true);
    assert.equal(graph.selection.routeEndpointCount, 0, area.label + " selected named routes must not terminate without a real junction");
    assert.equal(graph.selection.roads.length, 5);
    assert.ok(graph.trafficOnGraph / graph.traffic >= 0.9, area.label + " AI traffic left the selected graph: " + graph.trafficOnGraph + "/" + graph.traffic);

    // ---- manual steering: heading follows the driver, never the route or the navigation ----
    const heading = () => page.evaluate(() => window.AccraRushDebug.player.rotation.y);
    const speedNow = () => page.evaluate(() => Number(document.querySelector("#speed").textContent));
    const gas = down => page.locator("#gas").dispatchEvent(down ? "pointerdown" : "pointerup", { pointerId:1, pointerType:"mouse", isPrimary:true, button:0, buttons:down ? 1 : 0 });
    await gas(true);
    await page.waitForFunction(() => Number(document.querySelector("#speed").textContent) > 12, null, { timeout:15000 });
    const h0 = await heading();
    await page.waitForTimeout(700);
    const straight = Math.abs((await heading()) - h0);
    assert.ok(straight < 0.02, area.label + " vehicle turned by itself without steering input (" + straight.toFixed(3) + " rad): navigation/road must not steer");
    await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(900);
    const hl = await heading(); await page.keyboard.up("ArrowLeft");
    assert.ok(hl - h0 > 0.08, area.label + " left steering must turn the vehicle left (heading delta " + (hl - h0).toFixed(3) + ")");
    await page.waitForTimeout(900);
    const hr0 = await heading(); await page.waitForTimeout(500);
    assert.ok(Math.abs((await heading()) - hr0) < 0.02, area.label + " steering must return to centre on release");
    await page.keyboard.down("ArrowRight"); await page.waitForTimeout(1800);
    const hr = await heading(); await page.keyboard.up("ArrowRight");
    assert.ok(hr0 - hr > 0.15, area.label + " right steering must turn the vehicle right (heading delta " + (hr - hr0).toFixed(3) + ")");
    // accelerate while steering, then brake while steering: independent inputs
    const s1 = await speedNow();
    await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(600);
    const s2 = await speedNow(); const hb0 = await heading();
    await gas(false); await page.keyboard.down("ArrowDown"); await page.waitForTimeout(700);
    const s3 = await speedNow(); const hb1 = await heading();
    await page.keyboard.up("ArrowDown"); await page.keyboard.up("ArrowLeft");
    assert.ok(s2 >= s1 - 1, area.label + " throttle must keep working while steering");
    assert.ok(s3 < s2, area.label + " brake must slow the car while steering (" + s2 + " -> " + s3 + ")");
    assert.ok(hb1 - hb0 > 0.02, area.label + " steering must still work while braking");
    console.log(area.label + ": steering ok (left +" + (hl - h0).toFixed(2) + " rad, right " + (hr - hr0).toFixed(2) + " rad, brake+steer " + s2 + "->" + s3 + " km/h)");
    // leave the selected road: the car must go where it is steered, not be pulled back to a route
    const before = await page.evaluate(() => ({ x: window.AccraRushDebug.player.position.x, z: window.AccraRushDebug.player.position.z }));
    await gas(true); await page.keyboard.down("ArrowRight"); await page.waitForTimeout(2500); await page.keyboard.up("ArrowRight");
    await gas(false);

    // ---- evidence screenshots: gameplay, minimap, structure close-ups ----
    await page.screenshot({ path: evidenceDir + "/" + area.id + "-gameplay.png" });
    await page.locator("#ar-live-minimap").screenshot({ path: evidenceDir + "/" + area.id + "-live-minimap.png" });
    const spots = area.id === "accra-central" ? [["danquah-circle", "Danquah Circle"]] : [["atta-mills-street", "Atta Mills Street"]];
    for (const [slug, name] of spots) {
      const spot = await page.evaluate(n => {
        const e = window.AccraRushDebug.roadRuntime.network.edges.find(x => x.osm?.name === n);
        if (!e) return null;
        const p = e.centerline[Math.floor(e.centerline.length / 2)];
        return { x: p.x, z: p.z };
      }, name);
      assert.ok(spot, area.label + " selected graph must contain " + name);
      await page.evaluate(({x,z}) => { const p = window.AccraRushDebug.player; p.position.set(x, 0, z); }, spot);
      await page.waitForTimeout(900);
      await page.screenshot({ path: evidenceDir + "/" + area.id + "-" + slug + "-ingame.png" });
    }
    void before;
    const sig = await page.evaluate(() => {
      const f = window.AccraRushDebug.roadRuntime.roadFeatures.items.find(x => x.kind === "traffic_signals");
      return f && { x: f.position.x, z: f.position.z, hx: f.heading.x, hz: f.heading.z };
    });
    await page.evaluate(({ x, z, hx, hz }) => { const p = window.AccraRushDebug.player; p.position.set(x - hx * 10, 0, z - hz * 10); p.rotation.y = Math.atan2(-hx, -hz); }, sig);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: evidenceDir + "/" + area.id + "-traffic-signals-crossing.png" });
    const furniture = await page.evaluate(() => {
      const items = window.AccraRushDebug.roadRuntime.roadFeatures.items;
      const f = items.find(x => x.kind === "street_lamp") || items.find(x => x.kind === "bus_stop");
      return f && { kind: f.kind, x: f.position.x, z: f.position.z, hx: f.heading.x, hz: f.heading.z };
    });
    if (furniture) {
      await page.evaluate(({ x, z, hx, hz }) => { const p = window.AccraRushDebug.player; p.position.set(x - hx * 12, 0, z - hz * 12); p.rotation.y = Math.atan2(-hx, -hz); }, furniture);
      await page.waitForTimeout(3000);
      await page.screenshot({ path: evidenceDir + "/" + area.id + "-roadside-" + furniture.kind + ".png" });
    }
    await page.screenshot({ path: evidenceDir + "/" + area.id + "-landscape.png" });
    console.log(area.label + ": road surfaces, " + visual.roadEdges + " edges, " + visual.trafficCount +
      " AI vehicles; player is in camera frustum; movement confirmed at " + speed + " km/h");
    await context.close();
  }
  assert.deepEqual(failures, [], "Uncaught browser errors: " + failures.join("; "));
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
