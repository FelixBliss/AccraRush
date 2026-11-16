(()=>{
  const $=id=>document.getElementById(id);
  const validPaints={"taxi-yellow":"#e7b83d",white:"#e9edf0","midnight-blue":"#18364d",red:"#b93632",green:"#24784c"};
  const paintNames={"taxi-yellow":"Taxi Yellow",white:"White","midnight-blue":"Midnight Blue",red:"Red",green:"Green"};
  const screens=["home","areas","garage"];
  let selectedArea="accra-central",selectedPaint="taxi-yellow";
  try{const saved=JSON.parse(localStorage.getItem("accrarush.setup")||"{}");if(saved.area==="accra-central")selectedArea=saved.area;if(Object.hasOwn(validPaints,saved.paint))selectedPaint=saved.paint}catch{}
  const areaName="Accra Central",vehicleName="Toyota Corolla Taxi";
  function applyPaint(){const hex=validPaints[selectedPaint];const preview=$("taxi-preview");if(preview)preview.style.setProperty("--taxi-paint",hex);document.querySelectorAll("[data-paint]").forEach(el=>{const active=el.dataset.paint===selectedPaint;el.classList.toggle("is-selected",active);el.setAttribute("aria-pressed",String(active))});}
  function save(){const config={area:selectedArea,areaName,vehicle:"corolla-taxi",vehicleName,paint:selectedPaint,paintHex:validPaints[selectedPaint]};window.AccraRushMenuConfig=config;try{localStorage.setItem("accrarush.setup",JSON.stringify(config))}catch{}window.AccraRushApplyVehicleConfig?.(config);applyPaint();const summary=$("menu-summary");if(summary)summary.textContent=areaName+" · "+vehicleName+" · "+paintNames[selectedPaint];}
  let activeScreen="home",navigationBusy=false;
  function show(name){
    if(!screens.includes(name)||name===activeScreen||navigationBusy)return;
    const next=$("menu-"+name),current=$("menu-"+activeScreen);if(!next)return;
    navigationBusy=true;
    if(current){current.classList.remove("is-visible","is-entering");current.classList.add("is-leaving");}
    window.setTimeout(()=>{
      if(current){current.hidden=true;current.setAttribute("aria-hidden","true");current.classList.remove("is-leaving");}
      next.hidden=false;next.setAttribute("aria-hidden","false");next.classList.add("is-entering");
      requestAnimationFrame(()=>requestAnimationFrame(()=>{next.classList.remove("is-entering");next.classList.add("is-visible");}));
      activeScreen=name;
      document.querySelectorAll("[data-flow-step]").forEach(step=>{const n=Number(step.dataset.flowStep);step.classList.toggle("is-current",(name==="home"&&n===1)||(name==="areas"&&n===2)||(name==="garage"&&n===3));step.classList.toggle("is-complete",(name==="areas"&&n===1)||(name==="garage"&&n<3));});
      const card=$("startcard");if(card)card.dataset.screen=name;
      window.setTimeout(()=>{navigationBusy=false;},260);
    },current?170:0);
  }
  function chooseArea(button){if(button.disabled)return;selectedArea=button.dataset.area;document.querySelectorAll("[data-area]").forEach(el=>{const active=el===button;el.classList.toggle("is-selected",active);el.setAttribute("aria-pressed",String(active));const card=el.closest("[data-area-card]");if(card)card.classList.toggle("is-selected",active);});save();}
  function choosePaint(button){if(!Object.hasOwn(validPaints,button.dataset.paint))return;selectedPaint=button.dataset.paint;save();}
  document.addEventListener("click",event=>{const target=event.target.closest("button");if(!target)return;if(target.id==="menu-play"){show("areas");return;}if(target.id==="menu-garage-direct"){show("garage");return;}if(target.id==="menu-area-next"){show("garage");return;}if(target.hasAttribute("data-menu-back")){show(target.dataset.menuBack);return;}if(target.hasAttribute("data-area")){chooseArea(target);return;}if(target.hasAttribute("data-paint")){choosePaint(target);return;}if(target.id==="start"){save();const mission=$("mission");if(mission)mission.textContent=areaName+" · FREE DRIVE · Keep left";}});
  const savedArea=document.querySelector('[data-area="'+selectedArea+'"]');if(savedArea)chooseArea(savedArea);save();
  const initial=$("menu-home");if(initial){initial.classList.add("is-visible");initial.hidden=false;initial.setAttribute("aria-hidden","false");}
  show("home");
})();
