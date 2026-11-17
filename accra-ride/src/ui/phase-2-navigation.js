(()=>{
  const $=id=>document.getElementById(id);
  const validPaints={"taxi-yellow":"#e7b83d",white:"#e9edf0","midnight-blue":"#18364d",red:"#b93632",green:"#24784c"};
  const paintNames={"taxi-yellow":"Taxi Yellow",white:"White","midnight-blue":"Midnight Blue",red:"Red",green:"Green"};
  const screens=["home","areas","garage"];
  let selectedArea="accra-central",selectedPaint="taxi-yellow";
  try{const saved=JSON.parse(localStorage.getItem("accrarush.setup")||"{}");if(saved.area==="accra-central")selectedArea=saved.area;if(Object.hasOwn(validPaints,saved.paint))selectedPaint=saved.paint}catch{}
  const vehicleName="Toyota Corolla Taxi";
  const areaInfo={
    "accra-central":{n:"Accra Central",d:"Start your drive in the heart of Accra.",df:2},
    "osu-cantonments":{n:"Osu / Cantonments",d:"Coastal streets and busy urban routes. Coming soon.",df:3},
    "airport-labone":{n:"Airport / Labone",d:"Wide avenues and airport-side connections. Coming soon.",df:2},
    "kaneshie-abossey-okai":{n:"Kaneshie / Abossey Okai",d:"Busy commercial roads and market traffic. Coming soon.",df:4},
    "achimota-atomic":{n:"Achimota / Atomic",d:"Northern Accra connections. Coming soon.",df:3},
    "madina-legon":{n:"Madina / Legon",d:"University-side roads and suburban routes. Coming soon.",df:3}
  };
  const settings={engineSound:true,missionHints:true};
  try{const stored=JSON.parse(localStorage.getItem("accrarush.settings")||"{}");for(const k of Object.keys(settings))if(typeof stored[k]==="boolean")settings[k]=stored[k]}catch{}
  window.AccraRushSettings=settings;
  function applyPaint(){const hex=validPaints[selectedPaint];const preview=$("taxi-preview");if(preview){preview.style.setProperty("--taxi-paint",hex);preview.querySelectorAll("[data-paint-surface]").forEach(surface=>surface.setAttribute("fill",hex));}document.querySelectorAll("[data-paint]").forEach(el=>{const active=el.dataset.paint===selectedPaint;el.classList.toggle("is-selected",active);el.setAttribute("aria-pressed",String(active))});}
  function save(){const config={area:selectedArea,areaName:areaInfo[selectedArea]?.n||"Accra Central",vehicle:"corolla-taxi",vehicleName,paint:selectedPaint,paintHex:validPaints[selectedPaint]};window.AccraRushMenuConfig=config;try{localStorage.setItem("accrarush.setup",JSON.stringify(config))}catch{}window.AccraRushApplyVehicleConfig?.(config);applyPaint();const summary=$("menu-summary");if(summary)summary.textContent=(areaInfo[selectedArea]?.n||"Accra Central")+" · "+vehicleName+" · "+paintNames[selectedPaint];}
  let activeScreen="home",navigationBusy=false;
  const reduceMotion=()=>window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function show(name){
    if(!screens.includes(name)||name===activeScreen||navigationBusy)return;
    const next=$("menu-"+name),current=$("menu-"+activeScreen);if(!next)return;
    navigationBusy=true;
    const duration=reduceMotion()?0:320;
    if(current){
      current.classList.remove("is-visible","is-entering");
      current.classList.add("is-leaving");
      if(duration&&current.animate)current.animate(
        [{opacity:1,transform:"translate3d(0,0,0) scale(1)"},{opacity:0,transform:"translate3d(0,-14px,0) scale(.99)"}],
        {duration:160,easing:"ease-in",fill:"forwards"}
      );
    }
    window.setTimeout(()=>{
      if(current){current.hidden=true;current.setAttribute("aria-hidden","true");current.classList.remove("is-leaving");}
      next.hidden=false;next.setAttribute("aria-hidden","false");
      next.classList.remove("is-leaving","is-visible");next.classList.add("is-entering");
      activeScreen=name;
      document.querySelectorAll("[data-flow-step]").forEach(step=>{
        const n=Number(step.dataset.flowStep);
        step.classList.toggle("is-current",(name==="home"&&n===1)||(name==="areas"&&n===2)||(name==="garage"&&n===3));
        step.classList.toggle("is-complete",(name==="areas"&&n===1)||(name==="garage"&&n<3));
      });
      const card=$("startcard");if(card)card.dataset.screen=name;
      if(duration&&next.animate){
        next.animate(
          [{opacity:0,transform:"translate3d(0,22px,0) scale(.985)"},{opacity:1,transform:"translate3d(0,0,0) scale(1)"}],
          {duration:duration,easing:"cubic-bezier(.2,.75,.25,1)",fill:"both"}
        );
      }
      requestAnimationFrame(()=>{next.classList.remove("is-entering");next.classList.add("is-visible");});
      window.setTimeout(()=>{navigationBusy=false;},duration+30);
    },current&&duration?160:0);
  }
  function selectArea(id,quiet=false){
    const button=document.querySelector('[data-area="'+id+'"]');
    if(!button||button.disabled||!areaInfo[id])return;
    selectedArea=id;
    const info=areaInfo[id];
    document.querySelectorAll("[data-area]").forEach(el=>{const active=el.dataset.area===id;el.classList.toggle("is-selected",active);el.setAttribute("aria-pressed",String(active));const card=el.closest("[data-area-card]");if(card)card.classList.toggle("is-selected",active);});
    document.querySelectorAll(".ar-pin-ring .ring").forEach(r=>r.setAttribute("opacity","0"));
    const ring=document.querySelector("#pin-"+id+" .ring");if(ring){ring.setAttribute("opacity","1");ring.setAttribute("r","34");}
    const name=$("areaName"),desc=$("areaDesc"),label=$("currentAreaLabel"),meter=$("areaDiff");
    if(name)name.textContent=info.n;if(desc)desc.textContent=info.d;if(label)label.textContent=info.n.toUpperCase();const menuLabel=$("menuAreaLabel");if(menuLabel)menuLabel.textContent=info.n.toUpperCase();
    if(meter){let out="";for(let i=0;i<5;i++)out+='<i class="meter-i" style="width:3vh;height:1vh;transform:skewX(-25deg);background:'+(i<info.df?'#f5b72c':'rgba(255,255,255,.15)')+'"></i>';meter.innerHTML=out;}
    save();
    if(!quiet){const card=document.querySelector('[data-area-card="'+id+'"]');if(card)card.scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"});}
  }
  function chooseArea(button){if(button.disabled)return;selectArea(button.dataset.area);}
  function choosePaint(button){if(!Object.hasOwn(validPaints,button.dataset.paint))return;selectedPaint=button.dataset.paint;save();}
  function launch(mode){
    save();
    const detail={mode,area:selectedArea,paint:paintNames[selectedPaint],settings:{...settings}};
    window.AccraRushLaunchPending=mode;
    document.dispatchEvent(new CustomEvent("accrarush:start",{detail}));
    const mission=$("mission");if(mission)mission.textContent=(mode==="race"?"RACE":"FREE DRIVE")+" · "+(areaInfo[selectedArea]?.n||"Accra Central").toUpperCase()+" · Keep left";
    $("start").click();
  }
  document.addEventListener("click",event=>{
    const target=event.target.closest("button");if(!target)return;
    if(target.hasAttribute("data-launch-mode")){launch(target.dataset.launchMode==="race"?"race":"free");return;}
    if(target.id==="menu-play"){show("areas");return;}
    if(target.id==="menu-garage-direct"){show("garage");return;}
    if(target.id==="menu-area-next"){show("garage");return;}
    if(target.hasAttribute("data-menu-back")){show(target.dataset.menuBack);return;}
    if(target.hasAttribute("data-area")){chooseArea(target);return;}
    if(target.hasAttribute("data-paint")){choosePaint(target);return;}
    if(target.id==="startRaceBtn"){launch("race");return;}
    if(target.id==="start"){const mode=window.AccraRushLaunchPending||"free";window.AccraRushLaunchPending=null;window.AccraRushLaunchMode=mode;save();const mission=$("mission");if(mission)mission.textContent=(mode==="race"?"RACE":"FREE DRIVE")+" · "+(areaInfo[selectedArea]?.n||"Accra Central").toUpperCase()+" · Keep left";}
  });
  const settingsPanel=$("settingsPanel");
  document.querySelectorAll(".ar-setting-row").forEach(row=>{
    const key=row.dataset.k;row.classList.toggle("on",!!settings[key]);row.setAttribute("aria-pressed",String(!!settings[key]));
    row.addEventListener("click",()=>{settings[key]=!settings[key];row.classList.toggle("on",settings[key]);row.setAttribute("aria-pressed",String(settings[key]));window.AccraRushSettings=settings;try{localStorage.setItem("accrarush.settings",JSON.stringify(settings))}catch{}if(key==="missionHints"&&$("mission"))$("mission").style.display=settings[key]?"":"none";});
  });
  const openSettings=()=>{settingsPanel?.classList.add("open");settingsPanel?.setAttribute("aria-hidden","false");};
  if($("settingsBtn"))$("settingsBtn").onclick=openSettings;
  if($("settingsHomeBtn"))$("settingsHomeBtn").onclick=openSettings;
  if($("closeSettings"))$("closeSettings").onclick=()=>{settingsPanel?.classList.remove("open");settingsPanel?.setAttribute("aria-hidden","true");};
  if($("mission"))$("mission").style.display=settings.missionHints?"":"none";
  const savedArea=document.querySelector('[data-area="'+selectedArea+'"]');if(savedArea)selectArea(selectedArea,true);save();
  const initial=$("menu-home");if(initial){initial.classList.add("is-visible");initial.hidden=false;initial.setAttribute("aria-hidden","false");}
  show("home");
})();
