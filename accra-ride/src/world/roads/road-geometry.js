/**
 * Pure road surface geometry builders. Coordinates are Three.js world metres.
 * Width is a render parameter; it must not be mistaken for surveyed lane width.
 */
const finite=n=>typeof n==="number"&&Number.isFinite(n);
const validPoint=p=>p&&["x","y","z"].every(k=>finite(p[k]));
const unit=(x,z)=>{const l=Math.hypot(x,z);return l>1e-8?{x:x/l,z:z/l}:{x:0,z:1};};
const dot=(a,b)=>a.x*b.x+a.z*b.z;
const normal=t=>({x:-t.z,z:t.x});

function miterAt(points,index,halfWidth){
 const prev=points[Math.max(0,index-1)],curr=points[index],next=points[Math.min(points.length-1,index+1)];
 const incoming=unit(curr.x-prev.x,curr.z-prev.z),outgoing=unit(next.x-curr.x,next.z-curr.z);
 if(index===0){const n=normal(outgoing);return {x:n.x*halfWidth,z:n.z*halfWidth};}
 if(index===points.length-1){const n=normal(incoming);return {x:n.x*halfWidth,z:n.z*halfWidth};}
 const n1=normal(incoming),n2=normal(outgoing),sum=unit(n1.x+n2.x,n1.z+n2.z);
 const denominator=dot(sum,n2);
 if(Math.abs(denominator)<.25)return {x:n2.x*halfWidth,z:n2.z*halfWidth};
 const magnitude=Math.min(halfWidth/Math.abs(denominator),halfWidth*4);
 return {x:sum.x*magnitude,z:sum.z*magnitude};
}

export function buildRoadRibbonData(points,widthM,{surfaceOffsetM=.04}={}) {
 if(!Array.isArray(points)||points.length<2||!points.every(validPoint))throw new TypeError("road centreline requires at least two finite points");
 if(!finite(widthM)||widthM<=0)throw new RangeError("road render width must be positive metres");
 const half=widthM/2,positions=[],uvs=[],indices=[];let distance=0;
 for(let i=0;i<points.length;i++){
  const p=points[i],offset=miterAt(points,i,half);
  if(i>0){const a=points[i-1],b=p;distance+=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);}
  positions.push(p.x+offset.x,p.y+surfaceOffsetM,p.z+offset.z,p.x-offset.x,p.y+surfaceOffsetM,p.z-offset.z);
  uvs.push(0,distance,1,distance);
  if(i<points.length-1){const v=i*2;indices.push(v,v+2,v+1,v+1,v+2,v+3);}
 }
 return {positions,uvs,indices,widthM,vertexCount:points.length*2};
}

export function resolveRoadRenderWidth(edge,overrides={}) {
 const explicit=edge?.renderWidthM??edge?.roadWidthM;
 if(finite(explicit)&&explicit>0)return {widthM:explicit,source:"area-render-width"};
 const taggedWidths=(edge?.lanes??[]).map(l=>l?.widthM).filter(w=>finite(w)&&w>0);
 if(taggedWidths.length===(edge?.lanes?.length??-1)&&taggedWidths.length)return {widthM:taggedWidths.reduce((a,b)=>a+b,0),source:"osm-lane-width-tags"};
 const defaults={motorway:14,trunk:12,primary:10,secondary:9,tertiary:8,unclassified:7,residential:6,living_street:5,service:4.5,track:4,...overrides};
 return {widthM:defaults[edge?.roadClass]??6,source:"gameplay-render-default"};
}

export function buildJunctionPatchData(network,junction,widthResolver=resolveRoadRenderWidth) {
 const node=network?.nodes?.find(n=>n.id===junction?.nodeId);
 if(!node||!validPoint(node.position))return null;
 const boundary=[];
 for(const edge of network.edges??[]){
  let endpoint,inside;
  if(edge.fromNodeId===node.id){endpoint=edge.centerline?.[0];inside=edge.centerline?.[1];}
  else if(edge.toNodeId===node.id){endpoint=edge.centerline?.at(-1);inside=edge.centerline?.at(-2);}
  else continue;
  if(!validPoint(endpoint)||!validPoint(inside))continue;
  const outward=unit(inside.x-endpoint.x,inside.z-endpoint.z),n=normal(outward),{widthM}=widthResolver(edge);
  boundary.push({x:endpoint.x+n.x*widthM/2,y:endpoint.y+.045,z:endpoint.z+n.z*widthM/2});
  boundary.push({x:endpoint.x-n.x*widthM/2,y:endpoint.y+.045,z:endpoint.z-n.z*widthM/2});
 }
 if(boundary.length<6)return null;
 boundary.sort((a,b)=>Math.atan2(a.z-node.position.z,a.x-node.position.x)-Math.atan2(b.z-node.position.z,b.x-node.position.x));
 const positions=[node.position.x,node.position.y+.045,node.position.z],uvs=[.5,.5],indices=[];
 let radius=1;
 for(const p of boundary)radius=Math.max(radius,Math.hypot(p.x-node.position.x,p.z-node.position.z));
 for(const p of boundary){positions.push(p.x,p.y,p.z);uvs.push(.5+(p.x-node.position.x)/(2*radius),.5+(p.z-node.position.z)/(2*radius));}
 for(let i=0;i<boundary.length;i++){const a=i+1,b=(i+1)%boundary.length+1;indices.push(0,b,a);}
 return {positions,uvs,indices,vertexCount:boundary.length+1};
}
