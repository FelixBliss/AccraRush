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
 <section id="ar-live-minimap" aria-label="Live road map" hidden><div class="ar-map-heading"><b id="ar-map-area">ACCRA CENTRAL</b><span>LIVE ROAD MAP</span></div><canvas id="ar-map-network" aria-hidden="true"></canvas><canvas id="ar-map-player" aria-hidden="true"></canvas><div class="ar-map-legend"><i></i> FEATURED CORRIDORS</div></section>`;
document.body.appendChild(root);
const $=id=>root.querySelector('#'+id);
const featuredAliases={
 "accra-central":["independence avenue","independence ave","ring road central","ring rd central","ring road east","ring rd east","ring road west","ring rd west","kwame nkrumah"],
 "lapaz":["nsawam road","nsawam rd","george walker bush","bush highway","kwashieman","ofankor road","achimota forest","j a kuffour","kuffour avenue"]
};
let liveMapBounds=null;
function setMap(network,areaId){
 const panel=$("ar-live-minimap"),base=$("ar-map-network"),marker=$("ar-map-player");
 if(!panel||!base||!marker||!Array.isArray(network?.edges))return false;
 const width=520,height=330,pad=18;let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const edge of network.edges)for(const point of edge.centerline||[]){minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minZ=Math.min(minZ,point.z);maxZ=Math.max(maxZ,point.z);}
 if(!Number.isFinite(minX)||!Number.isFinite(minZ))return false;
 const spanX=Math.max(1,maxX-minX),spanZ=Math.max(1,maxZ-minZ),scale=Math.min((width-pad*2)/spanX,(height-pad*2)/spanZ),ox=(width-spanX*scale)/2,oy=(height-spanZ*scale)/2;
 liveMapBounds={minX,maxZ,scale,ox,oy,width,height,areaId};
 base.width=width;base.height=height;marker.width=width;marker.height=height;
 const ctx=base.getContext("2d");ctx.clearRect(0,0,width,height);ctx.lineCap="round";ctx.lineJoin="round";
 const pointXY=point=>[ox+(point.x-minX)*scale,oy+(maxZ-point.z)*scale];
 for(const edge of network.edges){const points=edge.centerline;if(!Array.isArray(points)||points.length<2)continue;ctx.beginPath();points.forEach((point,index)=>{const [x,y]=pointXY(point);if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.strokeStyle="rgba(166,190,207,.36)";ctx.lineWidth=1.45;ctx.stroke();}
 const aliases=featuredAliases[areaId]||[];
 for(const edge of network.edges){const name=String(edge.osm?.name||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();if(!aliases.some(alias=>name.includes(alias)))continue;const points=edge.centerline;if(!Array.isArray(points)||points.length<2)continue;ctx.beginPath();points.forEach((point,index)=>{const [x,y]=pointXY(point);if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.strokeStyle="#f2bd42";ctx.lineWidth=3.3;ctx.stroke();}
 $("ar-map-area").textContent=areaId==="lapaz"?"LAPAZ":"ACCRA CENTRAL";panel.hidden=false;return true;
}
function updateMapPlayer(pose){
 if(!liveMapBounds||!pose)return;
 const canvas=$("ar-map-player"),ctx=canvas?.getContext("2d");if(!ctx)return;
 const b=liveMapBounds,x=b.ox+(pose.x-b.minX)*b.scale,y=b.oy+(b.maxZ-pose.z)*b.scale;
 ctx.clearRect(0,0,b.width,b.height);
 const angle=Math.atan2(-pose.forwardZ,pose.forwardX);
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(11,0);ctx.lineTo(-8,-6);ctx.lineTo(-5,0);ctx.lineTo(-8,6);ctx.closePath();ctx.fillStyle="#ffffff";ctx.strokeStyle="#092235";ctx.lineWidth=2;ctx.fill();ctx.stroke();ctx.restore();
 ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.strokeStyle="rgba(255,255,255,.7)";ctx.lineWidth=1.4;ctx.stroke();
}
function update(d={}){
 if(d.speed!=null){const speed=Math.max(0,Number(d.speed)||0);$('speedReadout').textContent=Math.round(speed);const p=Math.min(speed/180,1)*100;$('driveReadout').style.setProperty('--speed-p',p.toFixed(1));$('driveReadout').style.setProperty('--speed-fill',p+'%')}
 if(d.tripDistance!=null)$('distanceReadout').innerHTML=Math.max(0,Math.round(d.tripDistance))+' <small>m</small>';
 if(d.gear!=null){$('gearReadout').textContent=d.gear;$('driveReadout').dataset.gear=d.gear}
 if(d.coins!=null)$('coinsReadout').textContent=Math.max(0,Math.floor(d.coins)).toLocaleString();
 if(d.signal!=null)$('driveReadout').dataset.signal=String(d.signal);
 if(d.headlightsOn!=null){$('driveReadout').dataset.headlights=String(!!d.headlightsOn);$('headlightReadout').setAttribute('aria-label',d.headlightsOn?'Vehicle headlights on':'Vehicle headlights off')}
 if(d.signalDistance!=null)$('driveReadout').dataset.signalNear=String(d.signalDistance<34);
 if(d.playerPose)updateMapPlayer(d.playerPose);
}
window.AccraRushStandaloneHUD={show(){root.hidden=false;root.setAttribute('aria-hidden','false')},hide(){root.hidden=true;root.setAttribute('aria-hidden','true')},setMap,update,toast(){}};
document.addEventListener('accrarush:start',()=>window.AccraRushStandaloneHUD.show(),true);
document.addEventListener('accrarush:show-menu',()=>window.AccraRushStandaloneHUD.hide());
})();