(()=>{
const root=document.createElement('div');
root.id='ar-hud-root';root.hidden=true;root.setAttribute('aria-hidden','true');
root.innerHTML=`
 <section id="driveReadout" class="ar-cluster" aria-label="Live driving information">
  <div class="ar-cl-pod ar-cl-gear"><b id="gearReadout">D</b><span class="ar-gear-rail" aria-hidden="true"><i>R</i><i>D</i></span></div>
  <div class="ar-speed-gauge" role="img" aria-label="Live speedometer, 0 to 180 kilometres per hour">
    <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="arBezel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ea2b0"/><stop offset=".5" stop-color="#2a3b48"/><stop offset="1" stop-color="#0c151d"/></linearGradient>
        <radialGradient id="arFace" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#14283a"/><stop offset=".7" stop-color="#07121b"/><stop offset="1" stop-color="#03070b"/></radialGradient>
        <linearGradient id="arArc" gradientUnits="userSpaceOnUse" x1="29" y1="141" x2="171" y2="141"><stop offset="0" stop-color="#ffe08a"/><stop offset=".55" stop-color="#f2bd42"/><stop offset="1" stop-color="#f08a2c"/></linearGradient>
        <linearGradient id="arNeedle" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c4"/><stop offset="1" stop-color="#f2bd42"/></linearGradient>
        <linearGradient id="arSheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      </defs>
      <circle cx="100" cy="100" r="98" fill="url(#arBezel)"/><circle cx="100" cy="100" r="94" fill="#02060a"/><circle cx="100" cy="100" r="92" fill="url(#arFace)"/><circle cx="100" cy="100" r="90" fill="none" stroke="#f2bd42" stroke-opacity=".22"/>
      <path class="ar-g-arc ar-g-track" d="M28.99 141.00A82 82 0 1 1 171.01 141.00"/><path class="ar-g-arc ar-g-fill" pathLength="100" d="M28.99 141.00A82 82 0 1 1 171.01 141.00"/>
      <path d="M42 133.5L34.2 138" class="ar-g-tick ar-g-tick--major"/><path d="M32 120.4L27.2 121.8" class="ar-g-tick"/><path d="M29.1 104.1L24.1 104.4" class="ar-g-tick"/><path d="M34 88.4L25.2 86.8" class="ar-g-tick ar-g-tick--major"/><path d="M34.8 71.9L30.2 69.9" class="ar-g-tick"/><path d="M43 57.6L39 54.6" class="ar-g-tick"/><path d="M56.9 48.7L51.1 41.8" class="ar-g-tick ar-g-tick--major"/><path d="M68.1 36.6L65.9 32.1" class="ar-g-tick"/><path d="M83.6 30.9L82.5 26" class="ar-g-tick"/><path d="M100 33V24" class="ar-g-tick ar-g-tick--major"/><path d="M116.4 30.9L117.5 26" class="ar-g-tick"/><path d="M131.9 36.6L134.1 32.1" class="ar-g-tick"/><path d="M143.1 48.7L148.9 41.8" class="ar-g-tick ar-g-tick--major"/><path d="M157 57.6L161 54.6" class="ar-g-tick"/><path d="M165.2 71.9L169.8 69.9" class="ar-g-tick"/><path d="M166 88.4L174.8 86.8" class="ar-g-tick ar-g-tick--major"/><path d="M170.9 104.1L175.9 104.4" class="ar-g-tick"/><path d="M168 120.4L172.8 121.8" class="ar-g-tick"/><path d="M158 133.5L165.8 138" class="ar-g-tick ar-g-tick--major"/>
      <text x="54.1" y="126.5" class="ar-g-num">0</text><text x="65.9" y="59.4" class="ar-g-num">60</text><text x="134.1" y="59.4" class="ar-g-num">120</text><text x="145.9" y="126.5" class="ar-g-num">180</text>
      <path class="ar-g-needle" d="M97.2 108L100 42L102.8 108Z" fill="url(#arNeedle)"/><circle cx="100" cy="100" r="9" fill="#0a1620" stroke="#f2bd42" stroke-width="2"/><circle cx="100" cy="100" r="3" fill="#f2bd42"/><ellipse cx="100" cy="56" rx="70" ry="36" fill="url(#arSheen)"/>
    </svg>
    <div class="ar-speed-digital"><strong id="speedReadout">0</strong><span>km/h</span></div>
  </div>
  <div class="ar-cl-pod ar-cl-info">
   <div class="ar-indicator ar-trip" aria-label="Trip distance"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/></svg><b id="distanceReadout">0 <small>m</small></b></div>
   <div class="ar-indicator ar-headlights" id="headlightReadout" aria-label="Vehicle headlights off"><svg viewBox="0 0 28 22" aria-hidden="true"><path d="M4 5h5a6 6 0 0 1 0 12H4z"/><path d="M15 6h9M16 11h11M15 16h9"/></svg><span>LIGHTS</span></div>
   <div class="ar-indicator ar-signal" aria-label="Live traffic signal"><svg viewBox="0 0 16 28" aria-hidden="true"><rect x="1" y="1" width="14" height="26" rx="5"/><circle cx="8" cy="7" r="3" class="lamp-red"/><circle cx="8" cy="14" r="3" class="lamp-amber"/><circle cx="8" cy="21" r="3" class="lamp-green"/></svg></div>
  </div>
  <div class="ar-cl-extra">
   <div class="ar-extra-item ar-coins" aria-label="Coins"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.7-1-1.8-1.5-3.3-1.5-1.7 0-2.8.8-2.8 2s1.1 1.8 2.8 2.1l.9.2c1.7.3 2.7 1 2.7 2.3 0 1.4-1.3 2.4-3.4 2.4-1.6 0-2.9-.6-3.7-1.7M12 5v14"/></svg><b id="coinsReadout">20</b></div>
  </div>
 </section>
 <aside id="ar-live-minimap" aria-label="Live minimap">
  <div class="ar-minimap-heading"><span id="ar-minimap-area">ACCRA RUSH</span><small>LIVE MAP</small></div>
  <canvas id="ar-minimap-canvas" width="320" height="210"></canvas>
 </aside>`;
document.body.appendChild(root);
const $=id=>root.querySelector('#'+id);
const minimapCanvas=$('ar-minimap-canvas'),minimapContext=minimapCanvas?.getContext('2d');
let minimapBase=null,minimapBounds=null;
function setMap(map){
 if(!minimapCanvas||!minimapContext||!map?.roads?.length||!map?.bounds)return;
 const {minX,maxX,minZ,maxZ}=map.bounds;
 if(![minX,maxX,minZ,maxZ].every(Number.isFinite)||maxX<=minX||maxZ<=minZ)return;
 minimapBounds=map.bounds;
 const base=document.createElement('canvas');base.width=minimapCanvas.width;base.height=minimapCanvas.height;
 const ctx=base.getContext('2d'),pad=13,w=base.width-pad*2,h=base.height-pad*2;
 const scale=Math.min(w/(maxX-minX),h/(maxZ-minZ));
 const ox=pad+(w-(maxX-minX)*scale)/2,oy=pad+(h-(maxZ-minZ)*scale)/2;
 const point=p=>({x:ox+(p.x-minX)*scale,y:base.height-(oy+(p.z-minZ)*scale)});
 ctx.fillStyle='rgba(5,15,23,.94)';ctx.fillRect(0,0,base.width,base.height);
 for(const edge of [...map.roads].sort((a,b)=>(a.role==='route')-(b.role==='route'))){
  const line=edge.centerline;if(!Array.isArray(line)||line.length<2)continue;
  ctx.beginPath();line.forEach((p,i)=>{const q=point(p);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y)});
  const isRoute=edge.role==='route';ctx.strokeStyle=isRoute?'#f2bd42':'rgba(151,178,193,.7)';
  ctx.lineWidth=isRoute?2.6:1.4;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
 }
 ctx.strokeStyle='rgba(255,255,255,.16)';ctx.lineWidth=1;ctx.strokeRect(.5,.5,base.width-1,base.height-1);
 minimapBase=base;
 const label=$('ar-minimap-area');if(label)label.textContent=(map.areaId||'Accra').replaceAll('-',' ').toUpperCase();
 drawMinimap();
}
function drawMinimap(playerX,playerZ,forwardX,forwardZ,heading){
 if(!minimapContext||!minimapBase)return;
 minimapContext.clearRect(0,0,minimapCanvas.width,minimapCanvas.height);
 minimapContext.drawImage(minimapBase,0,0);
 if(!Number.isFinite(playerX)||!Number.isFinite(playerZ)||!minimapBounds)return;
 const {minX,maxX,minZ,maxZ}=minimapBounds,pad=13,w=minimapCanvas.width-pad*2,h=minimapCanvas.height-pad*2;
 const scale=Math.min(w/Math.max(1,maxX-minX),h/Math.max(1,maxZ-minZ));
 const ox=pad+(w-(maxX-minX)*scale)/2,oy=pad+(h-(maxZ-minZ)*scale)/2;
 const x=ox+(playerX-minX)*scale,y=minimapCanvas.height-(oy+(playerZ-minZ)*scale);
 if(x<0||x>minimapCanvas.width||y<0||y>minimapCanvas.height)return;
 // The map converts world +Z to screen-up, so the car's world forward vector
 // (not its yaw sign) maps directly to the canvas arrow angle.
 const hasForward=Number.isFinite(forwardX)&&Number.isFinite(forwardZ)&&Math.hypot(forwardX,forwardZ)>1e-6;
 const angle=hasForward?Math.atan2(forwardX,forwardZ):(Number.isFinite(heading)?heading+Math.PI:Math.PI);
 minimapContext.save();minimapContext.translate(x,y);minimapContext.rotate(angle);
 minimapContext.beginPath();minimapContext.moveTo(0,-9);minimapContext.lineTo(6,7);minimapContext.lineTo(0,4);minimapContext.lineTo(-6,7);minimapContext.closePath();
 minimapContext.fillStyle='#fff';minimapContext.shadowColor='#f2bd42';minimapContext.shadowBlur=10;minimapContext.fill();minimapContext.restore();
}
function update(d={}){
 if(d.speed!=null){const speed=Math.max(0,Number(d.speed)||0);$('speedReadout').textContent=Math.round(speed);const p=Math.min(speed/180,1)*100;$('driveReadout').style.setProperty('--speed-p',p.toFixed(1));$('driveReadout').style.setProperty('--speed-fill',p+'%')}
 if(d.tripDistance!=null)$('distanceReadout').innerHTML=Math.max(0,Math.round(d.tripDistance))+' <small>m</small>';
 if(d.gear!=null){$('gearReadout').textContent=d.gear;$('driveReadout').dataset.gear=d.gear}
 if(d.coins!=null)$('coinsReadout').textContent=Math.max(0,Math.floor(d.coins)).toLocaleString();
 if(d.signal!=null)$('driveReadout').dataset.signal=String(d.signal);
 if(d.headlightsOn!=null){$('driveReadout').dataset.headlights=String(!!d.headlightsOn);$('headlightReadout').setAttribute('aria-label',d.headlightsOn?'Vehicle headlights on':'Vehicle headlights off')}
 if(d.signalDistance!=null)$('driveReadout').dataset.signalNear=String(d.signalDistance<34);
 if(d.playerX!=null&&d.playerZ!=null)drawMinimap(d.playerX,d.playerZ,d.playerForwardX,d.playerForwardZ,d.playerHeading);
}
window.AccraRushStandaloneHUD={show(){root.hidden=false;root.setAttribute('aria-hidden','false')},hide(){root.hidden=true;root.setAttribute('aria-hidden','true')},setMap,update,toast(){}};
document.addEventListener('accrarush:start',()=>window.AccraRushStandaloneHUD.show(),true);
document.addEventListener('accrarush:show-menu',()=>window.AccraRushStandaloneHUD.hide());
})();