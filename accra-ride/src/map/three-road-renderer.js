/**
 * Batched OSM road renderer with stable mitered joins and lane markings.
 * Major roads are four lanes (2+2); branch roads are two lanes (1+1).
 */
const CLASS_WIDTH = {
  motorway: 14, motorway_link: 7, trunk: 14, trunk_link: 7,
  primary: 14, primary_link: 7, secondary: 14, secondary_link: 7,
  tertiary: 7, tertiary_link: 7, unclassified: 7,
  residential: 7, living_street: 7, service: 7
};
const CLASS_COLORS = {
  motorway: 0x55585a, motorway_link: 0x50565a, trunk: 0x50565a, trunk_link: 0x50565a,
  primary: 0x4a5054, primary_link: 0x4a5054, secondary: 0x454b4f, secondary_link: 0x454b4f,
  tertiary: 0x3e4549, tertiary_link: 0x3e4549, residential: 0x363d41,
  unclassified: 0x363d41, living_street: 0x42484b, service: 0x4a4f52
};
const roadWidth = edge => {
  const laneWidth = Array.isArray(edge.lanes)
    ? edge.lanes.reduce((sum, lane) => sum + (Number.isFinite(lane.widthM) ? lane.widthM : 0), 0)
    : 0;
  return Math.max(CLASS_WIDTH[edge.osm?.highway] ?? 7, laneWidth);
};
const roadClass = edge => Object.hasOwn(CLASS_WIDTH, edge.osm?.highway) ? edge.osm.highway : "residential";
const materialFor = (THREE, color) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
const unitNormal = (a, b) => {
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
  return {x:-dz/len,z:dx/len};
};
function miterOffset(points,index,halfWidth) {
  const previous=points[Math.max(0,index-1)],current=points[index],next=points[Math.min(points.length-1,index+1)];
  if(index===0||index===points.length-1){
    const n=unitNormal(index===0?current:previous,index===0?next:current);
    return {x:n.x*halfWidth,z:n.z*halfWidth};
  }
  const before=unitNormal(previous,current),after=unitNormal(current,next);
  let mx=before.x+after.x,mz=before.z+after.z;
  const length=Math.hypot(mx,mz);
  if(length<1e-5)return {x:after.x*halfWidth,z:after.z*halfWidth};
  mx/=length;mz/=length;
  const denominator=Math.abs(mx*after.x+mz*after.z);
  const scale=Math.min(halfWidth/Math.max(.35,denominator),halfWidth*2.5);
  return {x:mx*scale,z:mz*scale};
}
export function createRoadMeshes(THREE,network,options={}) {
  if(!THREE?.BufferGeometry||!THREE?.Mesh||!Array.isArray(network?.edges))
    throw new Error("Three.js and a valid road network are required");
  const group=new THREE.Group(),batches=new Map(),markingVertices=[];
  let renderedEdges=0;
  for(const edge of network.edges){
    const points=edge.centerline;
    if(!Array.isArray(points)||points.length<2)continue;
    const type=roadClass(edge);
    if(!batches.has(type))batches.set(type,{vertices:[],indices:[]});
    const batch=batches.get(type),half=roadWidth(edge)/2,base=batch.vertices.length/3;
    for(let i=0;i<points.length;i++){
      const offset=miterOffset(points,i,half),p=points[i];
      batch.vertices.push(p.x+offset.x,p.y+.035,p.z+offset.z);
      batch.vertices.push(p.x-offset.x,p.y+.035,p.z-offset.z);
      if(i>0){
        const n=base+i*2;
        batch.indices.push(n-2,n,n-1,n-1,n,n+1);
      }
    }
    const lanes=edge.lanes??[];
    const forward=lanes.filter(l=>l.direction==="forward").length;
    const reverse=lanes.filter(l=>l.direction==="reverse").length;
    const laneWidth=lanes.reduce((sum,l)=>sum+(Number.isFinite(l.widthM)?l.widthM:0),0)/(lanes.length||1);
    const total=forward+reverse;
    const boundaries=[];
    if(forward&&reverse)boundaries.push(0);
    for(let i=1;i<total;i++)boundaries.push(-half+i*laneWidth);
    for(const offset of [...new Set(boundaries)]){
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],na=miterOffset(points,i-1,Math.abs(offset)),nb=miterOffset(points,i,Math.abs(offset));
        const sign=offset<0?-1:1;
        const ax=a.x+na.x*sign,az=a.z+na.z*sign,bx=b.x+nb.x*sign,bz=b.z+nb.z*sign;
        markingVertices.push(ax,a.y+.052,az,bx,b.y+.052,bz);
      }
    }
    renderedEdges++;
  }
  for(const [type,batch] of batches){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(batch.vertices,3));
    geometry.setIndex(batch.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere?.();
    const material=options.roadMaterial??materialFor(THREE,CLASS_COLORS[type]??0x363d41);
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name="osm-roads:"+type;mesh.userData={highwayClass:type};group.add(mesh);
  }
  if(markingVertices.length){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(markingVertices,3));
    geometry.computeBoundingSphere?.();
    const material=options.markingMaterial??new THREE.LineBasicMaterial({color:0xd8cfa8,transparent:true,opacity:.72});
    const markings=new THREE.LineSegments(geometry,material);
    markings.name="osm-road-lane-markings";group.add(markings);
  }
  group.userData={roadMeshCount:batches.size,edgeCount:renderedEdges,networkId:network.id,batched:true};
  return group;
}
