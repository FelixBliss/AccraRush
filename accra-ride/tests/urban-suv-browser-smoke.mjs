import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webp":"image/webp",".glb":"model/gltf-binary",".svg":"image/svg+xml"};
const server=createServer(async(req,res)=>{try{const file=resolve(root,"."+decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname));if(file!==root&&!file.startsWith(root+sep))throw new Error("Invalid path");const info=await stat(file),target=info.isDirectory()?resolve(file,"index.html"):file;res.writeHead(200,{"content-type":mime[extname(target)]||"application/octet-stream","cache-control":"no-store"});res.end(await readFile(target));}catch{res.writeHead(404);res.end("Not found");}});
await new Promise(resolveListen=>server.listen(4175,"127.0.0.1",resolveListen));
const browser=await chromium.launch({headless:true,args:["--no-sandbox","--enable-webgl","--ignore-gpu-blocklist","--use-gl=angle","--use-angle=swiftshader"]});
const errors=[];
try{
 const context=await browser.newContext({viewport:{width:832,height:384},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
 await page.goto("http://127.0.0.1:4175/accrarush.html?debug=1",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>window.THREE&&window.AccraRushMenuConfig,{timeout:30000});
 await page.locator("#menu-garage-direct").click();
 await page.locator('[data-model="urban-suv"]').click();
 const garage=await page.evaluate(()=>({model:window.AccraRushMenuConfig.vehicle,name:document.querySelector("#garage-vehicle-name")?.textContent,top:document.querySelector("#garage-top-speed")?.textContent,reverse:document.querySelector("#garage-reverse-speed")?.textContent,selected:document.querySelector('[data-model="urban-suv"]')?.getAttribute("aria-pressed"),preview:document.querySelector("#suv-preview-art")?.style.display}));
 assert.equal(garage.model,"urban-suv");assert.match(garage.name,/SUV/);assert.match(garage.top,/165/);assert.match(garage.reverse,/75/);assert.equal(garage.selected,"true");assert.equal(garage.preview,"block");
 await page.locator('#menu-garage [data-menu-back="home"]').click();
 await page.locator("#menu-start-setup").click();
 await page.waitForFunction(()=>window.AccraRushDebug?.active===true,{},{timeout:45000});
 const game=await page.evaluate(()=>({vehicle:window.AccraRushMenuConfig.vehicle,model:window.AccraRushDebug.player.children.find(o=>o.userData?.vehicleModelId)?.userData?.vehicleModelId,dimensions:window.AccraRushDebug.player.children.find(o=>o.userData?.vehicleModelId)?.userData?.dimensions}));
 assert.equal(game.vehicle,"urban-suv");assert.equal(game.model,"urban-suv");assert.ok(game.dimensions.length>3.5&&game.dimensions.width>1.9);
 assert.deepEqual(errors,[],"SUV gameplay smoke must have no uncaught browser errors");
 console.log("Urban SUV browser smoke passed: "+JSON.stringify({garage,game}));
 await context.close();
}finally{await browser.close();await new Promise(resolveClose=>server.close(resolveClose));}
