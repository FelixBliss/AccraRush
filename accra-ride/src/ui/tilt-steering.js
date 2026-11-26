(()=>{'use strict';
 const KEY='accrarush.steering',defaults={mode:'wheel',sensitivity:1,neutral:0};
 let settings={...defaults};try{settings={...settings,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{}
 let raw=0,available=false,listening=false,lastEvent=null;
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 function axis(e){const angle=Number(screen.orientation?.angle??window.orientation??0);const a=Math.abs(angle)%180===90?(angle===270?-Number(e.beta||0):Number(e.beta||0)):Number(e.gamma||0);return clamp((a-settings.neutral)/28*settings.sensitivity,-1,1)}
 function onOrientation(e){if(!Number.isFinite(e.gamma)&&!Number.isFinite(e.beta))return;lastEvent=e;raw=axis(e);available=true}
 function persist(){try{localStorage.setItem(KEY,JSON.stringify(settings))}catch{}}
 async function enable(){if(typeof DeviceOrientationEvent==='undefined')return false;try{if(typeof DeviceOrientationEvent.requestPermission==='function'&&await DeviceOrientationEvent.requestPermission()!=='granted')return false;if(!listening){window.addEventListener('deviceorientation',onOrientation,true);listening=true}return true}catch{return false}}
 async function setMode(mode){if(!['wheel','tilt'].includes(mode))return false;if(mode==='tilt'&&!await enable())return false;settings.mode=mode;if(mode==='wheel')raw=0;persist();window.dispatchEvent(new CustomEvent('accrarush:steering-mode',{detail:{mode}}));return true}
 function calibrate(){if(!available||!lastEvent)return false;const angle=Number(screen.orientation?.angle??window.orientation??0);settings.neutral=Math.abs(angle)%180===90?(angle===270?-Number(lastEvent.beta||0):Number(lastEvent.beta||0)):Number(lastEvent.gamma||0);raw=0;persist();return true}
 function setSensitivity(value){settings.sensitivity=clamp(Number(value)||1,.4,2.5);persist();return settings.sensitivity}
 window.AccraRushTiltSteering={getMode:()=>settings.mode,getSensitivity:()=>settings.sensitivity,isAvailable:()=>available,read:()=>settings.mode==='tilt'&&available?raw:0,setMode,calibrate,setSensitivity,enable};
 if(settings.mode==='tilt')enable().then(ok=>{if(!ok){settings.mode='wheel';persist()}});
})();