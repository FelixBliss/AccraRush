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
  // Directed one-way road loops. Each edge is ordered from its origin to its destination.
  const roadNetworks={
    "accra-central":{
      title:"ACCRA CENTRAL ONE-WAY LOOP",
      nodes:{C:{x:-30,z:5,label:"ACCRA CENTRAL"},K:{x:-210,z:55,label:"KANESHIE"},B:{x:-245,z:-115,label:"ABOSSEY OKAI"},X:{x:-90,z:-205,label:"CIRCLE"},A:{x:70,z:-115,label:"ADABRAKA"},R:{x:130,z:80,label:"RIDGE"},O:{x:205,z:185,label:"OSU"}},
      edges:[["central-kaneshie","C","K"],["kaneshie-abossey","K","B"],["abossey-circle","B","X"],["circle-adabraka","X","A"],["adabraka-ridge","A","R"],["ridge-osu","R","O"],["osu-central","O","C"]],
      routes:[{id:"central-city-loop",label:"Central → Kaneshie → Abossey Okai → Circle → Adabraka → Ridge → Osu → Central",nodes:["C","K","B","X","A","R","O","C"],edges:["central-kaneshie","kaneshie-abossey","abossey-circle","circle-adabraka","adabraka-ridge","ridge-osu","osu-central"],difficulty:"One-way city circuit"}]
    },
    "lapaz":{
      title:"LAPAZ CROSS-CITY ONE-WAY LOOP",
      nodes:{L:{x:-260,z:5,label:"LAPAZ"},A:{x:-175,z:145,label:"ACHIMOTA"},D:{x:-35,z:205,label:"DZORWULU"},P:{x:115,z:160,label:"AIRPORT"},S:{x:235,z:55,label:"SHIASHIE"},M:{x:190,z:-145,label:"MADINA"}},
      edges:[["lapaz-achimota","L","A"],["achimota-dzorwulu","A","D"],["dzorwulu-airport","D","P"],["airport-shiashie","P","S"],["shiashie-madina","S","M"],["madina-lapaz","M","L"]],
      routes:[{id:"lapaz-city-loop",label:"Lapaz → Achimota → Dzorwulu → Airport → Shiashie → Madina → Lapaz",nodes:["L","A","D","P","S","M","L"],edges:["lapaz-achimota","achimota-dzorwulu","dzorwulu-airport","airport-shiashie","shiashie-madina","madina-lapaz"],difficulty:"One-way cross-city circuit"}]
    }
  };
  const mapSvgNS="http://www.w3.org/2000/svg";
  const mapPoint=([x,z])=>({x:65+(x+300)*.95,y:40+(250-z)*.62});
  const svgNode=(tag,attrs,parent)=>{const node=document.createElementNS(mapSvgNS,tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));parent.appendChild(node);return node;};
  const areaPreviewRoads={
    "accra-central":{loop:"M35 82 C45 35 105 18 155 36 C220 57 280 90 275 132 C270 164 220 166 174 145 C122 122 88 151 48 128 C22 113 20 96 35 82",arrows:[[91,37,1,0],[248,89,0,1],[178,151,-1,0],[42,111,0,-1]],connectors:["M92 37 C105 68 121 82 151 92","M174 145 C158 111 160 82 184 55"]},
    "lapaz":{loop:"M25 100 C35 56 67 30 105 35 C145 40 152 76 185 76 C226 76 270 45 291 75 C315 110 280 145 245 145 C205 145 190 119 154 132 C110 150 61 151 25 100",arrows:[[75,34,1,0],[263,58,1,1],[270,144,-1,0],[75,145,-1,-1]],connectors:["M105 35 C111 73 131 103 154 132","M185 76 C184 100 198 123 245 145"]},
    "osu-cantonments":{loop:"M28 48 C72 18 122 25 147 59 C171 91 204 101 251 81 C292 63 305 94 281 127 C255 163 201 149 169 128 C132 104 91 131 55 111 C25 95 12 68 28 48",arrows:[[93,25,1,0],[285,93,0,1],[202,148,-1,0],[28,83,0,-1]],connectors:["M147 59 C119 82 109 105 91 131","M169 128 C196 104 223 91 251 81"]},
    "airport-labone":{loop:"M24 115 C40 72 75 39 119 42 C165 45 181 80 218 76 C262 72 302 92 288 127 C275 160 228 153 195 131 C160 107 128 142 86 148 C51 153 18 142 24 115",arrows:[[83,46,1,0],[278,103,0,1],[202,139,-1,0],[36,139,-1,-1]],connectors:["M119 42 C129 77 151 102 195 131","M218 76 C212 103 216 125 228 153"]},
    "kaneshie-abossey-okai":{loop:"M24 72 C57 25 110 23 142 56 C173 89 203 64 239 45 C277 25 305 53 291 91 C278 128 239 143 201 122 C164 102 139 141 97 148 C52 155 8 117 24 72",arrows:[[100,29,1,0],[296,68,0,1],[151,132,-1,0],[22,105,0,-1]],connectors:["M142 56 C129 91 134 121 97 148","M201 122 C224 93 250 75 291 91"]},
    "achimota-atomic":{loop:"M28 112 C35 65 66 34 111 35 C155 36 170 70 207 67 C246 64 290 39 302 77 C315 116 279 145 239 139 C197 133 180 109 145 128 C104 150 55 153 28 112",arrows:[[82,35,1,0],[299,91,0,1],[185,125,-1,0],[33,88,0,-1]],connectors:["M111 35 C124 72 126 102 145 128","M207 67 C214 94 225 118 239 139"]},
    "madina-legon":{loop:"M25 92 C36 47 77 22 119 35 C161 48 159 85 196 91 C236 98 267 61 296 82 C322 101 297 143 263 145 C223 147 205 119 169 131 C124 147 69 157 37 127 C24 115 20 103 25 92",arrows:[[82,27,1,0],[300,106,0,1],[207,135,-1,0],[31,119,-1,-1]],connectors:["M119 35 C132 70 144 105 169 131","M196 91 C221 78 249 75 296 82"]}
  };
  function renderAreaPreviewMaps(){
    document.querySelectorAll("[data-area-map]").forEach(host=>{
      const data=areaPreviewRoads[host.dataset.areaMap];if(!data)return;
      const svg=document.createElementNS(mapSvgNS,"svg");svg.setAttribute("viewBox","0 0 320 170");svg.setAttribute("preserveAspectRatio","xMidYMid meet");svg.setAttribute("role","img");svg.setAttribute("aria-label","One-way connected route loop");
      const defs=svgNode("defs",{},svg),marker=svgNode("marker",{id:"oneway-"+host.dataset.areaMap,viewBox:"0 0 10 10",refX:8,refY:5,markerWidth:5,markerHeight:5,orient:"auto-start-reverse"},defs);
      svgNode("path",{d:"M0 0L10 5L0 10Z",fill:"#f5c65b"},marker);
      const draw=(d,cls)=>{svgNode("path",{d,class:cls+" ar-mini-road-base"},svg);svgNode("path",{d,class:cls+" ar-mini-road-surface","marker-end":"url(#oneway-"+host.dataset.areaMap+")"},svg);};
      draw(data.loop,"ar-mini-loop");
      data.connectors.forEach(d=>draw(d,"ar-mini-connector"));
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
  function openExitDialog(){
    const dialog=$("ar-exit-dialog");if(!dialog)return;
    dialog.hidden=false;dialog.classList.add("is-open");
    $("ar-exit-cancel")?.focus();
  }
  function closeExitDialog(){
    const dialog=$("ar-exit-dialog");if(!dialog)return;
    dialog.classList.remove("is-open");dialog.hidden=true;
  }
  function returnToHome(){
    const cover=$("startcover");
    if(activeScreen!=="home"){show("home");return;}
    if(cover&&cover.style.display==="none"){
      document.dispatchEvent(new Event("accrarush:show-menu"));
      cover.style.display="grid";cover.setAttribute("aria-hidden","false");return;
    }
    openExitDialog();
  }
  window.AccraRushReturnToHome=returnToHome;
  const handleBack=event=>{event?.preventDefault?.();event?.stopPropagation?.();event?.stopImmediatePropagation?.();returnToHome();return false;};
  document.addEventListener("backbutton",handleBack,true);
  window.addEventListener("keydown",event=>{
    if(event.key==="Escape"||event.key==="Backspace"){
      event.preventDefault();event.stopImmediatePropagation();
      const dialog=$("ar-exit-dialog");if(dialog&&!dialog.hidden){closeExitDialog();return;}
      handleBack(event);
    }
  },true);
  window.addEventListener("popstate",event=>{event.stopImmediatePropagation();returnToHome();history.pushState({accrarush:true},"","#accrarush");},true);
  history.pushState({accrarush:true},"","#accrarush");
  const cancelExit=$("ar-exit-cancel"),confirmExit=$("ar-exit-confirm"),exitDialog=$("ar-exit-dialog");
  if(cancelExit)cancelExit.addEventListener("click",closeExitDialog);
  if(confirmExit)confirmExit.addEventListener("click",()=>{
    window.dispatchEvent(new Event("accrarush:quit"));
    closeExitDialog();
    if(window.Capacitor?.Plugins?.App?.exitApp)window.Capacitor.Plugins.App.exitApp();
    else if(navigator.app?.exitApp)navigator.app.exitApp();
    else {window.dispatchEvent(new Event("accrarush:exit-requested"));}
  });
  if(exitDialog)exitDialog.addEventListener("click",event=>{if(event.target===exitDialog)closeExitDialog();});
  document.addEventListener("visibilitychange",()=>{if(document.hidden)closeExitDialog();});
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
