#!/usr/bin/env node
/**
 * Import geographically sourced OSM roads into AccraRush's canonical graph.
 * Usage: node accra-ride/scripts/import-osm-road-areas.mjs [accra-central|lapaz|all]
 * Output: accra-ride/data/roads/<area>/{manifest,network,landmarks,routes}.json
 *
 * Bounding boxes are initial extraction windows, not surveyed game-area borders.
 * Review source coverage and topology before enabling a package in gameplay.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AREAS = {
  "accra-central": { south:5.535, west:-0.235, north:5.585, east:-0.175, origin:[-0.205,5.56] },
  "lapaz": { south:5.585, west:-0.275, north:5.625, east:-0.225, origin:[-0.25,5.605] }
};
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const finite = n => typeof n === "number" && Number.isFinite(n);
const isRoad = e => e.type === "way" && e.tags?.highway;
const roadFilter = '["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|road|track)$"]';

function project(lon,lat) {
  const a=6378137,e2=0.00669437999014,k=0.9996,ep2=e2/(1-e2);
  const phi=lat*Math.PI/180,lambda=lon*Math.PI/180,lambda0=-3*Math.PI/180;
  const N=a/Math.sqrt(1-e2*Math.sin(phi)**2),T=Math.tan(phi)**2,C=ep2*Math.cos(phi)**2,A=Math.cos(phi)*(lambda-lambda0);
  const M=a*((1-e2/4-3*e2**2/64-5*e2**3/256)*phi-(3*e2/8+3*e2**2/32+45*e2**3/1024)*Math.sin(2*phi)+(15*e2**2/256+45*e2**3/1024)*Math.sin(4*phi)-(35*e2**3/3072)*Math.sin(6*phi));
  return {eastingM:k*N*(A+(1-T+C)*A**3/6+(5-18*T+T**2+72*C-58*ep2)*A**5/120)+500000,northingM:k*(M+N*Math.tan(phi)*(A**2/2+(5-T+9*C+4*C**2)*A**4/24+(61-58*T+T**2+600*C-330*ep2)*A**6/720))};
}
function length(points) {
  let sum=0; for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];sum+=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);} return sum;
}
function boolOneWay(tags) {
  const v=String(tags.oneway??"").toLowerCase();
  if(["yes","1","true"].includes(v)) return "forward";
  if(["-1","reverse"].includes(v)) return "reverse";
  if(["no","0","false"].includes(v)) return "both";
  if(tags.junction==="roundabout"||tags.junction==="circular") return "forward";
  return "both"; // OSM default for ordinary roads; retain that this was defaulted.
}
function laneRecords(way,id) {
  const tags=way.tags??{}, direction=boolOneWay(tags), lanes=[];
  const count=value=>/^\\d+$/.test(String(value??""))&&Number(value)>0?Number(value):null;
  const total=count(tags.lanes);
  const add=(dir,suffix)=>{
    const directional=count(tags[`lanes:${dir}`]);
    const known=directional??(direction!=="both"?total:null);
    lanes.push({id:`${id}:lane:${suffix}`,direction:dir,widthM:null,widthSource:"unknown",type:"general",laneCount:known,laneCountTotal:total,laneCountSource:directional!==null?`osm:lanes:${dir}`:known!==null?"osm:lanes":"unknown"});
  };
  if(direction!=="reverse") add("forward","f");
  if(direction!=="forward") add("reverse","r");
  return lanes;
}
function nodeWorld(node,origin) {
  const p=project(node.lon,node.lat),o=project(origin[0],origin[1]);
  return {x:p.eastingM-o.eastingM,y:0,z:-(p.northingM-o.northingM)};
}
async function fetchOverpass(query) {
  let last;
  for(let attempt=0;attempt<6;attempt++) {
    const endpoint=ENDPOINTS[attempt%ENDPOINTS.length];
    try {
      const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded; charset=UTF-8","user-agent":"AccraRush-RoadDataImporter/1.0 (OpenStreetMap attribution included)"},body:"data="+encodeURIComponent(query),signal:AbortSignal.timeout(90000)});
      if(!response.ok) throw new Error(`Overpass HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
      const data=await response.json();
      if(!Array.isArray(data.elements)) throw new Error("Overpass response has no elements array");
      return data;
    } catch(error) {
      last=error;
      if(attempt<5) await sleep(Math.min(30000,1500*2**attempt));
    }
  }
  throw new Error(`All Overpass endpoints failed: ${last?.message??"unknown error"}`);
}
function parseRestrictions(elements,viaNode,edgeByWay) {
  const blocked=new Set(), only=new Map(), warnings=[];
  for(const rel of elements.filter(e=>e.type==="relation"&&e.tags?.type==="restriction")) {
    const from=rel.members?.find(m=>m.role==="from"&&m.type==="way");
    const to=rel.members?.find(m=>m.role==="to"&&m.type==="way");
    const via=rel.members?.find(m=>m.role==="via"&&m.type==="node");
    if(!from||!to||!via){warnings.push(`relation/${rel.id}: via-way or malformed restriction not fully modelled`);continue;}
    const fromEdges=(edgeByWay.get(from.ref)||[]).filter(e=>e.fromNodeId===`osm-node/${via.ref}`||e.toNodeId===`osm-node/${via.ref}`);
    const toEdges=(edgeByWay.get(to.ref)||[]).filter(e=>e.fromNodeId===`osm-node/${via.ref}`||e.toNodeId===`osm-node/${via.ref}`);
    const restriction=rel.tags.restriction??rel.tags["restriction:motorcar"]??"";
    const isOnly=restriction.startsWith("only_");
    for(const a of fromEdges) for(const b of toEdges) {
      for(const ad of ["forward","reverse"]) for(const bd of ["forward","reverse"]) {
        const aExit=ad==="forward"?a.toNodeId:a.fromNodeId,bEntry=bd==="forward"?b.fromNodeId:b.toNodeId;
        if(aExit!==`osm-node/${via.ref}`||bEntry!==`osm-node/${via.ref}`) continue;
        const key=[via.ref,a.id,ad,b.id,bd].join("|");
        if(isOnly) { if(!only.has(`${via.ref}|${a.id}|${ad}`)) only.set(`${via.ref}|${a.id}|${ad}`,new Set()); only.get(`${via.ref}|${a.id}|${ad}`).add(`${b.id}|${bd}`); }
        else blocked.add(key);
      }
    }
  }
  return {blocked,only,warnings};
}
function buildArea(areaId,config,elements,osmTimestamp) {
  const ways=elements.filter(isRoad), nodes=new Map(elements.filter(e=>e.type==="node").map(n=>[n.id,n]));
  const useCount=new Map();
  for(const way of ways) for(const nodeId of way.nodes??[]) useCount.set(nodeId,(useCount.get(nodeId)||0)+1);
  const restrictedViaNodes=elements.filter(e=>e.type==="relation"&&e.tags?.type==="restriction").flatMap(r=>r.members??[]).filter(m=>m.role==="via"&&m.type==="node").map(m=>m.ref);
  const splitNodes=new Set([...useCount].filter(([,count])=>count>1).map(([id])=>id));
  for (const id of restrictedViaNodes) splitNodes.add(id);
  const edges=[], graphNodes=new Map(), edgeByWay=new Map();
  const originProjected=project(config.origin[0],config.origin[1]);
  const addNode=id=>{const n=nodes.get(id);if(!n)return null;const p=project(n.lon,n.lat);graphNodes.set(`osm-node/${id}`,{id:`osm-node/${id}`,position:{x:p.eastingM-originProjected.eastingM,y:0,z:-(p.northingM-originProjected.northingM)},source:{type:"node",id:String(id),lon:n.lon,lat:n.lat}});return graphNodes.get(`osm-node/${id}`);};
  for(const way of ways) {
    const ids=way.nodes??[]; if(ids.length<2) continue;
    const cuts=[0]; for(let i=1;i<ids.length-1;i++) if(splitNodes.has(ids[i])) cuts.push(i); cuts.push(ids.length-1);
    const made=[];
    for(let s=0;s<cuts.length-1;s++) {
      const segmentIds=ids.slice(cuts[s],cuts[s+1]),start=nodes.get(segmentIds[0]),end=nodes.get(segmentIds.at(-1));
      if(!start||!end) continue;
      const fromId=`osm-node/${start.id}`,toId=`osm-node/${end.id}`;
      addNode(start.id);addNode(end.id);
      const centerline=segmentIds.map(id=>{const n=nodes.get(id);if(!n) return null;return nodeWorld(n,config.origin);}).filter(Boolean);
      if(centerline.length<2) continue;
      const id=`osm-way/${way.id}/part/${s}`;
      const edge={id,fromNodeId:fromId,toNodeId:toId,lengthM:length(centerline),centerline,lanes:laneRecords(way,id),roadClass:way.tags.highway,name:way.tags.name??null,ref:way.tags.ref??null,oneway:way.tags.oneway??null,onewaySource:way.tags.oneway?"osm":"osm-default",speedLimit:{value:way.tags.maxspeed??null,unit:"source-tag",source:way.tags.maxspeed?"osm":"unknown"},access:{access:way.tags.access??null,motorVehicle:way.tags.motor_vehicle??null},surface:way.tags.surface??null,bridge:way.tags.bridge??null,tunnel:way.tags.tunnel??null,layer:way.tags.layer??"0",junction:way.tags.junction??null,source:{type:"way",id:String(way.id),tags:way.tags,confidence:"osm-tagged",laneWidth:"unknown"}};
      edges.push(edge);made.push(edge);
    }
    edgeByWay.set(way.id,made);
  }
  const restrictions=parseRestrictions(elements,splitNodes,edgeByWay),junctions=[];
  for(const nodeId of splitNodes) {
    const graphId=`osm-node/${nodeId}`,incident=edges.filter(e=>e.fromNodeId===graphId||e.toNodeId===graphId);
    if(incident.length<2) continue;
    const movements=[];
    for(const incoming of incident) for(const outgoing of incident) {
      if(incoming.id===outgoing.id) continue;
      for(const fromDirection of ["forward","reverse"]) for(const toDirection of ["forward","reverse"]) {
        const exit=fromDirection==="forward"?incoming.toNodeId:incoming.fromNodeId;
        const entry=toDirection==="forward"?outgoing.fromNodeId:outgoing.toNodeId;
        if(exit!==graphId||entry!==graphId) continue;
        if(!incoming.lanes.some(l=>l.direction===fromDirection)||!outgoing.lanes.some(l=>l.direction===toDirection)) continue;
        const restrictionKey=[nodeId,incoming.id,fromDirection,outgoing.id,toDirection].join("|");
        if(restrictions.blocked.has(restrictionKey)) continue;
        const onlySet=restrictions.only.get(`${nodeId}|${incoming.id}|${fromDirection}`);
        if(onlySet&&!onlySet.has(`${outgoing.id}|${toDirection}`)) continue;
        movements.push({fromEdgeId:incoming.id,fromDirection,toEdgeId:outgoing.id,toDirection,source:"osm-topology",restrictionChecked:true});
      }
    }
    junctions.push({nodeId:graphId,type:"osm-shared-node",movements,source:{type:"osm-node",id:String(nodeId)}});
  }
  const landmarks=elements.filter(e=>["node","way"].includes(e.type)&&e.tags&&(["amenity","shop","tourism","historic","leisure","public_transport","railway","place"].some(k=>e.tags[k]))).map(e=>({id:`osm-${e.type}/${e.id}`,name:e.tags.name??e.tags.amenity??e.tags.shop??e.tags.tourism??"Unnamed mapped feature",position:e.type==="node"&&nodes.has(e.id)?nodeWorld(e,config.origin):null,source:{type:e.type,id:String(e.id),tags:e.tags},confidence:"osm-tagged"}));
  const network={id:`accra-${areaId}-osm-v1`,schemaVersion:1,units:"metres",coordinateSystem:"local-utm30n",nodes:[...graphNodes.values()],edges,junctions,source:{provider:"OpenStreetMap",license:"ODbL-1.0",attribution:"© OpenStreetMap contributors",timestamp:osmTimestamp,area:areaId}};
  const manifest={areaId,schemaVersion:1,status:"osm-imported-review-required",crs:"EPSG:32630",origin:{lon:config.origin[0],lat:config.origin[1],...originProjected},bounds:{south:config.south,west:config.west,north:config.north,east:config.east},source:{provider:"OpenStreetMap",license:"ODbL-1.0",attribution:"© OpenStreetMap contributors",timestamp:osmTimestamp,query:"highway ways plus referenced nodes and restriction relations"},counts:{nodes:network.nodes.length,edges:edges.length,junctions:junctions.length,landmarks:landmarks.length},warnings:[...restrictions.warnings,"Bounding box is an initial extraction window, not an approved gameplay boundary.","Lane counts/widths and speed limits are unknown unless explicitly present in source tags.","Via-way turn restrictions require manual review; not silently treated as fully modelled."]};
  return {manifest,network,landmarks,routes:{areaId,networkId:network.id,routes:[]}};
}
async function run(areaId) {
  const c=AREAS[areaId]; if(!c) throw new Error(`Unknown area: ${areaId}`);
  const bbox=`${c.south},${c.west},${c.north},${c.east}`;
  const query=`[out:json][timeout:90];(way${roadFilter}(${bbox});relation["type"="restriction"](${bbox}););(._;>;);out body;`;
  console.log(`Fetching OSM ${areaId} ${bbox}`);
  const data=await fetchOverpass(query);
  const built=buildArea(areaId,c,data.elements,data.osm3s?.timestamp_osm_base??new Date().toISOString());
  const dir=resolve(ROOT,"data","roads",areaId); await mkdir(dir,{recursive:true});
  for(const [name,value] of Object.entries(built)) await writeFile(resolve(dir,`${name}.json`),JSON.stringify(value,null,2)+"\n");
  console.log(`Wrote ${areaId}: ${built.manifest.counts.edges} road segments, ${built.manifest.counts.nodes} graph nodes, ${built.manifest.counts.junctions} junctions.`);
}
export { project, length, boolOneWay, laneRecords, buildArea };
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const requested=process.argv[2]??"all";
  for(const area of requested==="all"?Object.keys(AREAS):[requested]) await run(area);
}
