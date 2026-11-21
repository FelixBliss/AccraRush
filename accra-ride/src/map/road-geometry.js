/**
 * Geometric road ribbons with bounded miter joins and node-apron closure.
 * Input centreline points are authoritative; no resampling is performed here.
 */
const EPS = 1e-8;

function unit(x, z) {
  const length = Math.hypot(x, z);
  return length > EPS ? { x: x / length, z: z / length } : null;
}

function leftNormal(a, b) {
  const d = unit(b.x - a.x, b.z - a.z);
  return d ? { x: -d.z, z: d.x } : null;
}

function cross(a, b) { return a.x * b.z - a.z * b.x; }

/** Returns left/right boundary points at every centreline vertex. */
export function buildRoadRibbon(points, widthM, options = {}) {
  if (!Array.isArray(points) || points.length < 2) throw new Error("A road needs at least two centreline points");
  if (!(Number.isFinite(widthM) && widthM > 0)) throw new Error("Road width must be positive");
  const half = widthM / 2;
  const miterLimit = Math.max(1, options.miterLimit ?? 2.5);
  const clean = [];
  for (const p of points) {
    if (![p?.x, p?.y, p?.z].every(Number.isFinite)) throw new Error("Road centreline contains a non-finite point");
    if (!clean.length || Math.hypot(p.x-clean.at(-1).x,p.z-clean.at(-1).z)>EPS) clean.push(p);
  }
  if (clean.length < 2) throw new Error("Road centreline has no horizontal length");
  const left = [], right = [], bevels = [];
  for (let i=0;i<clean.length;i++) {
    const prev = i>0 ? leftNormal(clean[i-1],clean[i]) : null;
    const next = i<clean.length-1 ? leftNormal(clean[i],clean[i+1]) : null;
    let n = prev && next ? unit(prev.x+next.x,prev.z+next.z) : (prev || next);
    if (!n) n = {x:0,z:1};
    const denom = prev && next ? Math.max(EPS,Math.abs(n.x*next.x+n.z*next.z)) : 1;
    const miterLength = half/denom;
    const useBevel = !!(prev && next && miterLength > half*miterLimit);
    const scale = useBevel ? half : Math.min(miterLength,half*miterLimit);
    const p=clean[i];
    left.push({x:p.x+n.x*scale,y:p.y,z:p.z+n.z*scale});
    right.push({x:p.x-n.x*scale,y:p.y,z:p.z-n.z*scale});
    if(useBevel) bevels.push({index:i, leftIn:{x:p.x+prev.x*half,y:p.y,z:p.z+prev.z*half},leftOut:{x:p.x+next.x*half,y:p.y,z:p.z+next.z*half},rightIn:{x:p.x-prev.x*half,y:p.y,z:p.z-prev.z*half},rightOut:{x:p.x-next.x*half,y:p.y,z:p.z-next.z*half}});
  }
  return {points:clean,left,right,bevels,widthM};
}

/**
 * Creates a flat junction closure polygon from the road-edge cross sections
 * meeting at a shared graph node. Boundary points are angle-sorted and deduped.
 */
export function buildJunctionPatch(node, incidentRibbons) {
  if (!node || ![node.x,node.y,node.z].every(Number.isFinite)) throw new Error("A finite junction node is required");
  const boundary=[];
  for(const item of incidentRibbons??[]) {
    const ribbon=item.ribbon??item;
    const atStart=item.atStart??false;
    const i=atStart?0:ribbon.points.length-1;
    for(const p of [ribbon.left[i],ribbon.right[i]]) {
      if(Math.hypot(p.x-node.x,p.z-node.z)>EPS) boundary.push(p);
    }
  }
  const unique=[];
  for(const p of boundary) if(!unique.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<1e-5)) unique.push(p);
  unique.sort((a,b)=>Math.atan2(a.z-node.z,a.x-node.x)-Math.atan2(b.z-node.z,b.x-node.x));
  if(unique.length<3) return null;
  return {center:{x:node.x,y:node.y,z:node.z},boundary:unique};
}

export function appendRibbonTriangles(target, ribbon, yOffset=0.025) {
  const base=target.vertices.length/3;
  for(let i=0;i<ribbon.points.length;i++) {
    const l=ribbon.left[i],r=ribbon.right[i];
    target.vertices.push(l.x,l.y+yOffset,l.z,r.x,r.y+yOffset,r.z);
    if(i>0){const n=base+i*2;target.indices.push(n-2,n,n-1,n-1,n,n+1);}
  }
}

export function appendJunctionTriangles(target, patch, yOffset=0.026) {
  if(!patch) return;
  const base=target.vertices.length/3,c=patch.center;
  target.vertices.push(c.x,c.y+yOffset,c.z);
  for(const p of patch.boundary) target.vertices.push(p.x,p.y+yOffset,p.z);
  for(let i=0;i<patch.boundary.length;i++) {
    const a=base+1+i,b=base+1+((i+1)%patch.boundary.length);
    target.indices.push(base,a,b);
  }
}
