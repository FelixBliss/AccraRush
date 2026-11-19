(()=> {
const root=document.createElement('div');
root.id='ar-hud-root';root.hidden=true;root.setAttribute('aria-hidden','true');
root.innerHTML=`
<div class="arhud-toast" id="arhud-toast"></div>
<div id="arhud-dash">
 <div class="arhud-col">
  <div class="arhud-sign" id="arhud-sign">50</div>
  <div class="arhud-nav"><svg viewBox="0 0 48 48" aria-hidden="true"><path id="arhud-arrow" d="M24 6 L38 22 H29 V42 H19 V22 H10 Z" fill="#38f2c8"/></svg><b id="arhud-nd">800 m</b><small id="arhud-nt">Continue</small></div>
 </div>
 <div class="arhud-cluster">
  <svg viewBox="40 52 320 160" aria-hidden="true"><defs><linearGradient id="arhud-ag" x1="0" x2="1"><stop offset="0" stop-color="#38f2c8"/><stop offset=".7" stop-color="#ffb020"/><stop offset="1" stop-color="#ff3d4d"/></linearGradient></defs>
   <g id="arhud-ticks"></g><path id="arhud-arc" fill="none" stroke="url(#arhud-ag)" stroke-width="9" stroke-linecap="round"/><line id="arhud-needle" x1="200" y1="200" x2="200" y2="62" stroke="#ff3d4d" stroke-width="3" stroke-linecap="round"/><circle cx="200" cy="200" r="6" fill="#0a1a24" stroke="#ff3d4d" stroke-width="2"/></svg>
  <div class="arhud-ro"><div class="arhud-spd" id="arhud-spd">0</div><div class="arhud-unit">KM/H</div></div>
  <div class="arhud-gear" id="arhud-gear">N</div><div class="arhud-eco" id="arhud-eco">ECO 100%</div>
 </div>
 <div class="arhud-col"><div class="arhud-mini">
  <div class="arhud-row"><span>LEVEL <b id="arhud-lv">1</b></span><span class="arhud-cbx">COMBO ×<b class="arhud-cbx" id="arhud-cb">1</b></span></div>
  <div class="arhud-bar"><i id="arhud-xp"></i></div>
  <div class="arhud-row"><span>SCORE</span><b class="arhud-sc" id="arhud-sc">0</b></div>
  <div class="arhud-row"><span>FUEL</span></div><div class="arhud-bar"><i id="arhud-fuel"></i></div>
 </div></div>
</div>`;
document.body.appendChild(root);
const $=id=>root.querySelector('#arhud-'+id);
const cx=200,cy=200,R=150,A0=-210,A1=30,RPM_MAX=8000;
const pt=(a,r)=>[cx+r*Math.cos(a*Math.PI/180),cy+r*Math.sin(a*Math.PI/180)];
let ticks='';
for(let i=0;i<=80;i++){const a=A0+(A1-A0)*i/80,m=i%10===0,[x1,y1]=pt(a,R-(m?20:11)),[x2,y2]=pt(a,R-2);
 ticks+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${i>66?'#ff3d4d':'#9fe'}" stroke-width="${m?3:1.2}" opacity="${m?1:.5}"/>`;
 if(m){const[tx,ty]=pt(a,R-38);ticks+=`<text x="${tx}" y="${ty+5}" fill="#cfe" font-size="15" text-anchor="middle" font-family="Rajdhani,sans-serif" font-weight="700">${i/10}</text>`}}
$('ticks').innerHTML=ticks+`<text x="200" y="120" fill="#7fa3ad" font-size="11" text-anchor="middle" letter-spacing="2">RPM ×1000</text>`;
let timer=null,tT=null,k=0;
const HUD={
 update(d={}) {
  if(d.speed!=null){$('spd').textContent=Math.round(d.speed);if(d.limit!=null)$('spd').style.color=d.speed>d.limit+3?'#ff3d4d':''}
  if(d.rpm!=null){const a=A0+(A1-A0)*Math.min(d.rpm/RPM_MAX,1),[x,y]=pt(a,138),n=$('needle');n.setAttribute('x2',x);n.setAttribute('y2',y);const[sx,sy]=pt(A0,R+10),[ex,ey]=pt(a,R+10);$('arc').setAttribute('d',`M${sx} ${sy} A ${R+10} ${R+10} 0 ${a-A0>180?1:0} 1 ${ex} ${ey}`)}
  if(d.gear!=null)$('gear').textContent=d.gear;
  if(d.limit!=null){$('sign').textContent=d.limit;$('sign').classList.toggle('over',d.speed!=null&&d.speed>d.limit+3)}
  if(d.score!=null)$('sc').textContent=Math.floor(d.score).toLocaleString();
  if(d.combo!=null)$('cb').textContent=d.combo;
  if(d.level!=null)$('lv').textContent=d.level;
  if(d.xpPercent!=null)$('xp').style.width=d.xpPercent+'%';
  if(d.fuel!=null)$('fuel').style.width=d.fuel+'%';
  if(d.eco!=null)$('eco').textContent='ECO '+Math.round(d.eco)+'%';
  if(d.navDist!=null)$('nd').textContent=Math.max(0,Math.round(d.navDist))+' m';
  if(d.navText!=null)$('nt').textContent=d.navText;
  if(d.navRotate!=null)$('arrow').setAttribute('transform',`rotate(${d.navRotate} 24 24)`);
 },
 toast(message){const e=$('toast');e.textContent=message;e.classList.add('on');clearTimeout(tT);tT=setTimeout(()=>e.classList.remove('on'),2200)}
};
function startDemo(){if(timer!==null)return;k=0;timer=setInterval(()=>{k+=.03;const s=90+60*Math.sin(k);HUD.update({speed:s,rpm:2000+s*30,gear:Math.min(6,1+Math.floor(s/30)),limit:100,score:k*100,combo:3,level:2,xpPercent:(k*10)%100,fuel:70,eco:92,navDist:800-(k*40)%800,navText:'Turn left'})},50)}
function stopDemo(){if(timer!==null){clearInterval(timer);timer=null}}
window.AccraRushStandaloneHUD={show(){root.hidden=false;root.setAttribute('aria-hidden','false');startDemo()},hide(){root.hidden=true;root.setAttribute('aria-hidden','true');stopDemo()},update:HUD.update,toast:HUD.toast};
document.addEventListener('accrarush:show-menu',()=>window.AccraRushStandaloneHUD.hide());
})();