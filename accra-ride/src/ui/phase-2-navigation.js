(()=>{
  const $=id=>document.getElementById(id);
  const validPaints={"taxi-yellow":"#e7b83d",white:"#e9edf0","midnight-blue":"#18364d",red:"#b93632",green:"#24784c"};
  const paintNames={"taxi-yellow":"Taxi Yellow",white:"White","midnight-blue":"Midnight Blue",red:"Red",green:"Green"};
  const screens=["home","areas","garage","settings"];
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
  const areaPreviewRoads={
    "accra-central":{major:["M12 82 C45 70 72 61 105 70 S165 99 202 82 S260 43 309 52","M15 130 C57 119 84 99 112 104 S170 130 210 115 S267 99 307 108"],minor:["M65 12 C70 45 78 65 105 70 S137 88 151 116 L158 160","M160 8 C148 38 152 58 174 78 S211 100 218 132 L220 160","M10 40 C45 45 68 58 85 82 S98 112 102 158","M265 10 C250 42 248 66 263 86 S290 116 308 150","M35 155 C72 136 94 125 112 104"],junctions:[[105,70],[112,104],[174,78],[210,115],[263,86]]},
    "lapaz":{major:["M8 83 C48 76 75 55 113 66 S177 100 214 83 S270 52 312 59","M18 137 C66 126 95 105 126 108 S188 131 220 117 S274 98 309 104"],minor:["M53 12 C65 42 78 60 113 66 S146 83 157 110 S174 139 190 160","M156 8 C150 36 164 57 185 75 S222 91 240 116 L260 158","M12 38 C47 43 68 54 82 79 S96 111 94 151","M252 12 C240 39 247 60 269 80 S293 111 304 148","M75 160 C88 137 104 119 126 108"],junctions:[[113,66],[126,108],[185,75],[220,117],[269,80]]},
    "osu-cantonments":{major:["M15 58 C55 48 88 50 118 69 S173 102 208 91 S265 62 308 68","M25 135 C70 122 96 108 129 112 S188 137 222 124 S273 106 305 116"],minor:["M72 10 C80 37 89 52 118 69 S146 88 153 119 L158 160","M184 8 C174 40 181 67 208 91 S240 111 246 151","M12 95 C52 89 78 91 103 105 S126 128 130 158","M265 12 C252 41 256 59 276 78 S299 103 310 145","M42 160 C69 140 94 122 129 112"],junctions:[[118,69],[129,112],[208,91],[222,124],[276,78]]},
    "airport-labone":{major:["M8 105 C50 96 78 69 112 65 S172 74 206 94 S268 115 312 90","M15 145 C57 128 86 111 119 108 S177 119 211 135 S270 146 306 128"],minor:["M64 8 C77 33 89 52 112 65 S143 88 148 114 S151 139 164 160","M179 8 C168 37 178 62 206 94 S239 116 246 155","M10 45 C44 48 72 56 91 80 S109 104 119 108","M267 12 C250 40 250 65 268 88 S292 113 311 145","M80 160 C89 139 103 122 119 108"],junctions:[[112,65],[119,108],[206,94],[211,135],[268,88]]},
    "kaneshie-abossey-okai":{major:["M8 72 C48 66 75 77 105 96 S162 124 196 102 S260 53 312 60","M12 132 C54 119 86 100 112 96 S170 91 203 111 S270 142 309 126"],minor:["M54 8 C62 37 78 63 105 96 S130 121 139 158","M166 8 C156 42 168 70 196 102 S226 129 233 159","M12 35 C46 42 70 61 83 86 S99 117 101 154","M262 8 C246 36 251 49 270 72 S297 103 310 149","M25 158 C62 136 86 112 112 96"],junctions:[[105,96],[112,96],[196,102],[203,111],[270,72]]},
    "achimota-atomic":{major:["M8 87 C48 76 74 58 108 64 S168 91 202 82 S265 54 312 61","M18 135 C62 121 88 103 120 105 S181 126 213 113 S273 96 309 109"],minor:["M55 8 C65 37 80 56 108 64 S145 81 154 108 S166 137 182 160","M166 8 C156 36 168 60 188 78 S218 91 240 117 L260 158","M10 42 C43 45 68 58 84 82 S103 104 120 105","M260 10 C246 38 250 59 269 82 S296 111 310 150","M45 158 C73 138 94 119 120 105"],junctions:[[108,64],[120,105],[188,78],[213,113],[269,82]]},
    "madina-legon":{major:["M8 90 C48 80 77 62 112 70 S171 96 206 83 S268 55 312 64","M14 139 C58 126 87 105 119 108 S178 131 214 116 S274 101 310 115"],minor:["M61 8 C69 38 83 58 112 70 S145 88 154 114 L165 160","M180 8 C169 38 179 63 206 83 S237 105 246 151","M10 43 C44 47 70 60 88 83 S105 106 119 108","M265 10 C250 40 253 62 274 83 S299 113 310 150","M42 160 C70 138 92 119 119 108"],junctions:[[112,70],[119,108],[206,83],[214,116],[274,83]]}
  };
  function renderAreaPreviewMaps(){
    document.querySelectorAll("[data-area-map]").forEach(host=>{
      const data=areaPreviewRoads[host.dataset.areaMap];if(!data)return;
      const svg=document.createElementNS(mapSvgNS,"svg");svg.setAttribute("viewBox","0 0 320 170");svg.setAttribute("preserveAspectRatio","xMidYMid meet");svg.setAttribute("role","img");svg.setAttribute("aria-label","Stylised connected road network");
      const bg=svgNode("path",{d:"M0 0H320V170H0Z",fill:"transparent"},svg);
      const draw=(d,kind)=>{const base=kind==="major"?"ar-mini-road-base":"ar-mini-road-minor-base";const surface=kind==="major"?"ar-mini-road-surface":"ar-mini-road-minor-surface";svgNode("path",{d,class:base},svg);svgNode("path",{d,class:surface},svg);if(kind==="major")svgNode("path",{d,class:"ar-mini-road-centre"},svg);};
      data.minor.forEach(d=>draw(d,"minor"));data.major.forEach(d=>draw(d,"major"));
      data.junctions.forEach(([cx,cy])=>svgNode("circle",{cx,cy,r:3.2,class:"ar-mini-junction"},svg));
      host.replaceChildren(svg);
    });
  }
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
  function save(){const activeRoute=roadNetworks[selectedArea]?.routes.find(route=>route.id===selectedRoute);const config={area:selectedArea,areaName:areaInfo[selectedArea]?.n||"Accra Central",route:selectedRoute,routeName:activeRoute?.label||"",routeNodes:activeRoute?.nodes||[],routeEdges:activeRoute?.edges||[],vehicle:"corolla-taxi",vehicleName,paint:selectedPaint,paintHex:validPaints[selectedPaint]};window.AccraRushMenuConfig=config;try{localStorage.setItem("accrarush.setup",JSON.stringify(config))}catch{}window.AccraRushApplyVehicleConfig?.(config);applyPaint();}
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
    const card=document.querySelector('[data-area-card="'+id+'"]');
    if(!card||card.classList.contains("is-locked")||!roadNetworks[id])return false;
    selectedArea=id;
    if(!roadNetworks[selectedArea].routes.some(route=>route.id===selectedRoute))selectedRoute=roadNetworks[selectedArea].routes[0].id;
    document.querySelectorAll("[data-area-card]").forEach(el=>el.classList.toggle("is-selected",el===card));
    save();
    return true;
  }
  function chooseArea(card){if(!card||card.classList.contains("is-locked"))return;selectArea(card.dataset.area);}
  function returnToHome(){
    const cover=$("startcover");
    if(activeScreen!=="home"){show("home");return;}
    if(cover&&cover.style.display==="none"){
      document.dispatchEvent(new Event("accrarush:show-menu"));
      cover.style.display="grid";cover.setAttribute("aria-hidden","false");return;
    }
    const dialog=$("ar-exit-dialog");
    if(dialog&&!dialog.open){if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");}
  }
  window.AccraRushReturnToHome=returnToHome;
  const handleBack=event=>{event?.preventDefault?.();event?.stopPropagation?.();returnToHome();};
  document.addEventListener("backbutton",handleBack,false);
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"||event.key==="Backspace"){
      if($("ar-exit-dialog")?.open){$("ar-exit-dialog").close();event.preventDefault();return;}
      event.preventDefault();handleBack(event);
    }
  });
  window.addEventListener("popstate",()=>{returnToHome();history.pushState({accrarush:true},"","#accrarush");});
  history.pushState({accrarush:true},"","#accrarush");
  const cancelExit=$("ar-exit-cancel"),confirmExit=$("ar-exit-confirm"),exitDialog=$("ar-exit-dialog");
  if(cancelExit)cancelExit.addEventListener("click",()=>exitDialog?.close());
  if(confirmExit)confirmExit.addEventListener("click",()=>{
    window.dispatchEvent(new Event("accrarush:quit"));
    if(window.Capacitor?.Plugins?.App?.exitApp)window.Capacitor.Plugins.App.exitApp();
    else if(navigator.app?.exitApp)navigator.app.exitApp();
    else {exitDialog?.close();window.close();}
  });
  if(exitDialog)exitDialog.addEventListener("click",event=>{if(event.target===exitDialog)exitDialog.close();});
  function chooseArea(button){if(button.disabled)return;selectArea(button.dataset.area);}
  function chooseModel(button){if(button.dataset.model!=="corolla-taxi")return;document.querySelectorAll(".ar-model-choice[data-model]").forEach(item=>{const active=item===button;item.classList.toggle("is-selected",active);item.setAttribute("aria-pressed",String(active));});}
  function choosePaint(button){if(!Object.hasOwn(validPaints,button.dataset.paint))return;selectedPaint=button.dataset.paint;save();}
  function launch(mode){
    save();
    const activeRoute=roadNetworks[selectedArea]?.routes.find(route=>route.id===selectedRoute);const detail={mode,area:selectedArea,route:selectedRoute,routeName:activeRoute?.label||"",routeNodes:activeRoute?.nodes||[],routeEdges:activeRoute?.edges||[],paint:paintNames[selectedPaint],settings:{...settings}};
    window.AccraRushLaunchPending=mode;
    document.dispatchEvent(new CustomEvent("accrarush:start",{detail}));
    const mission=$("mission");if(mission)mission.textContent="RACE · "+(activeRoute?.label||areaInfo[selectedArea]?.n||"Accra Central").toUpperCase()+" · Keep left";
    $("start").click();
  }
  document.addEventListener("click",event=>{
    const areaCard=event.target.closest("[data-area-card]");if(areaCard){chooseArea(areaCard);return;}
    const target=event.target.closest("button");if(!target)return;
    if(target.id==="menu-start-setup"){launch("race");return;}
    if(target.id==="menu-play"){show("areas");return;}
    if(target.id==="menu-garage-direct"){show("garage");return;}
    
    if(target.hasAttribute("data-menu-back")){show("home");return;}
    if(target.hasAttribute("data-route")){selectRoute(target.dataset.route);return;}
    if(target.hasAttribute("data-model")){chooseModel(target);return;}
    if(target.hasAttribute("data-paint")){choosePaint(target);return;}
    
    if(target.id==="start"){const mode=window.AccraRushLaunchPending||"race";window.AccraRushLaunchPending=null;window.AccraRushLaunchMode=mode;save();const mission=$("mission");if(mission)mission.textContent="RACE · "+(roadNetworks[selectedArea]?.routes.find(route=>route.id===selectedRoute)?.label||areaInfo[selectedArea]?.n||"Accra Central").toUpperCase()+" · Keep left";}
  });
  document.querySelectorAll("[data-area-card][role=button]").forEach(card=>card.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();chooseArea(card);}}));
  const garageModel=$("taxi-model");if(garageModel)garageModel.addEventListener("load",()=>applyPaint());
  document.querySelectorAll(".ar-setting-row").forEach(row=>{
    const key=row.dataset.k;row.classList.toggle("on",!!settings[key]);row.setAttribute("aria-pressed",String(!!settings[key]));
    row.addEventListener("click",()=>{settings[key]=!settings[key];row.classList.toggle("on",settings[key]);row.setAttribute("aria-pressed",String(settings[key]));window.AccraRushSettings=settings;try{localStorage.setItem("accrarush.settings",JSON.stringify(settings))}catch{}if(key==="missionHints"&&$("mission"))$("mission").style.display=settings[key]?"":"none";});
  });
  if($("settingsHomeBtn"))$("settingsHomeBtn").addEventListener("click",()=>show("settings"));
  if($("closeSettings"))$("closeSettings").addEventListener("click",()=>show("home"));
  if($("mission"))$("mission").style.display=settings.missionHints?"":"none";
  renderAreaPreviewMaps();
  const savedArea=document.querySelector('[data-area-card="'+selectedArea+'"]');if(savedArea&&!savedArea.classList.contains("is-locked"))selectArea(selectedArea,true);save();
  const initial=$("menu-home");if(initial){initial.classList.add("is-visible");initial.hidden=false;initial.setAttribute("aria-hidden","false");}
  show("home");
})();
