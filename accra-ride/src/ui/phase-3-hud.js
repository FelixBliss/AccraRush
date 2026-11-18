(()=>{
  const speed=document.getElementById("speed");
  const mission=document.getElementById("mission");
  const panel=document.getElementById("driveReadout");
  const gear=document.getElementById("gearReadout");
  const distance=document.getElementById("distanceReadout");
  const signal=document.getElementById("signalReadout");
  if(!speed||!mission||!panel||!gear||!distance||!signal)return;
  const sync=()=>{
    const speedValue=Math.max(0,Number(speed.textContent)||0);
    panel.style.setProperty("--speed-fill",Math.min(100,speedValue/180*100)+"%");
    const status=mission.textContent||"";
    const reversing=status.startsWith("REVERSE GEAR");
    gear.textContent=reversing?"R":"D";
    const trip=status.match(/(\d+)\s*m\s*$/i);
    distance.textContent=trip?trip[1]:"0";
    const phase=status.includes("AMBER LIGHT")?"1":status.includes("GREEN LIGHT")?"2":"0";
    const label=phase==="1"?"AMBER":phase==="2"?"GREEN":"RED";
    signal.dataset.phase=phase;
    signal.setAttribute("aria-label","Traffic signal: "+label.toLowerCase());
    signal.querySelector("b").textContent=label;
  };
  const observer=new MutationObserver(sync);
  observer.observe(speed,{childList:true,characterData:true,subtree:true});
  observer.observe(mission,{childList:true,characterData:true,subtree:true});
  sync();
})();