/**
 * Phase 4 road graph primitives.
 * Canonical units: metres; X=east, Y=elevation, Z=south.
 * Edge centrelines are ordered from fromNodeId to toNodeId.
 */
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const id = value => typeof value === "string" && value.trim().length > 0;
const finite = value => typeof value === "number" && Number.isFinite(value);
const point = p => record(p) && ["x", "y", "z"].every(k => finite(p[k]));
const movementKey = m => [m.fromEdgeId, m.fromDirection, m.toEdgeId, m.toDirection].join("|");

export function polylineLengthM(points) {
  if (!Array.isArray(points) || points.length < 2 || !points.every(point)) return NaN;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    total += Math.hypot(b.x-a.x, b.y-a.y, b.z-a.z);
  }
  return total;
}

export function localToWorld(projected, origin) {
  if (!point(projected) || !record(origin) || !["eastingM", "northingM", "elevationM"].every(k => finite(origin[k]))) throw new TypeError("projected point and metric origin are required");
  return { x: projected.x-origin.eastingM, y: projected.y-origin.elevationM, z: -(projected.z-origin.northingM) };
}

/** WGS84 longitude/latitude to UTM zone 30N (metres), suitable for Accra. */
export function lonLatToUtm30(lon, lat) {
  if (!finite(lon) || !finite(lat) || lon < -6 || lon > 0 || lat < 0 || lat > 84) throw new RangeError("coordinates must be valid WGS84 positions within UTM zone 30N");
  const a=6378137, ecc2=0.00669437999014, k0=0.9996, ep2=ecc2/(1-ecc2);
  const phi=lat*Math.PI/180, lambda=lon*Math.PI/180, lambda0=-3*Math.PI/180;
  const N=a/Math.sqrt(1-ecc2*Math.sin(phi)**2), T=Math.tan(phi)**2, C=ep2*Math.cos(phi)**2, A=Math.cos(phi)*(lambda-lambda0);
  const M=a*((1-ecc2/4-3*ecc2**2/64-5*ecc2**3/256)*phi-(3*ecc2/8+3*ecc2**2/32+45*ecc2**3/1024)*Math.sin(2*phi)+(15*ecc2**2/256+45*ecc2**3/1024)*Math.sin(4*phi)-(35*ecc2**3/3072)*Math.sin(6*phi));
  return {
    eastingM:k0*N*(A+(1-T+C)*A**3/6+(5-18*T+T**2+72*C-58*ep2)*A**5/120)+500000,
    northingM:k0*(M+N*Math.tan(phi)*(A**2/2+(5-T+9*C+4*C**2)*A**4/24+(61-58*T+T**2+600*C-330*ep2)*A**6/720))
  };
}

export function validateRoadTopology(network) {
  const errors=[];
  if (!record(network)) return ["network must be an object"];
  if (!Array.isArray(network.nodes)||!Array.isArray(network.edges)) return ["network.nodes and network.edges must be arrays"];
  const nodes=new Map(), edges=new Map();
  for (const n of network.nodes) {
    if (!record(n)||!id(n.id)||nodes.has(n.id)||!point(n.position)) errors.push("nodes require unique ids and finite positions");
    else nodes.set(n.id,n);
  }
  for (const e of network.edges) {
    if (!record(e)||!id(e.id)||edges.has(e.id)) { errors.push("edges require unique ids"); continue; }
    edges.set(e.id,e);
    if (!nodes.has(e.fromNodeId)||!nodes.has(e.toNodeId)||e.fromNodeId===e.toNodeId) errors.push(`edge "${e.id}" has invalid endpoints`);
    if (!Array.isArray(e.centerline)||e.centerline.length<2||!e.centerline.every(point)) errors.push(`edge "${e.id}" has invalid centreline`);
    if (!finite(e.lengthM)||e.lengthM<=0) errors.push(`edge "${e.id}" has invalid lengthM`);
    if (Array.isArray(e.centerline)&&e.centerline.every(point)&&finite(e.lengthM)&&Math.abs(polylineLengthM(e.centerline)-e.lengthM)>Math.max(3,e.lengthM*.08)) errors.push(`edge "${e.id}" lengthM differs materially from its centreline`);
    if (!Array.isArray(e.lanes)||!e.lanes.length) errors.push(`edge "${e.id}" needs lanes`);
  }
  const junctions=new Map();
  for (const j of network.junctions??[]) {
    if (!record(j)||!id(j.nodeId)||junctions.has(j.nodeId)||!nodes.has(j.nodeId)) { errors.push("junctions require unique existing nodeId values"); continue; }
    junctions.set(j.nodeId,j);
    if (!Array.isArray(j.movements)) errors.push(`junction "${j.nodeId}" movements must be an array`);
    const seen=new Set();
    for (const m of j.movements??[]) {
      if (!record(m)||!edges.has(m.fromEdgeId)||!edges.has(m.toEdgeId)||!["forward","reverse"].includes(m.fromDirection)||!["forward","reverse"].includes(m.toDirection)) { errors.push(`junction "${j.nodeId}" contains an invalid movement`); continue; }
      const incoming=edges.get(m.fromEdgeId), outgoing=edges.get(m.toEdgeId);
      const incomingNode=m.fromDirection==="forward"?incoming.toNodeId:incoming.fromNodeId;
      const outgoingNode=m.toDirection==="forward"?outgoing.fromNodeId:outgoing.toNodeId;
      if (incomingNode!==j.nodeId||outgoingNode!==j.nodeId) errors.push(`junction "${j.nodeId}" movement endpoints do not meet at the junction`);
      const key=movementKey(m); if(seen.has(key)) errors.push(`junction "${j.nodeId}" duplicates a legal movement`); seen.add(key);
    }
  }
  const incidence=new Map();
  for (const e of edges.values()) for (const nodeId of [e.fromNodeId,e.toNodeId]) incidence.set(nodeId,(incidence.get(nodeId)??0)+1);
  for (const [nodeId,count] of incidence) if(count>1&&!junctions.has(nodeId)) errors.push(`shared node "${nodeId}" needs an explicit junction movement table`);
  return errors;
}

export function validateDirectedRoute(route, network) {
  const errors=validateRoadTopology(network);
  if (!record(route)||!id(route.id)||route.networkId!==network?.id||!Array.isArray(route.steps)||!route.steps.length) return [...errors,"route requires id, matching networkId and non-empty steps"];
  const edges=new Map((network.edges??[]).map(e=>[e.id,e]));
  let current=route.startNodeId;
  for(let i=0;i<route.steps.length;i++) {
    const step=route.steps[i], edge=edges.get(step?.edgeId);
    if(!edge||!["forward","reverse"].includes(step?.direction)){errors.push(`route step ${i} is invalid`);continue;}
    const entry=step.direction==="forward"?edge.fromNodeId:edge.toNodeId;
    const exit=step.direction==="forward"?edge.toNodeId:edge.fromNodeId;
    if(entry!==current) errors.push(`route step ${i} is disconnected`);
    const lane=edge.lanes?.find(l=>l.id===step.laneId);
    if(!lane||lane.direction!==step.direction) errors.push(`route step ${i} uses an unavailable lane direction`);
    if(i>0&&entry===current) {
      const previous=route.steps[i-1], junction=(network.junctions??[]).find(j=>j.nodeId===current);
      const allowed=junction?.movements?.some(m=>m.fromEdgeId===previous.edgeId&&m.fromDirection===previous.direction&&m.toEdgeId===step.edgeId&&m.toDirection===step.direction);
      if(!allowed) errors.push(`route step ${i} makes an unlisted or illegal junction movement at "${current}"`);
    }
    current=exit;
  }
  if(current!==route.destinationNodeId) errors.push("route does not terminate at destinationNodeId");
  return errors;
}

export function samplePolylineAtDistance(points,distanceM) {
  const total=polylineLengthM(points);
  if(!finite(total)||!finite(distanceM)) throw new TypeError("valid polyline and distance are required");
  const target=Math.max(0,Math.min(total,distanceM)); let traversed=0;
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],segment=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
    if(traversed+segment>=target||i===points.length-1) {
      const t=segment?(target-traversed)/segment:0;
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
    }
    traversed+=segment;
  }
  return {...points[points.length-1]};
}
