/**
 * Shared graph data model for the minimap and player road matching.
 * This module contains no renderer/UI dependency; map coordinates are a
 * presentation transform over the exact world graph centrelines.
 */
const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

function projectToSegment(point, a, b) {
  const dx=b.x-a.x, dz=b.z-a.z, denom=dx*dx+dz*dz;
  const t=denom ? Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/denom)) : 0;
  const projected={x:a.x+dx*t,y:a.y+(b.y-a.y)*t,z:a.z+dz*t};
  return {t,position:projected,distanceM:Math.hypot(point.x-projected.x,point.y-projected.y,point.z-projected.z),segmentLengthM:Math.hypot(dx,b.y-a.y,dz)};
}

/** Snap a world-space player position to the nearest explicitly allowed lane. */
export function matchPlayerToRoad(network, position, { maxDistanceM=35 } = {}) {
  if (!validPoint(position)) throw new TypeError("finite world position is required");
  let best=null;
  for (const edge of network.edges ?? []) {
    let along=0, edgeBest=null;
    for (let i=1;i<(edge.centerline??[]).length;i++) {
      const projected=projectToSegment(position,edge.centerline[i-1],edge.centerline[i]);
      const candidate={...projected,distanceAlongEdgeM:along+projected.t*projected.segmentLengthM};
      if (!edgeBest || candidate.distanceM<edgeBest.distanceM) edgeBest=candidate;
      along+=projected.segmentLengthM;
    }
    if (!edgeBest) continue;
    for (const lane of edge.lanes ?? []) {
      if (lane.status!=="allowed") continue;
      const candidate={edgeId:edge.id,laneId:lane.id,direction:lane.direction,
        distanceAlongEdgeM:lane.direction==="forward"?edgeBest.distanceAlongEdgeM:Math.max(0,edge.lengthM-edgeBest.distanceAlongEdgeM),
        lateralDistanceM:edgeBest.distanceM,snappedPosition:edgeBest.position};
      if (!best || candidate.lateralDistanceM<best.lateralDistanceM) best=candidate;
    }
  }
  if (!best || best.lateralDistanceM>maxDistanceM) return {matched:false,reason:"no_nearby_verified_lane"};
  return {matched:true,...best};
}

export function buildRoadMapModel(network, route=null, playerPosition=null) {
  const edges=network.edges ?? [], nodes=network.nodes ?? [];
  if (!edges.length) return {networkId:network.id,bounds:null,segments:[],route:[],player:null};
  const xs=[],zs=[];
  const segments=edges.map(edge=>{
    const points=(edge.centerline ?? []).map(p=>({x:p.x,z:p.z}));
    for(const p of points){xs.push(p.x);zs.push(p.z);}
    return {edgeId:edge.id,name:edge.name??null,roadClass:edge.roadClass??null,points};
  });
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const bounds={minX,maxX,minZ,maxZ,widthM:Math.max(1,maxX-minX),heightM:Math.max(1,maxZ-minZ)};
  const toMap=p=>({x:(p.x-minX)/bounds.widthM,y:(p.z-minZ)/bounds.heightM});
  return {
    networkId:network.id,bounds,segments:segments.map(s=>({...s,mapPoints:s.points.map(toMap)})),
    route:(route?.steps ?? []).map((step,index)=>({index,edgeId:step.edgeId,direction:step.direction})),
    player:playerPosition?(()=>{const match=matchPlayerToRoad(network,playerPosition);return match.matched?{...match,mapPosition:toMap(match.snappedPosition)}:match;})():null,
    nodeCount:nodes.length,edgeCount:edges.length
  };
}
