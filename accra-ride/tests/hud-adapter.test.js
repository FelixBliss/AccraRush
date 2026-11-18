import vm from "node:vm";import fs from "node:fs";import assert from "node:assert/strict";
const js=fs.readFileSync(new URL("../phase-3-hud.js",import.meta.url),"utf8"),css=fs.readFileSync(new URL("../phase3.css",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../driveReadout.html",import.meta.url),"utf8");
let pass=0;const t=(n,f)=>{f();pass++;console.log("ok -",n)};
function make(menuOpen=false){
  const mk=()=>({textContent:"",dataset:{},attrs:{},style:{display:"",props:{},setProperty(k,v){this.props[k]=v}},setAttribute(k,v){this.attrs[k]=v}});
  const els={};for(const id of["speed","mission","driveReadout","gearReadout","distanceReadout","distanceUnit","signalReadout","startcover"])els[id]=mk();
  els.startcover.style.display=menuOpen?"":"none";els.speed.textContent="0";els.mission.textContent="Follow the road · Keep left";
  const lab=mk();els.signalReadout.querySelector=s=>s==="b"?lab:null;els.signalReadout.label=lab;
  const cbs=[];
  const ctx={document:{getElementById:id=>els[id]||null},MutationObserver:class{constructor(cb){cbs.push(cb)}observe(){}}};
  vm.runInNewContext(js,ctx);
  return{els,fire:()=>cbs.forEach(cb=>cb())};
}
const drive=(h,kmh,text)=>{h.els.speed.textContent=String(kmh);h.els.mission.textContent=text;h.fire()};
t("hidden before the game runs",()=>{const h=make(true);assert.equal(h.els.driveReadout.dataset.live,"0")});
t("live speed drives gauge fill and needle variable",()=>{const h=make();drive(h,90,"DRIVE · GREEN LIGHT · 120 m");assert.equal(h.els.driveReadout.style.props["--speed-p"],"50.0");assert.equal(h.els.driveReadout.style.props["--speed-fill"],"50.0%");assert.equal(h.els.driveReadout.dataset.live,"1")});
t("speed is clamped to the 180 km/h scale",()=>{const h=make();drive(h,240,"DRIVE · GREEN LIGHT · 5 m");assert.equal(h.els.driveReadout.style.props["--speed-p"],"100.0")});
t("reverse gear is detected",()=>{const h=make();drive(h,20,"REVERSE GEAR · RED LIGHT · 40 m");assert.equal(h.els.gearReadout.textContent,"R");assert.equal(h.els.driveReadout.dataset.gear,"R")});
t("drive gear is detected",()=>{const h=make();drive(h,20,"DRIVE · RED LIGHT · 40 m");assert.equal(h.els.gearReadout.textContent,"D")});
t("trip shows metres below 1 km and km above",()=>{const h=make();drive(h,50,"DRIVE · GREEN LIGHT · 845 m");assert.equal(h.els.distanceReadout.textContent,"845");assert.equal(h.els.distanceUnit.textContent,"m");drive(h,50,"DRIVE · GREEN LIGHT · 1240 m");assert.equal(h.els.distanceReadout.textContent,"1.24");assert.equal(h.els.distanceUnit.textContent,"km")});
t("signal phase and RED AHEAD flag follow game text",()=>{const h=make();drive(h,50,"DRIVE · RED LIGHT AHEAD · 10 m");assert.equal(h.els.signalReadout.dataset.phase,"0");assert.equal(h.els.signalReadout.dataset.near,"1");drive(h,50,"DRIVE · AMBER LIGHT · 10 m");assert.equal(h.els.signalReadout.dataset.phase,"1");assert.equal(h.els.signalReadout.dataset.near,"0");assert.equal(h.els.signalReadout.label.textContent,"AMBER");drive(h,50,"DRIVE · GREEN LIGHT · 10 m");assert.equal(h.els.signalReadout.dataset.phase,"2");assert.match(h.els.signalReadout.attrs["aria-label"],/green/)});
t("cluster hides when the menu is shown again",()=>{const h=make();drive(h,50,"DRIVE · GREEN LIGHT · 10 m");assert.equal(h.els.driveReadout.dataset.live,"1");h.els.startcover.style.display="grid";h.fire();assert.equal(h.els.driveReadout.dataset.live,"0");h.els.startcover.style.display="none";h.fire();assert.equal(h.els.driveReadout.dataset.live,"1")});
t("engine-load error text never shows the cluster",()=>{const h=make();drive(h,0,"3D engine could not load — check internet connection");assert.equal(h.els.driveReadout.dataset.live,"0")});
t("adapter only reads game state (no writes to game nodes)",()=>{assert.ok(!/mission\.textContent\s*=/.test(js)&&!/speed\.textContent\s*=/.test(js))});
t("required live-field ids exist, no fabricated telemetry",()=>{for(const id of["driveReadout","speed","gearReadout","distanceReadout","signalReadout"])assert.ok(html.includes(`id="${id}"`),id);assert.ok(!/fuel|damage|temperature|minimap/i.test(html+js)&&!/id="(fuel|damage|temp)/i.test(html))});
t("adapter keeps strings the existing test asserts",()=>{for(const s of["MutationObserver","REVERSE GEAR","AMBER LIGHT","GREEN LIGHT","speed-fill"])assert.ok(js.includes(s),s)});
t("CSS keeps selectors the existing test asserts",()=>{assert.ok(css.includes("#driveReadout")&&css.includes(".ar-speed-gauge"))});
t("CSS braces balanced",()=>{assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length)});
t("cluster ignores touches and hides in portrait",()=>{assert.ok(css.includes("pointer-events:none"));assert.ok(/@media \(orientation:portrait\)\{#driveReadout\{display:none\}/.test(css))});
const clamp=(a,v,b)=>Math.min(b,Math.max(a,v));
for(const[w,h]of[[568,320],[640,360],[732,360],[800,360],[851,393],[915,412]]){
  const vh=h/100,g=clamp(80,27*vh,124),pad=clamp(12,3.4*vh,22),gap=clamp(6,1.8*vh,12);
  const width=2*pad+g+clamp(40,12*vh,58)+clamp(78,24*vh,112)+2*gap;
  const height=6+g+clamp(8,2*vh,12),left=w/2-width/2,right=w/2+width/2;
  const chipL=10+110,chipR=w-10-95,ctrlTop=h-(h<=650?8+106:8+120);
  assert.ok(left>chipL,`${w}x${h} overlaps brand chip`);assert.ok(right<chipR,`${w}x${h} overlaps coins chip`);assert.ok(height+30<ctrlTop,`${w}x${h} reaches controls`);
  console.log(`   ${w}x${h}: cluster ${Math.round(width)}x${Math.round(height)}px at x=${Math.round(left)}..${Math.round(right)}, mission chip ends ~y=${Math.round(g+24+26)}, controls start y>=${ctrlTop}`);
}
pass++;console.log("ok - geometry model clear of chips and controls at 6 landscape sizes");
console.log(pass+" checks passed");
