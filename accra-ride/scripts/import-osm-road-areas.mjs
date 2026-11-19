#!/usr/bin/env node
/**
 * Reproducible, tiled OpenStreetMap importer for AccraRush.
 * Usage: node accra-ride/scripts/import-osm-road-areas.mjs [accra-central|lapaz|all]
 * Imported tiles remain partial until reviewed; this script never marks an area production-ready.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const AREAS={
 "accra-central":{
  origin:[-0.19666666666666668,5.5566666666666675],
  footprint:{kind:"project_defined_playable_rectangle",bounds:{south:5.535,west:-0.225,north:5.575,east:-0.185},note:"Gameplay extraction window centred on the OSM Accra Central locality; not an official administrative boundary."},
  tiles:[
   {south:5.535,west:-0.225,north:5.555,east:-0.205},
   {south:5.535,west:-0.205,north:5.555,east:-0.185},
   {south:5.555,west:-0.225,north:5.575,east:-0.205},
   {south:5.555,west:-0.205,north:5.575,east:-0.185}
  ]
 },
 lapaz:{
  origin:[-0.25333333333333335,5.601666666666667],
  footprint:{kind:"project_defined_playable_rectangle",bounds:{south:5.585,west:-0.275,north:5.625,east:-0.235},note:"Gameplay extraction window centred on the OSM Lapaz locality; not an official administrative boundary."},
  tiles:[
   {south:5.585,west:-0.275,north:5.605,east:-0.255},
   {south:5.585,west:-0.255,north:5.605,east:-0.235},
   {south:5.605,west:-0.275,north:5.625,east:-0.255},
   {south:5.605,west:-0.255,north:5.625,east:-0.235}
  ]
 }
};
const ENDPOINTS=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter","https://overpass.private.coffee/api/interpreter"];
const ROAD_CLASSES=new Set(["motorway","motorway_link","trunk","trunk_link","primary","primary_link","secondary","secondary_link","tertiary","tertiary_link","unclassified","residential","living_street","service","road","track"]);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const str=v=>String(v);
const isRoad=e=>e?.type==="way"&&Boolean(e.tags?.highway);
const isMotorRoad=e=>e?.type==="way"&&ROAD_CLASSES.has(e.tags?.highway)&&!["no","private"].includes(String(e.tags?.motor_vehicle??"").toLowerCase())&&!["no","private"].includes(String(e.tags?.access??"").toLowerCase());
const project=(lon,lat)=>{
 const a=6378137,e2=.00669437999014,k=.9996,ep2=e2/(1-e2),phi=lat*Math.PI/180,lambda=lon*Math.PI/180,lambda0=-3*Math.PI/180;
 const N=a/Math.sqrt(1-e2*Math.sin(phi)**2),T=Math.tan(phi)**2,C=ep2*Math.cos(phi)**2,A=Math.cos(phi)*(lambda-lambda0);
 const M=a*((1-e2/4-3*e2**2/64-5*e2**3/256)*phi-(3*e2/8+3*e2**2/32+45*e2**3/1024)*Math.sin(2*phi)+(15*e2**2/256+45*e2**3/1024)*Math.sin(4*phi)-(35*e2**3/3072)*Math.sin(6*phi));
 return {eastingM:k*N*(A+(1-T+C)*A**3/6+(5-18*T+T**2+72*C-58*ep2)*A**5/120)+500000,northingM:k*(M+N*Math.tan(phi)*(A**2/2+(5-T+9*C+4*C**2)*A**4/24+(61-58*T+T**2+600*C-330*ep2)*A**6/720))};
};
const length=points=>points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y,p.z-points[i].z),0);
function directionInfo(tags){
 const v=str(tags.oneway??"").toLowerCase();
 if(["yes","1","true"].includes(v))return {direction:"forward",status:"allowed",source:"explicit_oneway_tag"};
 if(["-1","reverse"].includes(v))return {direction:"reverse",status:"allowed",source:"explicit_oneway_reverse_tag"};
 if(["no","0","false"].includes(v))return {direction:"both",status:"allowed",source:"explicit_bidirectional_tag"};
 if(["roundabout","circular"].includes(tags.junction))return {direction:"forward",status:"allowed",source:"roundabout_default"};
 return {direction:"both",status:"unknown",source:"OSM_default_direction_unverified"};
}
function boolOneWay(tags){return directionInfo(tags).direction;}
function laneRecords(way,edgeId){
 const tags=way.tags??{},info=directionInfo(tags),num=v=>/^\d+$/.test(str(v??""))&&Number(v)>0?Number(v):null;
 const total=num(tags.lanes),lanes=[];
 const add=(direction,suffix)=>{
  const directional=num(tags["lanes:"+direction]),count=directional??(info.direction!=="both"?total:null);
  lanes.push({id:edgeId+":"+suffix,direction,widthM:null,physicalLaneCount:count,laneCount:count,laneCountTotal:total,representation:"directional-corridor",status:info.status,directionSource:info.source});
 };
 if(info.direction!=="reverse")add("forward","fwd");
 if(info.direction!=="forward")add("reverse","rev");
 return lanes;
}
function nodePosition(node,originProjected){
 const p=project(node.lon,node.lat);
 return {x:p.eastingM-originProjected.eastingM,y:0,z:-(p.northingM-originProjected.northingM)};
}
async function fetchOverpass(query){
 let last;
 for(let i=0;i<ENDPOINTS.length*2;i++){
  const endpoint=ENDPOINTS[i%ENDPOINTS.length];
  try{
   const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded; charset=UTF-8","user-agent":"AccraRush-RoadDataImporter/1.1 (OpenStreetMap attribution included)"},body:"data="+encodeURIComponent(query),signal:AbortSignal.timeout(90000)});
   if(!response.ok)throw new Error("Overpass HTTP "+response.status+": "+(await response.text()).slice(0,250));
   const data=await response.json();if(!Array.isArray(data.elements))throw new Error("Overpass response has no elements array");return data;
  }catch(error){last=error;if(i<ENDPOINTS.length*2-1)await sleep(Math.min(30000,1200*2**Math.min(i,5)));}
 }
 throw new Error("All Overpass endpoints failed: "+(last?.message??"unknown error"));
}
function parseRestrictions(elements,edgeByWay){
 const blocked=new Set(),only=new Map(),relations=[],unresolved=[];
 for(const rel of elements.filter(e=>e.type==="relation"&&e.tags?.type==="restriction")){
  const from=rel.members?.find(m=>m.role==="from"&&m.type==="way"),to=rel.members?.find(m=>m.role==="to"&&m.type==="way"),via=rel.members?.find(m=>m.role==="via");
  if(!from||!to||!via||via.type!=="node"){unresolved.push(str(rel.id));continue;}
  const nodeId="osm-node-"+str(via.ref),fromEdges=(edgeByWay.get(str(from.ref))??[]).filter(e=>e.fromNodeId===nodeId||e.toNodeId===nodeId),toEdges=(edgeByWay.get(str(to.ref))??[]).filter(e=>e.fromNodeId===nodeId||e.toNodeId===nodeId);
  if(!fromEdges.length||!toEdges.length){unresolved.push(str(rel.id));continue;}
  const restriction=rel.tags.restriction??rel.tags["restriction:motorcar"]??"",isOnly=restriction.startsWith("only_");
  for(const a of fromEdges)for(const b of toEdges)for(const ad of ["forward","reverse"])for(const bd of ["forward","reverse"]){
   const exit=ad==="forward"?a.toNodeId:a.fromNodeId,entry=bd==="forward"?b.fromNodeId:b.toNodeId;
   if(exit!==nodeId||entry!==nodeId)continue;
   const key=[nodeId,a.id,ad,b.id,bd].join("|");
   if(isOnly){const k=[nodeId,a.id,ad].join("|");if(!only.has(k))only.set(k,new Set());only.get(k).add([b.id,bd].join("|"));}
   else blocked.add(key);
  }
  relations.push(str(rel.id));
 }
 return {blocked,only,relations,unresolved};
}
function buildArea(areaId,config,elements,timestamp){
 const ways=elements.filter(isMotorRoad),excludedWays=elements.filter(e=>e?.type==="way"&&e.tags?.highway&&!isMotorRoad(e)).map(e=>({id:str(e.id),highway:e.tags.highway,reason:"not a motor-road class or explicitly restricted access"})),nodes=new Map(elements.filter(e=>e.type==="node").map(n=>[str(n.id),n]));
 const useCount=new Map();
 for(const way of ways)for(const ref of way.nodes??[]){const k=str(ref);useCount.set(k,(useCount.get(k)??0)+1);}
 const viaNodes=elements.filter(e=>e.type==="relation"&&e.tags?.type==="restriction").flatMap(r=>r.members??[]).filter(m=>m.role==="via"&&m.type==="node").map(m=>str(m.ref));
 const splitNodes=new Set([...useCount].filter(([,count])=>count>1).map(([id])=>id));for(const id of viaNodes)splitNodes.add(id);
 const originProjected=project(config.origin[0],config.origin[1]),graphNodes=new Map(),edges=[],edgeByWay=new Map(),sourceWays=[];
 const addNode=id=>{
  const key=str(id),n=nodes.get(key);if(!n)return null;
  const projected=project(n.lon,n.lat),position=nodePosition(n,originProjected);
  const node={id:"osm-node-"+key,sourceNodeId:key,position,coordinate:{lon:n.lon,lat:n.lat},projected,elevationM:null,elevationStatus:"not_mapped",nodeType:splitNodes.has(key)?"junction_candidate":"shape"};
  graphNodes.set(node.id,node);return node;
 };
 for(const way of ways){
  const refs=(way.nodes??[]).map(str);if(refs.length<2)continue;
  sourceWays.push({id:str(way.id),version:way.version??null,tags:way.tags??{},nodeRefs:refs});
  const cuts=[0];for(let i=1;i<refs.length-1;i++)if(splitNodes.has(refs[i]))cuts.push(i);cuts.push(refs.length-1);
  const made=[];
  for(let s=0;s<cuts.length-1;s++){
   const segmentRefs=refs.slice(cuts[s],cuts[s+1]+1),first=nodes.get(segmentRefs[0]),last=nodes.get(segmentRefs.at(-1));if(!first||!last)continue;
   const from=addNode(first.id),to=addNode(last.id);if(!from||!to||from.id===to.id)continue;
   const centerline=segmentRefs.map(ref=>nodes.get(ref)).filter(Boolean).map(n=>nodePosition(n,originProjected));if(centerline.length<2)continue;
   const edgeId="osm-way-"+str(way.id)+"-seg-"+s,info=directionInfo(way.tags??{}),lanes=laneRecords(way,edgeId);
   const speedRaw=way.tags?.maxspeed??null,speedMatch=typeof speedRaw==="string"?speedRaw.match(/^(\d+(?:\.\d+)?)\s*(?:km\/h|kph)?$/i):null;
   const edge={id:edgeId,fromNodeId:from.id,toNodeId:to.id,centerline,lengthM:length(centerline),roadClass:way.tags.highway,name:way.tags.name??null,ref:way.tags.ref??null,surface:way.tags.surface??null,speedLimitKph:speedMatch?Number(speedMatch[1]):null,speedLimitSource:speedRaw?"OSM maxspeed="+speedRaw:"unknown",lanes,oneway:way.tags.oneway??null,onewayStatus:info.source,totalLaneCount:/^\d+$/.test(str(way.tags.lanes??""))?Number(way.tags.lanes):null,accessRestrictions:{access:way.tags.access??null,motorVehicle:way.tags.motor_vehicle??null},bridge:way.tags.bridge??null,tunnel:way.tags.tunnel??null,layer:way.tags.layer??null,junctionType:way.tags.junction??null,source:{type:"OpenStreetMap",wayId:str(way.id),wayVersion:way.version??null,sourceNodeIds:segmentRefs,sourceTags:way.tags??{},confidence:"mapped_osm_geometry_not_field_verified"},sourceWayId:str(way.id),segmentOrdinal:s};
   edges.push(edge);made.push(edge);
  }
  edgeByWay.set(str(way.id),made);
 }
 const restrictions=parseRestrictions(elements,edgeByWay),junctions=[];
 for(const nodeId of splitNodes){
  const graphId="osm-node-"+nodeId,incident=edges.filter(e=>e.fromNodeId===graphId||e.toNodeId===graphId);if(incident.length<2)continue;
  const movements=[];
  for(const incoming of incident)for(const outgoing of incident){
   if(incoming.id===outgoing.id)continue;
   for(const fromDirection of ["forward","reverse"])for(const toDirection of ["forward","reverse"]){
    const exit=fromDirection==="forward"?incoming.toNodeId:incoming.fromNodeId,entry=toDirection==="forward"?outgoing.fromNodeId:outgoing.toNodeId;
    if(exit!==graphId||entry!==graphId)continue;
    if(!incoming.lanes.some(l=>l.direction===fromDirection)||!outgoing.lanes.some(l=>l.direction===toDirection))continue;
    const key=[graphId,incoming.id,fromDirection,outgoing.id,toDirection].join("|");if(restrictions.blocked.has(key))continue;
    const only=restrictions.only.get([graphId,incoming.id,fromDirection].join("|"));if(only&&!only.has([outgoing.id,toDirection].join("|")))continue;
    movements.push({fromEdgeId:incoming.id,fromDirection,toEdgeId:outgoing.id,toDirection,status:"unknown",statusReason:"turn legality requires complete restriction and field review"});
   }
  }
  junctions.push({nodeId:graphId,sourceNodeId:nodeId,movementStatus:"review_required",movements});
 }
 const landmarks=elements.filter(e=>["node","way"].includes(e.type)&&e.tags&&["amenity","shop","tourism","historic","leisure","public_transport","railway","place"].some(k=>e.tags[k])).map(e=>{
  let position=null;if(e.type==="node"&&nodes.has(str(e.id)))position=nodePosition(nodes.get(str(e.id)),originProjected);
  else if(e.type==="way"){const pts=(e.nodes??[]).map(id=>nodes.get(str(id))).filter(Boolean);if(pts.length){const sum=pts.reduce((a,n)=>{const p=nodePosition(n,originProjected);a.x+=p.x;a.z+=p.z;return a;},{x:0,z:0});position={x:sum.x/pts.length,y:0,z:sum.z/pts.length};}}
  return {id:"osm-"+e.type+"-"+str(e.id),name:e.tags.name??e.tags.amenity??e.tags.shop??e.tags.tourism??"Mapped feature",position,source:{type:e.type,id:str(e.id),tags:e.tags},confidence:"osm_tagged_not_field_verified"};
 });
 const network={id:areaId+"-osm-road-graph",schemaVersion:1,areaId,crs:"EPSG:32630",units:{distance:"metres",worldUnit:"metre"},worldAxes:{x:"east",y:"elevation",z:"south"},origin:{...originProjected,longitude:config.origin[0],latitude:config.origin[1]},nodes:[...graphNodes.values()],edges,junctions,source:{dataset:"OpenStreetMap",attribution:"© OpenStreetMap contributors",license:"ODbL-1.0",retrievedAt:timestamp}};
 const coverageTiles=config.tiles??[{south:config.south,west:config.west,north:config.north,east:config.east}];
 const manifest={areaId,schemaVersion:1,source:{dataset:"OpenStreetMap",api:"Overpass API",attribution:"© OpenStreetMap contributors",license:"ODbL-1.0",retrievedAt:timestamp},crs:"EPSG:32630",worldUnits:"1 Three.js unit = 1 metre",origin:{...originProjected,latitude:config.origin[1],longitude:config.origin[0]},coverage:{status:"partial",completeAreaCoverage:false,footprint:config.footprint??null,tiles:coverageTiles.map(bounds=>({bounds,status:"retrieved"})),warning:"The project-defined playable rectangle is an extraction window, not an official administrative boundary. Boundary gateways, access, directions and junction legality still require review."},quality:{geometry:"OSM way-node geometry",fieldVerified:false,elevation:"not mapped",physicalLaneWidths:"unknown unless explicitly tagged",direction:"untagged directionality remains unknown",crossWayJunctionMovements:"unknown pending restriction and field review",turnRestrictionRelations:{imported:restrictions.relations.length,applied:restrictions.relations.length-restrictions.unresolved.length,unresolved:restrictions.unresolved.length},routeReady:false,productionReady:false},counts:{osmMotorRoadWays:ways.length,excludedWays:excludedWays.length,graphNodes:network.nodes.length,graphEdges:edges.length,junctions:junctions.length,namedRoads:new Set(ways.map(w=>w.tags.name).filter(Boolean)).size,turnRestrictionRelations:restrictions.relations.length,unresolvedTurnRestrictions:restrictions.unresolved.length},warnings:[...restrictions.unresolved.map(id=>"Unresolved restriction relation/"+id),"Area coverage is partial; do not enable gameplay routing."]};
 const turnRestrictions=elements.filter(e=>e.type==="relation"&&e.tags?.type==="restriction").map(rel=>({id:str(rel.id),version:rel.version??null,tags:rel.tags,members:rel.members??[],applicationStatus:restrictions.unresolved.includes(str(rel.id))?"unresolved_review_required":"applied_to_node_based_movements"}));
 const sourceIndex={areaId,ways:sourceWays,excludedWays,turnRestrictions};
 return {manifest,network,landmarks:{areaId,status:"osm_extracted_review_required",landmarks},routes:{areaId,networkId:network.id,routes:[]},sourceIndex};
}
async function run(areaId){
 const config=AREAS[areaId];if(!config)throw new Error("Unknown area: "+areaId);
 const merged=new Map();let timestamp=null;
 for(const tile of config.tiles){
  const bbox=[tile.south,tile.west,tile.north,tile.east].join(",");
  const query='[out:json][timeout:60];(way["highway"]('+bbox+');relation["type"="restriction"]('+bbox+'););(._;>;);out body;';
  console.log("Fetching OSM "+areaId+" tile "+bbox);
  const data=await fetchOverpass(query);timestamp=data.osm3s?.timestamp_osm_base??timestamp??new Date().toISOString();
  for(const element of data.elements){const key=element.type+"/"+element.id,previous=merged.get(key);if(!previous||(element.version??0)>(previous.version??0))merged.set(key,element);}
 }
 const built=buildArea(areaId,config,[...merged.values()],timestamp??new Date().toISOString()),dir=resolve(ROOT,"data","roads",areaId);
 await mkdir(dir,{recursive:true});
 for(const [name,value] of Object.entries(built))await writeFile(resolve(dir,name==="sourceIndex"?"source-index.json":name+".json"),JSON.stringify(value,null,2)+"\n");
 console.log("Wrote "+areaId+": "+built.manifest.counts.graphEdges+" segments, "+built.manifest.counts.graphNodes+" nodes, "+built.manifest.counts.junctions+" junction candidates.");
}
export {project,length,boolOneWay,laneRecords,buildArea,isMotorRoad};
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const requested=process.argv[2]??"all";for(const area of requested==="all"?Object.keys(AREAS):[requested])await run(area);}
