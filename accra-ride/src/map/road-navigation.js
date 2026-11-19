/** Directed road graph helpers shared by player route guidance and AI traffic. */
export function buildNavigationIndex(network) {
 if(!Array.isArray(network?.nodes)||!Array.isArray(network?.edges)) throw new Error("A road network with nodes and edges is required");
 const nodes=new Map(network.nodes.map(n=>[n.id,n]));
 const outgoing=new Map(network.nodes.map(n=>[n.id,[]]));
 for(const edge of network.edges) {
  for(const lane of edge.lanes??[]) {
   const from=lane.direction==="forward"?edge.fromNodeId:edge.toNodeId;
   const to=lane.direction==="forward"?edge.toNodeId:edge.fromNodeId;
   if(nodes.has(from)&&nodes.has(to)) outgoing.get(from).push({edge,lane,from,to,cost:edge.lengthM});
  }
 }
 return {networkId:network.id,nodes,outgoing};
}
export function findRoadRoute(index,startNodeId,destinationNodeId) {
 if(!index?.nodes?.has(startNodeId)||!index.nodes.has(destinationNodeId)) return null;
 const distances=new Map([[startNodeId,0]]),previous=new Map(),unvisited=new Set(index.nodes.keys());
 while(unvisited.size) {
  let current=null,best=Infinity;
  for(const id of unvisited){const d=distances.get(id)??Infinity;if(d<best){best=d;current=id;}}
  if(current===null||best===Infinity) break;
  if(current===destinationNodeId) break;
  unvisited.delete(current);
  for(const arc of index.outgoing.get(current)??[]) {
   const alt=best+arc.cost;
   if(alt<(distances.get(arc.to)??Infinity)){distances.set(arc.to,alt);previous.set(arc.to,{from:current,arc});}
  }
 }
 if(!distances.has(destinationNodeId)) return null;
 const steps=[];let cursor=destinationNodeId;
 while(cursor!==startNodeId){const item=previous.get(cursor);if(!item)return null;steps.push({edgeId:item.arc.edge.id,laneId:item.arc.lane.id,direction:item.arc.lane.direction});cursor=item.from;}
 steps.reverse();
 return {id:`route-${startNodeId}-${destinationNodeId}`,networkId:index.networkId,startNodeId,destinationNodeId,distanceM:distances.get(destinationNodeId),steps};
}
export function sampleEdgeCenterline(edge,distanceM) {
 const points=edge.centerline??[];if(points.length<2)return null;
 const lengths=[];let total=0;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);lengths.push(len);total+=len;}
 let remaining=Math.max(0,Math.min(total,distanceM));
 for(let i=0;i<lengths.length;i++){const len=lengths[i];if(remaining<=len||i===lengths.length-1){const t=len?remaining/len:0,a=points[i],b=points[i+1];return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,headingRad:Math.atan2(b.x-a.x,b.z-a.z)};}remaining-=len;}
 return null;
}
