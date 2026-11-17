(()=>{
  const $=id=>document.getElementById(id);
  const validPaints={"taxi-yellow":"#e7b83d",white:"#e9edf0","midnight-blue":"#18364d",red:"#b93632",green:"#24784c"};
  const paintNames={"taxi-yellow":"Taxi Yellow",white:"White","midnight-blue":"Midnight Blue",red:"Red",green:"Green"};
  const screens=["home","areas","garage"];
  let selectedArea="accra-central",selectedRoute="central-circle",selectedPaint="taxi-yellow";
  try{const saved=JSON.parse(localStorage.getItem("accrarush.setup")||"{}");if(["accra-central","lapaz"].includes(saved.area))selectedArea=saved.area;if(typeof saved.route==="string")selectedRoute=saved.route;if(Object.hasOwn(validPaints,saved.paint))selectedPaint=saved.paint}catch{}
  const vehicleName="Toyota Corolla Taxi";
  const areaInfo={
    "accra-central":{n:"Accra Central",d:"Choose a route within the independent Accra Central road network.",df:2},
    "lapaz":{n:"Lapaz",d:"Choose a route starting in Lapaz. This network is separate from Accra Central.",df:3},
    "osu-cantonments":{n:"Osu / Cantonments",d:"Coastal streets and busy urban routes. Coming soon.",df:3},
    "airport-labone":{n:"Airport / Labone",d:"Wide avenues and airport-side connections. Coming soon.",df:2},
    "kaneshie-abossey-okai":{n:"Kaneshie / Abossey Okai",d:"Busy commercial roads and market traffic. Coming soon.",df:4},
    "achimota-atomic":{n:"Achimota / Atomic",d:"Northern Accra connections. Coming soon.",df:3},
    "madina-legon":{n:"Madina / Legon",d:"University-side roads and suburban traffic. Coming soon.",df:3}
  };
  // Each selectable area owns its own isolated road graph. No cross-area edges are created.
  const roadNetworks={
    "accra-central":{
      title:"ACCRA CENTRAL ROAD NETWORK",
      nodes:{C:{x:0,z:0,label:"ACCRA CENTRAL"},A:{x:-125,z:90,label:"ADABRAKA"},R:{x:-65,z:220,label:"RIDGE"},O:{x:155,z:125,label:"OSU"},K:{x:-235,z:-40,label:"KANESHIE"},X:{x:-95,z:-185,label:"CIRCLE"}},
      edges:[["central-adabraka","C","A"],["adabraka-ridge","A","R"],["central-osu","C","O"],["central-kaneshie","C","K"],["kaneshie-circle","K","X"],["central-circle","C","X"]],
      routes:[{id:"central-circle",label:"Accra Central → Circle",nodes:["C","X"],edges:["central-circle"],difficulty:"Urban traffic"},{id:"central-osu",label:"Accra Central → Osu",nodes:["C","O"],edges:["central-osu"],difficulty:"City streets"},{id:"central-kaneshie",label:"Accra Central → Kaneshie",nodes:["C","K"],edges:["central-kaneshie"],difficulty:"Commercial roads"}]
    },
    "lapaz":{
      title:"LAPAZ ROAD NETWORK",
      nodes:{L:{x:-245,z:0,label:"LAPAZ"},A:{x:-85,z:45,label:"ACHIMOTA"},C:{x:90,z:35,label:"CIRCLE"},M:{x:220,z:190,label:"MADINA"},T:{x:240,z:-120,label:"ATOMIC"}},
      edges:[["lapaz-achimota","L","A"],["achimota-circle","A","C"],["circle-madina","C","M"],["achimota-atomic","A","T"],["lapaz-circle","L","C"],["atomic-madina","T","M"]],
      routes:[{id:"lapaz-circle",label:"Lapaz → Circle",nodes:["L","C"],edges:["lapaz-circle"],difficulty:"Main urban connector"},{id:"lapaz-madina",label:"Lapaz → Madina",nodes:["L","A","C","M"],edges:["lapaz-achimota","achimota-circle","circle-madina"],difficulty:"Long cross-city drive"},{id:"lapaz-atomic",label:"Lapaz → Atomic",nodes:["L","A","T"],edges:["lapaz-achimota","achimota-atomic"],difficulty:"Northern connector"}]
    }
  };
  const mapSvgNS="http://www.w3.org/2000/svg";
  const mapPoint=([x,z])=>({x:65+(x+300)*.95,y:40+(250-z)*.62});
  const svgNode=(tag,attrs,parent)=>{const node=document.createElementNS(mapSvgNS,tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));parent.appendChild(node);return node;};
  function renderRouteOptions(){
    const host=$("ar-route-options");if(!host)return;
    const network=roadNetworks[selectedArea];host.innerHTML="";
    if(!network){host.textContent="Routes for this area are coming soon.";return;}
    network.routes.forEach(route=>{
      const button=document.createElement("button");button.type="button";button.className="ar-route-option"+(route.id===selectedRoute?" is-selected":"");button.dataset.route=route.id;button.setAttribute("aria-pressed",String(route.id===selectedRoute));
      const title=document.createElement("strong");title.textContent=route.label;
      const meta=document.createElement("small");meta.textContent=route.difficulty;
      button.append(title,meta);host.appendChild(button);
      button.addEventListener("click",()=>selectRoute(route.id));
    });
    if(!network.routes.some(route=>route.id===selectedRoute))selectedRoute=network.routes[0].id;
    host.querySelectorAll("[data-route]").forEach(button=>{const active=button.dataset.route===selectedRoute;button.classList.toggle("is-selected",active);button.setAttribute("aria-pressed",String(active));});
  }
  function selectRoute(id){
    const network=roadNetworks[selectedArea],route=network?.routes.find(item=>item.id===id);if(!route)return;
    selectedRoute=id;renderRouteOptions();renderRoadNetworkMap();save();
  }
  function updateRoadMapSelection(){
    const network=roadNetworks[selectedArea],route=network?.routes.find(item=>item.id===selectedRoute);
    document.querySelectorAll(".ar-road-area-pin").forEach(pin=>pin.classList.toggle("is-selected",pin.dataset.area===selectedArea));
    const svg=$("ar-road-network-map");if(!svg)return;
    svg.querySelectorAll("[data-route]").forEach(path=>path.classList.toggle("is-route-selected",path.dataset.route===selectedRoute));
    svg.querySelectorAll("[data-node]").forEach(node=>node.classList.toggle("is-route-node",!!route&&route.nodes.includes(node.dataset.node)));
  }
  function renderRoadNetworkMap(){
    const svg=$("ar-road-network-map");if(!svg)return;
    const edges=svg.querySelector("#ar-road-edges"),nodes=svg.querySelector("#ar-road-nodes"),pins=svg.querySelector("#ar-road-area-pins");
    if(!edges||!nodes||!pins)return;
    edges.replaceChildren();nodes.replaceChildren();pins.replaceChildren();
    const network=roadNetworks[selectedArea];
    const title=$("roadMapTitle");if(title)title.textContent=network?.title||"ROAD NETWORK COMING SOON";
    if(!network){svg.dataset.ready="true";return;}
    const route=network.routes.find(item=>item.id===selectedRoute);
    network.edges.forEach(([id,a,b])=>{
      const p0=mapPoint([network.nodes[a].x,network.nodes[a].z]),p2=mapPoint([network.nodes[b].x,network.nodes[b].z]);
      const mid={x:(p0.x+p2.x)/2,y:(p0.y+p2.y)/2};
      const point=p=>p.x.toFixed(1)+" "+p.y.toFixed(1);
      const d="M"+point(p0)+" Q"+point(mid)+" "+point(p2);
      const attrs={d,"data-road":id,"data-route":route&&route.edges.includes(id)?route.id:""};
      svgNode("path",{...attrs,class:"ar-road-edge-outline"},edges);
      svgNode("path",{...attrs,class:"ar-road-edge"},edges);
      svgNode("path",{...attrs,class:"ar-road-centre"},edges);
    });
    Object.entries(network.nodes).forEach(([id,node])=>{
      const p=mapPoint([node.x,node.z]);
      svgNode("circle",{cx:p.x,cy:p.y,r:5,class:"ar-road-node","data-node":id},nodes);
      const label=svgNode("text",{x:p.x+8,y:p.y+13,class:"ar-road-node-label","data-node":id},nodes);label.textContent=node.label;
    });
    svg.dataset.ready="true";updateRoadMapSelection();
  }
  const settings={engineSound:true,missionHints:true};
  try{const stored=JSON.parse(localStorage.getItem("accrarush.settings")||"{}");for(const k of Object.keys(settings))if(typeof stored[k]==="boolean")settings[k]=stored[k]}catch{}
  window.AccraRushSettings=settings;
  function applyPaint(){const hex=validPaints[selectedPaint];const preview=$("taxi-preview");if(preview)preview.style.setProperty("--taxi-paint",hex);const viewer=$("taxi-model");if(viewer&&viewer.model){const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);viewer.model.materials.forEach(material=>{const name=(material.name||"").toLowerCase();if(!/glass|window|wheel|tyre|tire|rubber|chrome|light|lamp|interior|glass/i.test(name)){material.pbrMetallicRoughness.setBaseColorFactor([...rgb,1]);}});}document.querySelectorAll("[data-paint]").forEach(el=>{const active=el.dataset.paint===selectedPaint;el.classList.toggle("is-selected",active);el.setAttribute("aria-pressed",String(active))});}
  function save(){const activeRoute=roadNetworks[selectedArea]?.routes.find(route=>route.id===selectedRoute);const config={area:selectedArea,areaName:areaInfo[selectedArea]?.n||"Accra Central",route:selectedRoute,routeName:activeRoute?.label||"",routeNodes:activeRoute?.nodes||[],routeEdges:activeRoute?.edges||[],vehicle:"corolla-taxi",vehicleName,paint:selectedPaint,paintHex:validPaints[selectedPaint]};window.AccraRushMenuConfig=config;try{localStorage.setItem("accrarush.setup",JSON.stringify(config))}catch{}window.AccraRushApplyVehicleConfig?.(config);applyPaint();const summary=$("menu-summary");if(summary)summary.textContent=(areaInfo[selectedArea]?.n||"Accra Central")+" · "+(activeRoute?.label||"Route coming soon")+" · "+vehicleName+" · "+paintNames[selectedPaint];}
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
      if(current){current.hidden=true;current.style.display="none";current.setAttribute("aria-hidden","true");current.classList.remove("is-leaving");}
      next.hidden=false;next.style.display="block";next.style.visibility="visible";next.style.opacity="1";next.style.pointerEvents="auto";next.setAttribute("aria-hidden","false");
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
    const button=document.querySelector('button[data-area="'+id+'"]');
    if(!button||button.disabled||!roadNetworks[id])return;
    selectedArea=id;
    if(!roadNetworks[selectedArea].routes.some(route=>route.id===selectedRoute))selectedRoute=roadNetworks[selectedArea].routes[0].id;
    const info=areaInfo[id];
    document.querySelectorAll("button[data-area]").forEach(el=>{const active=el.dataset.area===id;el.classList.toggle("is-selected",active);el.setAttribute("aria-pressed",String(active));const card=el.closest("[data-area-card]");if(card)card.classList.toggle("is-selected",active);});
    renderRouteOptions();renderRoadNetworkMap();
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
    const activeRoute=roadNetworks[selectedArea]?.routes.find(route=>route.id===selectedRoute);const detail={mode,area:selectedArea,route:selectedRoute,routeName:activeRoute?.label||"",routeNodes:activeRoute?.nodes||[],routeEdges:activeRoute?.edges||[],paint:paintNames[selectedPaint],settings:{...settings}};
    window.AccraRushLaunchPending=mode;
    document.dispatchEvent(new CustomEvent("accrarush:start",{detail}));
    const mission=$("mission");if(mission)mission.textContent=(mode==="race"?"RACE":"FREE DRIVE")+" · "+(activeRoute?.label||areaInfo[selectedArea]?.n||"Accra Central").toUpperCase()+" · Keep left";
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
    if(target.hasAttribute("data-route")){selectRoute(target.dataset.route);return;}
    if(target.hasAttribute("data-paint")){choosePaint(target);return;}
    if(target.id==="startRaceBtn"){launch("race");return;}
    if(target.id==="start"){const mode=window.AccraRushLaunchPending||"free";window.AccraRushLaunchPending=null;window.AccraRushLaunchMode=mode;save();const mission=$("mission");if(mission)mission.textContent=(mode==="race"?"RACE":"FREE DRIVE")+" · "+(roadNetworks[selectedArea]?.routes.find(route=>route.id===selectedRoute)?.label||areaInfo[selectedArea]?.n||"Accra Central").toUpperCase()+" · Keep left";}
  });
  const garageModel=$("taxi-model");if(garageModel)garageModel.addEventListener("load",()=>applyPaint());
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
  renderRouteOptions();renderRoadNetworkMap();
  const savedArea=document.querySelector('button[data-area="'+selectedArea+'"]');if(savedArea)selectArea(selectedArea,true);save();
  const initial=$("menu-home");if(initial){initial.classList.add("is-visible");initial.hidden=false;initial.setAttribute("aria-hidden","false");}
  show("home");
})();
