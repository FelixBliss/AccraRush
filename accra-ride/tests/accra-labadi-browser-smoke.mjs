import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const mime={".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".json":"application/json",".webp":"image/webp",".glb":"model/gltf-binary",".svg":"image/svg+xml"};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);
    const file=resolve(root,"."+pathname);
    if(file!==root&&!file.startsWith(root+sep))throw new Error("Invalid path");
    const info=await stat(file),target=info.isDirectory()?resolve(file,"index.html"):file;
    res.writeHead(200,{"content-type":mime[extname(target)]||"application/octet-stream","cache-control":"no-store"});
    res.end(await readFile(target));
  }catch{res.writeHead(404);res.end("Not found");}
});
const evidenceDir=process.env.EVIDENCE_DIR||"artifacts";
await new Promise(resolveListen=>server.listen(4174,"127.0.0.1",resolveListen));
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--enable-webgl","--ignore-gpu-blocklist","--use-gl=angle","--use-angle=swiftshader"]});
const pageErrors=[];
try{
  const context=await browser.newContext({viewport:{width:832,height:384},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  page.on("pageerror",error=>pageErrors.push(error.message));
  await page.goto("http://127.0.0.1:4174/accrarush.html?debug=1",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>window.THREE&&window.THREE.WebGLRenderer,null,{timeout:30000});
  await page.locator("#menu-play").click();
  await page.waitForFunction(()=>document.querySelector('[data-area-map="accra-central"] svg path'),null,{timeout:60000,polling:250});
  const preview=await page.locator('[data-area-map="accra-central"]').evaluate(host=>({
    networkId:host.dataset.networkId||"",edgeCount:Number(host.dataset.edgeCount||0),
    label:host.querySelector("svg")?.getAttribute("aria-label")||""
  }));
  assert.equal(preview.networkId,"accrarush-accra-central-osm","Route 2 preview must use the newly imported OSM network");
  assert.ok(preview.edgeCount>=10,"Route 2 preview must show a meaningful corridor");
  assert.match(preview.label,/Accra–Labadi/);
  await page.locator('[data-area-card="accra-central"]').click();
  await page.locator('#menu-areas [data-menu-back="home"]').click();
  await page.locator("#menu-start-setup").click();
  await page.waitForFunction(()=>{
    const panel=document.querySelector("#ar-live-minimap"),runtime=window.AccraRushDebug?.roadRuntime;
    return panel&&!panel.hidden&&runtime&&runtime.areaId==="accra-central";
  },null,{timeout:90000,polling:250});
  await page.waitForFunction(()=>window.AccraRushDebug?.active===true,null,{timeout:30000});
  const result=await page.evaluate(async()=>{
    const debug=window.AccraRushDebug,runtime=debug.roadRuntime;
    const outbound=await debug.traverseRoute("outbound",30);
    const returning=await debug.traverseRoute("return",30);
    return {
      areaId:runtime.areaId,networkId:runtime.network?.id,closed:runtime.raceCircuit?.closed,
      start:runtime.raceCircuit?.startNodeId,end:runtime.raceCircuit?.destinationNodeId,
      returnStart:runtime.returnHighwayRoute?.startNodeId,returnEnd:runtime.returnHighwayRoute?.destinationNodeId,
      names:runtime.featuredRoadNames||[],outbound,returning,
      minimapRoads:runtime.minimap?.roads?.length||0,
      featureCount:runtime.roadFeatures?.matched||0
    };
  });
  assert.equal(result.areaId,"accra-central");
  assert.equal(result.networkId,"accrarush-accra-central-osm");
  assert.equal(result.closed,false,"Accra–Labadi must be a point-to-point corridor");
  assert.notEqual(result.start,result.end);
  assert.equal(result.returnStart,result.end);
  assert.equal(result.returnEnd,result.start);
  assert.ok(result.names.some(name=>/ring road east/i.test(name)));
  assert.ok(result.names.some(name=>/la road|la rd/i.test(name)));
  assert.ok(result.outbound.sampleCount>150&&result.returning.sampleCount>150);
  assert.ok(result.outbound.maxGapM<=46&&result.returning.maxGapM<=46);
  assert.ok(result.minimapRoads>0);
  assert.ok(result.featureCount>0);
  assert.deepEqual(pageErrors,[],"Route 2 browser smoke must not report uncaught page errors");
  await page.screenshot({path:resolve(evidenceDir,"accra-labadi-route2-gameplay.png"),fullPage:false});
  console.log("Accra–Labadi Route 2 browser smoke passed: "+JSON.stringify({
    outboundSamples:result.outbound.sampleCount,returnSamples:result.returning.sampleCount,
    namedRoads:result.names,minimapRoads:result.minimapRoads,features:result.featureCount
  }));
  await context.close();
}finally{
  await browser.close();
  await new Promise(resolveClose=>server.close(resolveClose));
}
