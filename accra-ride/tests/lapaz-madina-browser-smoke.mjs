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
const sectionDocument = JSON.parse(await readFile(new URL("../data/osm/lapaz-madina-sections.json", import.meta.url), "utf8"));
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
  await page.locator('#menu-areas [data-menu-back="home"]').click();
  await page.locator("#menu-start-setup").click();
  await page.waitForFunction(() => {
    const panel=document.querySelector("#ar-live-minimap");
    const runtime=window.AccraRushDebug?.roadRuntime;
    return panel && !panel.hidden && runtime && runtime.areaId === "lapaz";
  }, null, { timeout:90000, polling:250 });

  await page.waitForFunction(() => window.AccraRushDebug?.active === true, null, { timeout:30000 });
  const traversals = await page.evaluate(async () => ({
    outbound: await window.AccraRushDebug.traverseRoute("outbound", 25),
    returning: await window.AccraRushDebug.traverseRoute("return", 25)
  }));
  assert.equal(traversals.outbound.closed, false);
  assert.equal(traversals.returning.closed, false);
  assert.ok(traversals.outbound.sampleCount > 500 && traversals.returning.sampleCount > 500,
    "the entire corridor must be traversed at 25 m intervals in both directions");
  assert.ok(traversals.outbound.maxGapM <= 46 && traversals.returning.maxGapM <= 46,
    "successive rendered road samples must not contain a geometry gap");
  assert.ok(traversals.outbound.uniqueEdgeCount >= 20 && traversals.returning.uniqueEdgeCount >= 20);

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
      routeGraphEdges:(runtime.network?.edges || []).filter(edge=>edge.selection?.role==="route").map(edge=>edge.id),
      connectorGraphEdges:(runtime.network?.edges || []).filter(edge=>edge.selection?.role==="connector").map(edge=>edge.id),
      connectorZoneIds:[...new Set((runtime.network?.edges || []).filter(edge=>edge.selection?.role==="connector").map(edge=>edge.selection?.zoneId))],
      routeRoles:[...new Set((runtime.network?.edges || []).map(edge=>edge.selection?.role))].sort(),
      featuredNames:runtime.featuredRoadNames || [],
      trafficCount:debug.traffic?.length || 0,
      trafficCorollaCount:debug.traffic?.filter(vehicle=>vehicle.userData.isCorollaGLB).length || 0,
      returnDistanceM:runtime.returnHighwayRoute?.distanceM || 0,
      spawnPose:runtime.sample(runtime.playerRoute,0),
      playerYaw:debug.player?.rotation?.y ?? 0,
      playerY:debug.player?.position?.y ?? 0,
      elevationProfile:runtime.elevationProfile || {},
      busStopAccess:runtime.busStopAccess || {},
      pickupAccess:runtime.pickupAccess || {},
      authoredPedestrianBridgeCount:runtime.authoredPedestrianBridgeCount || 0,
      pedestrianBridgeCount:runtime.roadFeatures?.counts?.pedestrian_bridge || 0,
      pedestrianBridgeSpanM:runtime.roadFeatures?.counts?.pedestrian_bridge_span_m || 0,
      trafficSignalCount:runtime.roadFeatures?.counts?.traffic_signals || 0,
      authoredCrossingSignalCount:runtime.authoredCrossingSignalCount || 0,
      pickupBayEdges:runtime.network.edges.filter(edge=>edge.selection?.role==="pickup-bay").map(edge=>({id:edge.id,lengthM:edge.lengthM,laneCount:edge.lanes?.length,connected:runtime.navigationIndex.outgoing.get(edge.fromNodeId)?.some(arc=>arc.edge.id===edge.id)===true || runtime.navigationIndex.outgoing.get(edge.toNodeId)?.some(arc=>arc.edge.id===edge.id)===true || runtime.navigationIndex.outgoing.get(edge.toNodeId)?.some(arc=>arc.edge.id===edge.id)===true})),
      busBayEdges:runtime.network.edges.filter(edge=>edge.selection?.role==="bus-stop-bay").map(edge=>({
        id:edge.id,fromNodeId:edge.fromNodeId,toNodeId:edge.toNodeId,lengthM:edge.lengthM,
        laneCount:edge.lanes?.length,connected:runtime.navigationIndex.outgoing.get(edge.fromNodeId)?.some(arc=>arc.edge.id===edge.id)===true
      })),
      routeElevationValues:(runtime.raceCircuit?.segments || []).flatMap(segment=>(segment.points || []).map(point=>point.y || 0)),
      medianCount:runtime.roadGroup?.userData?.medianCount || 0,
      medianHeightM:runtime.roadGroup?.children?.find(child=>child.name==="osm-road-medians")?.userData?.medianHeightM || 0,
      medianGrassSegments:runtime.roadGroup?.children?.find(child=>child.name==="osm-road-median-grass")?.userData?.medianSegments || 0,
      bridgeEdges:runtime.roadGroup?.userData?.bridgeEdges || 0,
      featureCount:runtime.roadFeatures?.matched || 0,
      featureKinds:runtime.roadFeatures?.counts || {},
      playerModelLoaded:window.AccraRushPlayerModelLoaded === true,
      minimapWidth:canvas?.width,
      minimapHeight:canvas?.height,
      minimapPainted:painted
    };
  });
  const expected=["Abeka-Lapaz Junction","Madina"];
  assert.equal(state.areaId,"lapaz");
  assert.equal(state.sourceNetworkId,"accrarush-lapaz-osm");
  assert.equal(state.activeNetworkId,state.sourceNetworkId);
  assert.equal(state.closed,false,"Lapaz–Madina is a point-to-point highway, not a closed circuit");
  assert.notEqual(state.startNodeId,state.endNodeId);
  assert.equal(state.startNodeId,"osm-node-5.6057850_-0.2514423","player start must be the mapped Abeka–Lapaz Junction node");
  assert.equal(state.spawnPose.edgeId,state.outboundEdges[0],"player must spawn on the first main-road outbound edge");
  const spawnFacingX=-Math.sin(state.playerYaw), spawnFacingZ=-Math.cos(state.playerYaw);
  const spawnFacingDot=spawnFacingX*state.spawnPose.forwardX+spawnFacingZ*state.spawnPose.forwardZ;
  assert.ok(spawnFacingDot>0.99,"vehicle nose must face along the outbound Lapaz-to-Madina road tangent");
  assert.ok(state.elevationProfile.appliedEdges>0,"runtime must apply the downloaded SRTM profile to route edges");
  assert.ok(state.elevationProfile.appliedNodes>0,"runtime must apply SRTM elevations to route nodes");
  const routeElevationRange=Math.max(...state.routeElevationValues)-Math.min(...state.routeElevationValues);
  assert.ok(routeElevationRange>10,"the corridor must contain DEM-derived elevation variation, not a flat zero-height road");
  assert.ok(Math.abs(state.playerY-(state.spawnPose.y+.03))<0.1,"player spawn height must match the DEM-backed road surface");
  assert.ok(state.busStopAccess.generatedBays>0,"mapped bus stops must receive connected drivable access bays");
  assert.equal(state.busBayEdges.length,state.busStopAccess.generatedBays);
  assert.ok(state.busBayEdges.every(edge=>edge.connected&&edge.lengthM>0&&edge.laneCount===1),"each bus bay must be a navigable one-way edge connected at both main-road endpoints");
  assert.deepEqual(state.waypoints,expected,"the approved point-to-point corridor must expose only Lapaz and Madina as endpoints");
  assert.equal(state.returnStart,state.endNodeId,"opposing AI return route must start at Madina");
  assert.equal(state.returnEnd,state.startNodeId,"opposing AI return route must end at Lapaz");
  assert.ok(state.outboundEdges.length>=20 && state.returnEdges.length>=20,"both legal directions must contain real OSM edges");
  const expectedMapEdges=[...new Set([...state.outboundEdges,...state.returnEdges])].sort();
  assert.deepEqual([...state.minimapEdges].sort(),expectedMapEdges,"minimap must expose the exact outbound and return corridor graph");
  assert.deepEqual([...state.routeGraphEdges].sort(),expectedMapEdges,"route edges must contain only the selected outbound and return corridor");
  assert.ok(state.connectorGraphEdges.length>=20,"Tetteh Quarshie ramps and crossing roads must be included as local render context");
  assert.deepEqual(state.connectorZoneIds,["tetteh-quarshie-interchange"],"all context roads must remain inside the named interchange zone");
  assert.ok(state.routeRoles.includes("connector") && state.routeRoles.includes("route") && state.routeRoles.includes("bus-stop-bay"),"route, bounded interchange connectors and bus-stop access bays must render");
  assert.ok(state.routeRoles.every(role=>["bus-stop-bay","connector","pickup-bay","route"].includes(role)),"only approved corridor roads and generated roadside access bays may render");
  assert.ok(state.pickupAccess.generatedBays>0,"mapped taxi facilities or authored fallback must provide pickup/drop-off bays");
  assert.ok(state.pedestrianBridgeCount>0,"mapped or authored pedestrian bridges must be rendered along major crossings");
  assert.ok(state.pedestrianBridgeSpanM>=20,"pedestrian bridge must span the complete multi-carriageway road section");
  assert.ok(state.trafficSignalCount>0,"mapped or authored three-aspect vehicle signals must be rendered");
  assert.ok(state.authoredCrossingSignalCount>0,"major zebra crossings without mapped signals must receive authored vehicle lights");
  if(state.pickupAccess.generatedBays>0) {
    assert.ok(state.routeRoles.includes("pickup-bay"));
    assert.equal(state.pickupBayEdges.length,state.pickupAccess.generatedBays);
    assert.ok(state.pickupBayEdges.every(edge=>edge.connected&&edge.lengthM>0&&edge.laneCount===1));
  }
  assert.ok(state.featuredNames.length>0,"route guidance must expose named OSM roads");
  assert.ok(state.featureCount>0,"OSM roadside infrastructure must be loaded for the corridor");
  assert.ok(state.medianCount>0,"the approved corridor must render measured central medians");
  assert.equal(state.medianHeightM,0.28,"rendered median islands must rise above asphalt");
  assert.ok(state.medianGrassSegments>0,"wide N1/N4 medians must have landscaped tops");
  assert.ok(state.trafficCount>=5,"AI traffic must spawn on the highway corridor");
  assert.ok(state.minimapWidth>0 && state.minimapHeight>0 && state.minimapPainted>1000,"live minimap must draw the selected road graph");
  assert.ok(state.playerModelLoaded,"the production Corolla GLB must load");
  const sectionStarts = new Map();
  let cumulativeSectionDistance = 0;
  for (const section of sectionDocument.sections) {
    sectionStarts.set(section.id,cumulativeSectionDistance);
    cumulativeSectionDistance += section.distanceM;
  }
  const n1Section = sectionDocument.sections
    .filter(section=>section.name.includes("George Walker Bush Highway"))
    .sort((a,b)=>b.distanceM-a.distanceM)[0];
  const interchangeSection = sectionDocument.sections.find(section=>section.name.includes("Tetteh Quarshie Interchange"));
  const n4Section = sectionDocument.sections.find(section=>section.name.includes("J.J. Rawlings Avenue"));
  const checkpointDistances = [
    { name:"lapaz-entry", distance:0 },
    { name:"n1-highway", distance:n1Section ? sectionStarts.get(n1Section.id)+n1Section.distanceM/2 : sectionDocument.alignment.distanceM*.25 },
    { name:"tetteh-quarshie", distance:interchangeSection ? sectionStarts.get(interchangeSection.id) : sectionDocument.alignment.distanceM*.5 },
    { name:"n4-shiashie-legon", distance:n4Section ? sectionStarts.get(n4Section.id)+n4Section.distanceM/2 : sectionDocument.alignment.distanceM*.75 },
    { name:"madina-approach", distance:sectionDocument.alignment.distanceM-20 }
  ];
  for (const checkpoint of checkpointDistances) {
    const placed = await page.evaluate(({distance})=>window.AccraRushDebug.placeOnRoute("outbound",distance),{distance:checkpoint.distance});
    await page.screenshot({path:resolve(evidenceDir,"lapaz-madina-"+checkpoint.name+".png"),fullPage:false});
    checkpoint.edgeId = placed.edgeId;
    checkpoint.roadName = placed.roadName;
    if(checkpoint.name==="tetteh-quarshie"){
      await page.evaluate(({x,z})=>window.AccraRushDebug.overheadAt(x,z,420),{x:placed.x,z:placed.z});
      await page.screenshot({path:resolve(evidenceDir,"lapaz-madina-tetteh-quarshie-overhead.png"),fullPage:false});
    }
  }
  const returnEnd = await page.evaluate(distance=>window.AccraRushDebug.placeOnRoute("return",distance),Math.max(0,state.returnDistanceM-20));
  await page.screenshot({path:resolve(evidenceDir,"lapaz-madina-return-end.png"),fullPage:false});
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
