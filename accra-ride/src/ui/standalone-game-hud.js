(()=>{
const root=document.createElement('div');
root.id='ar-hud-root';root.hidden=true;root.setAttribute('aria-hidden','true');
root.innerHTML=`
 <section id="arhud-panel" aria-label="Driving information">
  <div class="arhud-top">
   <div class="arhud-speedbox">
    <svg class="arhud-speedring" viewBox="0 0 100 100" aria-hidden="true">
     <circle class="arhud-ring-track" cx="50" cy="50" r="43"/>
     <circle class="arhud-ring-value" id="arhud-speed-arc" cx="50" cy="50" r="43"/>
    </svg>
    <div class="arhud-speedread"><b id="arhud-spd">0</b><small>KM/H</small></div>
   </div>
   <div class="arhud-side">
    <div class="arhud-limit"><small>LIMIT</small><b id="arhud-sign">50</b></div>
    <div class="arhud-gear"><small>GEAR</small><b id="arhud-gear-value">N</b></div>
   </div>
  </div>
  <div class="arhud-divider"></div>
  <div class="arhud-mission">
   <div class="arhud-section-label">MISSION TIME</div>
   <b class="arhud-time" id="arhud-time">03:00</b>
   <div class="arhud-earned"><span> EARNED </span><b id="arhud-earned">0</b></div>
  </div>
  <div class="arhud-divider"></div>
  <div class="arhud-route">
   <svg viewBox="0 0 32 32" aria-hidden="true"><path id="arhud-arrow" d="M16 3 L28 17 H21 V29 H11 V17 H4 Z"/></svg>
   <div><b id="arhud-nav-text">Continue</b><small id="arhud-nav-dist">800 m</small></div>
  </div>
 </section>
 <div class="arhud-toast" id="arhud-toast"></div>`;
document.body.appendChild(root);
const $=id=>root.querySelector('#arhud-'+id);
const circumference=2*Math.PI*43;
$('speed-arc').style.strokeDasharray=String(circumference);
$('speed-arc').style.strokeDashoffset=String(circumference);
let demoTimer=null,toastTimer=null,elapsed=0;
const HUD={
 update(d={}){
  if(d.speed!=null){
   const speed=Math.max(0,Number(d.speed)||0);
   $('spd').textContent=Math.round(speed);
   $('speed-arc').style.strokeDashoffset=String(circumference*(1-Math.min(speed/180,1)));
   $('spd').classList.toggle('over',d.limit!=null&&speed>d.limit+3);
  }
  if(d.limit!=null){$('sign').textContent=d.limit;$('sign').classList.toggle('over',d.speed!=null&&d.speed>d.limit+3)}
  if(d.gear!=null)$('gear-value').textContent=d.gear;
  if(d.missionTime!=null){const seconds=Math.max(0,Math.floor(d.missionTime));$('time').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')}
  if(d.earnings!=null)$('earned').textContent=Math.max(0,Math.floor(d.earnings)).toLocaleString();
  if(d.navDist!=null)$('nav-dist').textContent=Math.max(0,Math.round(d.navDist))+' m';
  if(d.navText!=null)$('nav-text').textContent=d.navText;
  if(d.navRotate!=null)$('arrow').setAttribute('transform',`rotate(${d.navRotate} 16 16)`);
 },
 toast(message){
  $('toast').textContent=message;$('toast').classList.add('on');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('on'),2200);
 }
};
// Independent preview animation only. It does not read or write game state.
function startDemo(){
 if(demoTimer!==null)return;
 elapsed=0;
 demoTimer=setInterval(()=>{
  elapsed++;
  const speed=74+Math.round(18*Math.sin(elapsed/8));
  HUD.update({speed,limit:80,gear:speed>82?4:3,missionTime:180-elapsed,earnings:Math.floor(elapsed*1.5),navDist:Math.max(0,800-elapsed*4),navText:elapsed%18<9?'Continue':'Keep left'});
 },1000);
}
function stopDemo(){if(demoTimer!==null){clearInterval(demoTimer);demoTimer=null}}
window.AccraRushStandaloneHUD={
 show(){root.hidden=false;root.setAttribute('aria-hidden','false');startDemo()},
 hide(){root.hidden=true;root.setAttribute('aria-hidden','true');stopDemo()},
 update:HUD.update,toast:HUD.toast
};
document.addEventListener('accrarush:start',()=>window.AccraRushStandaloneHUD.show(),true);
document.addEventListener('click',event=>{if(event.target.closest('#start'))window.AccraRushStandaloneHUD.show()},true);
document.addEventListener('accrarush:show-menu',()=>window.AccraRushStandaloneHUD.hide());
})();