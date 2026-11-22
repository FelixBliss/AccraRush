(()=>{
  const $=id=>document.getElementById(id);
  const validPaints={"taxi-yellow":"#e7b83d",white:"#e9edf0","midnight-blue":"#18364d",red:"#b93632",green:"#24784c"};
  const paintNames={"taxi-yellow":"Taxi Yellow",white:"White","midnight-blue":"Midnight Blue",red:"Red",green:"Green"};
  const screens=["home","areas","garage","settings"];
  let selectedArea="accra-central",selectedRoute="central-city-loop",selectedPaint="taxi-yellow";
  try{const saved=JSON.parse(localStorage.getItem("accrarush.setup")||"{}");if(["accra-central","lapaz"].includes(saved.area))selectedArea=saved.area;if(typeof saved.route==="string")selectedRoute=saved.route;if(Object.hasOwn(validPaints,saved.paint))selectedPaint=saved.paint}catch{}
  const vehicleName="Toyota Corolla Taxi";
  const areaInfo={
    "accra-central":{n:"Accra Central",d:"Choose a route within the independent Accra Central road network.",df:2},
    "lapaz":{n:"Lapaz",d:"Choose a route starting in Lapaz. This network is separate from Accra Central.",df:3}
  };
  // Directed one-way road loops. Each edge is ordered from its origin to its destination.
  // These selectable areas use the imported OSM road graphs at gameplay time.
  // No hand-drawn landmark loops are presented as real roads.
  const roadNetworks={
    "accra-central":{
      title:"ACCRA CENTRAL · OPENSTREETMAP ROAD NETWORK",
      nodes:{},edges:[],
      routes:[{id:"osm-free-drive",label:"Accra Central · 5 selected roads",nodes:[],edges:[],difficulty:"Five approved OSM roads and their real connectors"}]
    },
    "lapaz":{
      title:"LAPAZ · OPENSTREETMAP ROAD NETWORK",
      nodes:{},edges:[],
      routes:[{id:"osm-free-drive",label:"Lapaz · 5 selected roads",nodes:[],edges:[],difficulty:"Five approved OSM roads and their real connectors"}]
    }
  };
  // Preview-only directed loops for areas whose full driving physics are not enabled yet.
  const areaPreviewNetworks={
  };
  if(!roadNetworks[selectedArea]?.routes.some(route=>route.id===selectedRoute))selectedRoute=roadNetworks[selectedArea]?.routes[0]?.id||"central-city-loop";
  const mapSvgNS="http://www.w3.org/2000/svg";
  const svgNode=(tag,attrs,parent)=>{const node=document.createElementNS(mapSvgNS,tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));parent.appendChild(node);return node;};
  function drawRealOsmPreview(host,area,network){
    // Draws the shared selected-road graph (five approved roads + real connectors), nothing else.
    const model=network.mapModel,svg=document.createElementNS(mapSvgNS,"svg");
    svg.setAttribute("viewBox","0 0 360 210");svg.setAttribute("preserveAspectRatio","xMidYMid meet");
    svg.setAttribute("role","img");svg.setAttribute("aria-label","Selected five-road OpenStreetMap network for "+(areaInfo[area]?.n||area));
    const b=model.bounds,pad=18,w=360-pad*2,h=196-pad*2;
    const scale=Math.min(w/Math.max(1,b.maxX-b.minX),h/Math.max(1,b.maxZ-b.minZ));
    const ox=pad+(w-(b.maxX-b.minX)*scale)/2,oy=pad+(h-(b.maxZ-b.minZ)*scale)/2;
    const map=p=>[ox+(p.x-b.minX)*scale,196-(oy+(p.z-b.minZ)*scale)];
    const pathFor=roads=>{let d="";for(const road of roads){const line=road.centerline;const first=map(line[0]);d+="M"+first[0].toFixed(1)+","+first[1].toFixed(1);for(let i=1;i<line.length;i++){const p=map(line[i]);d+="L"+p[0].toFixed(1)+","+p[1].toFixed(1);}}return d;};
    const connectors=model.roads.filter(r=>r.role!=="route"),routes=model.roads.filter(r=>r.role==="route");
    if(connectors.length)svgNode("path",{d:pathFor(connectors),fill:"none",stroke:"#8aa3b2","stroke-width":1.2,"stroke-linecap":"round","stroke-linejoin":"round",opacity:.85,"data-layer":"connectors"},svg);
    svgNode("path",{d:pathFor(routes),fill:"none",stroke:"#f2bd42","stroke-width":1.9,"stroke-linecap":"round","stroke-linejoin":"round","data-layer":"routes"},svg);
    const label=svgNode("text",{x:10,y:12,fill:"#dceaf1","font-size":7.5,"font-weight":700,"letter-spacing":1},svg);
    label.textContent=(areaInfo[area]?.n||area).toUpperCase()+" · 5 SELECTED ROADS · "+model.edgeCount+" SEGMENTS";
    host.replaceChildren(svg);host.dataset.ready="true";host.dataset.edgeCount=String(model.edgeCount);
  }
  async function loadRealAreaNetworks(){
    const {selectRoadGraph,buildMapModel,APPROVED_ROADS}=await import("../map/selected-road-graph.js");
    const areas=["accra-central","lapaz"];
    await Promise.all(areas.map(async area=>{
      try{
        const response=await fetch("./data/osm/"+area+".network.json",{cache:"force-cache"});
        if(!response.ok)throw new Error("HTTP "+response.status);
        const document=await response.json(),net=document.network;
        if(!Array.isArray(net?.edges)||!Array.isArray(net?.nodes))throw new Error("Invalid OSM graph");
        const {network:selected,report}=selectRoadGraph(net,area);
        const mapModel=buildMapModel(selected,area);
        roadNetworks[area].realOSM=true;
        roadNetworks[area].mapModel=mapModel;
        roadNetworks[area].selection=report;
        roadNetworks[area].nodes=Object.fromEntries(selected.nodes.map(n=>[n.id,{x:n.position.x,z:n.position.z,label:""}]));
        roadNetworks[area].edges=selected.edges.map(e=>[e.id,e.fromNodeId,e.toNodeId]);
        const info=globalThis.document.querySelector('[data-area-map="'+area+'"]')?.closest("[data-area-card]")?.querySelector(".ar-area-title");
        if(info&&!info.querySelector(".ar-area-featured")){const note=globalThis.document.createElement("small");note.className="ar-area-featured";note.textContent="ROADS · "+APPROVED_ROADS[area].join(" · ");info.appendChild(note);}
      }catch(error){
        const host=document.querySelector('[data-area-map="'+area+'"]');
        if(host)host.textContent="MAP PREVIEW UNAVAILABLE";
      }
    }));
    renderAreaPreviewMaps();renderRouteOptions();
  }
  function renderAreaPreviewMaps(){
    const previewLabels={
    };
    document.querySelectorAll("[data-area-map]").forEach(host=>{
      const area=host.dataset.areaMap;
      const network=roadNetworks[area]||areaPreviewNetworks[area];
      if(!network)return;
      if(network.realOSM){drawRealOsmPreview(host,area,network);return;}
      const svg=document.createElementNS(mapSvgNS,"svg");
      svg.setAttribute("viewBox","0 0 360 210");
      svg.setAttribute("preserveAspectRatio","xMidYMid meet");
      svg.setAttribute("role","img");
      svg.setAttribute("aria-label","Single-lane one-way loop route for "+(areaInfo[area]?.n||area));
      const route=network.routes?.[0];
      let orderedIds=route?.nodes?.slice();
      if(!orderedIds?.length){
        orderedIds=network.edges.map(edge=>edge[1]);
        if(network.edges.length)orderedIds.push(network.edges[network.edges.length-1][2]);
      }
      if(orderedIds.length>1&&orderedIds[0]===orderedIds[orderedIds.length-1])orderedIds.pop();
      const uniquePoints=orderedIds.map(id=>network.nodes[id]).filter(Boolean);
      if(uniquePoints.length<3){host.textContent='OPENSTREETMAP · REAL ROAD NETWORK';return;}
      const xs=uniquePoints.map(n=>n.x),ys=uniquePoints.map(n=>n.z??n.y??0);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
      const spanX=Math.max(1,maxX-minX),spanY=Math.max(1,maxY-minY);
      const scale=Math.min(292/spanX,154/spanY);
      const ox=(360-spanX*scale)/2,oy=(210-spanY*scale)/2;
      const point=id=>{const n=network.nodes[id];return{x:ox+(n.x-minX)*scale,y:oy+(maxY-(n.z??n.y??0))*scale};};
      const pts=orderedIds.map(point);
      const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
      const first=mid(pts[pts.length-1],pts[0]);
      let d="M"+first.x.toFixed(1)+","+first.y.toFixed(1);
      for(let i=0;i<pts.length;i++){
        const current=pts[i],next=pts[(i+1)%pts.length],nextMid=mid(current,next);
        d+=" Q"+current.x.toFixed(1)+","+current.y.toFixed(1)+" "+nextMid.x.toFixed(1)+","+nextMid.y.toFixed(1);
      }
      d+=" Z";
      svgNode("path",{d,class:"ar-mini-loop-road-outline"},svg);
      svgNode("path",{d,class:"ar-mini-loop-road"},svg);
      // One clear arrow on every directed leg; all arrows follow the same loop direction.
      for(let i=0;i<pts.length;i++){
        const a=pts[i],b=pts[(i+1)%pts.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
        const ux=dx/len,uy=dy/len,nx=-uy,ny=ux,t=.58;
        const cx=a.x+dx*t,cy=a.y+dy*t,tip=[cx+ux*8,cy+uy*8],back=[cx-ux*6,cy-uy*6];
        const left=[back[0]+nx*5,back[1]+ny*5],right=[back[0]-nx*5,back[1]-ny*5];
        svgNode("path",{d:"M"+tip[0].toFixed(1)+","+tip[1].toFixed(1)+" L"+left[0].toFixed(1)+","+left[1].toFixed(1)+" L"+right[0].toFixed(1)+","+right[1].toFixed(1)+" Z",class:"ar-mini-direction"},svg);
      }
      const labels=previewLabels[area]||{};
      orderedIds.forEach((id,i)=>{
        const p=pts[i],node=network.nodes[id];
        svgNode("circle",{cx:p.x,cy:p.y,r:4.2,class:"ar-mini-junction"},svg);
        const label=node.label||labels[id]||id;
        const anchor=p.x>300?"end":p.x<60?"start":"middle";
        const tx=p.x+(anchor==="start"?7:anchor==="end"?-7:0);
        const ty=p.y<28?p.y+15:p.y>184?p.y-9:p.y-8;
        const text=svgNode("text",{x:tx,y:ty,"text-anchor":anchor,class:"ar-mini-place-label"},svg);
        text.textContent=label;
      });
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
    if(!network.edges.length){const note=svgNode("text",{x:180,y:110,"text-anchor":"middle",class:"ar-road-node-label"},edges);note.textContent="ACTUAL OSM MAP PREVIEW IS LOADING";svg.dataset.ready="true";updateRoadMapSelection();return;}
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
  let activeScreen="home",navigationBusy=false,pendingScreen=null;
  const reduceMotion=()=>window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function show(name){
    if(!screens.includes(name))return;
    // Preserve a Back request made during a screen transition instead of dropping it.
    if(navigationBusy){pendingScreen=name;return;}
    if(name===activeScreen)return;
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
      window.setTimeout(()=>{
        navigationBusy=false;
        if(pendingScreen!==null){const queued=pendingScreen;pendingScreen=null;if(queued!==activeScreen)show(queued);}
      },duration+30);
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
    // If a transition is underway, queue Home so Android Back is never lost.
    if(navigationBusy){pendingScreen="home";return;}
    if(activeScreen!=="home"){show("home");return;}
    if(cover&&cover.style.display==="none"){
      document.dispatchEvent(new Event("accrarush:show-menu"));
      cover.style.display="grid";cover.setAttribute("aria-hidden","false");return;
    }
    openExitDialog();
  }
  window.AccraRushReturnToHome=returnToHome;
  const handleBack=event=>{
    event?.preventDefault?.();event?.stopPropagation?.();event?.stopImmediatePropagation?.();
    const dialog=$("ar-exit-dialog");
    if(dialog&&!dialog.hidden){closeExitDialog();return false;}
    returnToHome();return false;
  };
  // Browser/WebView fallback handlers.
  document.addEventListener("backbutton",handleBack,true);
  window.addEventListener("keydown",event=>{
    if(event.key==="Escape"||event.key==="Backspace"){
      event.preventDefault();event.stopImmediatePropagation();
      handleBack(event);
    }
  },true);
  window.addEventListener("popstate",event=>{
    event.stopImmediatePropagation();handleBack(event);
    history.pushState({accrarush:true},"","#accrarush");
  },true);
  history.pushState({accrarush:true},"","#accrarush");
  // Capacitor's App plugin may become available after this page script runs.
  // Register once it exists, and retry briefly during WebView startup.
  let nativeBackRegistered=false,nativeBackRegistering=false;
  function getNativeApp(){
    return window.Capacitor?.Plugins?.App||window.Capacitor?.App||null;
  }
  function registerNativeBackHandler(){
    if(nativeBackRegistered||nativeBackRegistering)return nativeBackRegistered;
    const app=getNativeApp();if(!app?.addListener)return false;
    nativeBackRegistering=true;
    try{
      const registration=app.addListener("backButton",event=>handleBack(event));
      if(registration&&typeof registration.then==="function"){
        registration.then(()=>{nativeBackRegistered=true;nativeBackRegistering=false;}).catch(()=>{nativeBackRegistering=false;});
      }else{nativeBackRegistered=true;nativeBackRegistering=false;}
    }catch(error){nativeBackRegistering=false;return false;}
    return true;
  }
  document.addEventListener("deviceready",registerNativeBackHandler,false);
  window.addEventListener("load",registerNativeBackHandler,{once:true});
  registerNativeBackHandler();
  let nativeBackRetries=0;
  const nativeBackRetryTimer=window.setInterval(()=>{
    nativeBackRetries++;
    if(registerNativeBackHandler()||nativeBackRetries>=60)window.clearInterval(nativeBackRetryTimer);
  },500);
  const cancelExit=$("ar-exit-cancel"),confirmExit=$("ar-exit-confirm"),exitDialog=$("ar-exit-dialog");
  if(cancelExit)cancelExit.addEventListener("click",closeExitDialog);
  if(confirmExit)confirmExit.addEventListener("click",()=>{
    window.dispatchEvent(new Event("accrarush:quit"));
    closeExitDialog();
    const app=getNativeApp();
    if(app?.exitApp)app.exitApp();
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
  loadRealAreaNetworks();
  const savedArea=document.querySelector('[data-area-card="'+selectedArea+'"]');if(savedArea&&!savedArea.classList.contains("is-locked"))selectArea(selectedArea,true);save();
  const initial=$("menu-home");if(initial){initial.classList.add("is-visible");initial.hidden=false;initial.setAttribute("aria-hidden","false");}
  show("home");
})();
