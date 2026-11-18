(()=>{
  // Presentation-only adapter: mirrors values already published by the game.
  const $=id=>document.getElementById(id);
  const speed=$("speed"),mission=$("mission"),panel=$("driveReadout"),gear=$("gearReadout");
  const distance=$("distanceReadout"),unit=$("distanceUnit"),signal=$("signalReadout"),cover=$("startcover");
  if(!speed||!mission||!panel||!gear||!distance||!signal)return;
  const label=signal.querySelector("b");
  const TOP_SPEED_KMH=180;
  const NAMES=["RED","AMBER","GREEN"];
  const seen={};
  const changed=(key,value)=>seen[key]===value?false:(seen[key]=value,true);
  const sync=()=>{
    const status=mission.textContent||"";
    const kmh=Math.max(0,Number(speed.textContent)||0);
    const fill=Math.min(100,kmh/TOP_SPEED_KMH*100).toFixed(1);
    if(changed("fill",fill)){panel.style.setProperty("--speed-p",fill);panel.style.setProperty("--speed-fill",fill+"%")}
    const reversing=status.startsWith("REVERSE GEAR"),letter=reversing?"R":"D";
    if(changed("gear",letter)){gear.textContent=letter;panel.dataset.gear=letter}
    const trip=status.match(/(\d+)\s*m\s*$/i),metres=trip?parseInt(trip[1],10):0;
    const shown=metres>=1000?(metres/1000).toFixed(2):String(metres);
    if(changed("trip",shown)){distance.textContent=shown;if(unit)unit.textContent=metres>=1000?"km":"m"}
    const phase=status.includes("AMBER LIGHT")?1:status.includes("GREEN LIGHT")?2:0,near=status.includes("AHEAD")?"1":"0";
    if(changed("signal",phase+"|"+near)){signal.dataset.phase=String(phase);signal.dataset.near=near;signal.setAttribute("aria-label","Traffic signal: "+NAMES[phase].toLowerCase()+(near==="1"?", ahead":""));if(label)label.textContent=NAMES[phase]}
    const running=/^(DRIVE|REVERSE GEAR)(\s|$)/.test(status),menuOpen=!!cover&&cover.style.display!=="none",live=running&&!menuOpen?"1":"0";
    if(changed("live",live))panel.dataset.live=live;
  };
  const observer=new MutationObserver(sync);
  observer.observe(speed,{childList:true,characterData:true,subtree:true});
  observer.observe(mission,{childList:true,characterData:true,subtree:true});
  if(cover)observer.observe(cover,{attributes:true,attributeFilter:["style","class","hidden","aria-hidden"]});
  sync();
})();
