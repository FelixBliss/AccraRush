/**
 * Batched road renderer for the selected-road graph.
 *
 * Surfaces come from the RD-03 foundations / RD-04 indexed surface data (fold-free,
 * UV-mapped). Junction nodes get a fan patch built from the real boundary endpoints
 * of the edges that share the node, so connections only exist where OSM shares a
 * node: a bridge or tunnel that merely crosses another road is never joined to it.
 * Markings (lane dividers, centre and edge lines, stop lines, direction arrows)
 * follow the foundation lane geometry. Road elevation remains at imported y because
 * OSM supplies no surveyed heights; only measured median gaps receive a low visual curb.
 */
import { buildRoadFoundation } from "./road-foundations.js";
import { buildRoadSurfaceData } from "./road-surface-geometry.js";

const CLASS_COLORS = {
  motorway: 0x55585a, motorway_link: 0x50565a, trunk: 0x50565a, trunk_link: 0x50565a,
  primary: 0x4a5054, primary_link: 0x4a5054, secondary: 0x454b4f, secondary_link: 0x454b4f,
  tertiary: 0x3e4549, tertiary_link: 0x3e4549, residential: 0x363d41,
  unclassified: 0x363d41, living_street: 0x42484b, service: 0x4a4f52
};
const roadClass = edge => Object.hasOwn(CLASS_COLORS, edge.osm?.highway) ? edge.osm.highway : "residential";

const SURFACE_Y = 0.035, JUNCTION_Y = 0.03, MARK_Y = 0.065;
const LINE_W = 0.14, STOP_W = 0.4, END_CLEAR_M = 3, DASH_M = 3, GAP_M = 6;

class Batch {
  constructor() { this.positions = []; this.uvs = []; this.indices = []; }
  get base() { return this.positions.length / 3; }
}

// Add a closed, rotated concrete box to a batched mesh. Bridge decks and
// parapets are kept in one draw call per area rather than spawning many objects.
function addBox(batch, cx, cy, cz, sx, sy, sz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), base = batch.base;
  for (const dy of [-1, 1]) for (const dz of [-1, 1]) for (const dx of [-1, 1]) {
    const lx = dx * sx / 2, lz = dz * sz / 2;
    batch.positions.push(cx + lx * c + lz * s, cy + dy * sy / 2, cz - lx * s + lz * c);
    batch.uvs.push((dx + 1) / 2, (dz + 1) / 2);
  }
  const face = (a, b, d, e) => batch.indices.push(base + a, base + b, base + d, base + a, base + d, base + e);
  // Outward winding: top faces point up, bottom faces down, and parapet sides out.
  face(4, 6, 7, 5); face(0, 1, 3, 2);
  face(0, 4, 5, 1); face(2, 3, 7, 6); face(0, 2, 6, 4); face(1, 5, 7, 3);
}

// Flat ribbon (quad strip) along a polyline, optionally dashed, skipping the ends.
function addRibbon(batch, points, width, { dashed = false, clearM = END_CLEAR_M } = {}) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const total = cum[cum.length - 1];
  if (total < clearM * 2 + 2) return;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    let s0 = Math.max(cum[i - 1], clearM), s1 = Math.min(cum[i], total - clearM);
    if (s1 - s0 < 0.2) continue;
    const len = cum[i] - cum[i - 1];
    if (len < 1e-6) continue;
    const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len, nx = -dz * width / 2, nz = dx * width / 2;
    const emit = (t0, t1) => {
      const p0 = { x: a.x + dx * (t0 - cum[i - 1]), y: a.y, z: a.z + dz * (t0 - cum[i - 1]) };
      const p1 = { x: a.x + dx * (t1 - cum[i - 1]), y: a.y, z: a.z + dz * (t1 - cum[i - 1]) };
      const n = batch.base;
      batch.positions.push(p0.x + nx, p0.y + MARK_Y, p0.z + nz, p0.x - nx, p0.y + MARK_Y, p0.z - nz,
        p1.x + nx, p1.y + MARK_Y, p1.z + nz, p1.x - nx, p1.y + MARK_Y, p1.z - nz);
      batch.uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
      // upward-facing winding (matches the surface builder: normalY > 0)
      batch.indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    };
    if (!dashed) { emit(s0, s1); continue; }
    const period = DASH_M + GAP_M;
    for (let s = Math.floor(s0 / period) * period; s < s1; s += period) {
      const t0 = Math.max(s, s0), t1 = Math.min(s + DASH_M, s1);
      if (t1 - t0 > 0.3) emit(t0, t1);
    }
  }
}

function addRaisedMedian(grassBatch, concreteTopBatch, curbBatch, points, width, height = 0.28) {
  const clean = [];
  for (const point of points) {
    const previous = clean.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.z - previous.z) > 0.25) clean.push(point);
  }
  if (clean.length < 2 || width < 0.8) return;
  const topBatch = width >= 3 ? grassBatch : concreteTopBatch;
  for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1], b = clean[i], dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 1) continue;
    const nx = -dz / length * width / 2, nz = dx / length * width / 2;
    const baseA = a.y + SURFACE_Y - 0.01, baseB = b.y + SURFACE_Y - 0.01;
    const leftA = [a.x + nx, baseA, a.z + nz], rightA = [a.x - nx, baseA, a.z - nz];
    const leftB = [b.x + nx, baseB, b.z + nz], rightB = [b.x - nx, baseB, b.z - nz];
    const topLeftA = [leftA[0], baseA + height, leftA[2]], topRightA = [rightA[0], baseA + height, rightA[2]];
    const topLeftB = [leftB[0], baseB + height, leftB[2]], topRightB = [rightB[0], baseB + height, rightB[2]];

    const topBase = topBatch.base;
    for (const vertex of [topLeftA,topRightA,topLeftB,topRightB]) topBatch.positions.push(...vertex);
    topBatch.uvs.push(0,0,1,0,0,1,1,1);
    topBatch.indices.push(topBase,topBase+2,topBase+1, topBase+1,topBase+2,topBase+3);

    const curbBase = curbBatch.base;
    for (const vertex of [leftA,rightA,leftB,rightB,topLeftA,topRightA,topLeftB,topRightB]) curbBatch.positions.push(...vertex);
    curbBatch.uvs.push(0,0,1,0,0,1,1,1,0,0,1,0,0,1,1,1);
    curbBatch.indices.push(
      curbBase+0,curbBase+4,curbBase+2, curbBase+2,curbBase+4,curbBase+6,
      curbBase+1,curbBase+3,curbBase+5, curbBase+3,curbBase+7,curbBase+5,
      curbBase+0,curbBase+1,curbBase+4, curbBase+1,curbBase+5,curbBase+4,
      curbBase+2,curbBase+6,curbBase+3, curbBase+3,curbBase+6,curbBase+7
    );
  }
}

function addCross(batch, centre, dirX, dirZ, halfLength, width, y) {
  // Ribbon across the lane (perpendicular to travel) for stop lines.
  const nx = -dirZ, nz = dirX, hl = halfLength, hw = width / 2;
  const corners = [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl]].map(([along, across]) => [
    centre.x + dirX * along + nx * across, centre.z + dirZ * along + nz * across]);
  const n = batch.base;
  for (const [x, z] of corners) batch.positions.push(x, y + MARK_Y, z);
  batch.uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
  batch.indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
}

function addArrow(batch, centre, dirX, dirZ, y, laneWidth) {
  const shaft = Math.min(0.2, laneWidth * 0.07), head = Math.min(0.9, laneWidth * 0.28), len = 3.2, headLen = 1.2;
  const nx = -dirZ, nz = dirX;
  const P = (along, across) => [centre.x + dirX * along + nx * across, y + MARK_Y, centre.z + dirZ * along + nz * across];
  const verts = [
    P(-len / 2, -shaft), P(-len / 2, shaft), P(len / 2 - headLen, -shaft), P(len / 2 - headLen, shaft),
    P(len / 2 - headLen, -head), P(len / 2 - headLen, head), P(len / 2, 0)
  ];
  const n = batch.base;
  for (const v of verts) batch.positions.push(...v);
  for (let i = 0; i < verts.length; i++) batch.uvs.push(0, 0);
  batch.indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2, n + 4, n + 5, n + 6);
}

function addSpeedLimitMarking(batch, point, dx, dz, speed) {
  const yaw=Math.atan2(dx,dz),c=Math.cos(yaw),s=Math.sin(yaw),y=point.y+MARK_Y+0.006;
  const digits=String(speed).slice(0,2),segments={
    0:["a","b","c","d","e","f"],1:["b","c"],2:["a","b","g","e","d"],
    3:["a","b","g","c","d"],4:["f","g","b","c"],5:["a","f","g","c","d"],
    6:["a","f","g","e","c","d"],7:["a","b","c"],8:["a","b","c","d","e","f","g"],
    9:["a","b","c","d","f","g"]
  };
  const strokes={
    a:[0,-0.48,0.42,0.09],g:[0,0,0.42,0.09],d:[0,0.48,0.42,0.09],
    f:[-0.21,-0.24,0.09,0.42],b:[0.21,-0.24,0.09,0.42],
    e:[-0.21,0.24,0.09,0.42],c:[0.21,0.24,0.09,0.42]
  };
  const addStroke=(cx,along,width,length)=>{
    const horizontal=width>length;
    const endpoints=horizontal
      ? [[cx-width/2,along],[cx+width/2,along]]
      : [[cx,along-length/2],[cx,along+length/2]];
    const half= (horizontal?length:width)/2;
    const convert=(lx,lz)=>({x:point.x+lx*c+lz*s,z:point.z-lx*s+lz*c});
    const a=convert(...endpoints[0]),b=convert(...endpoints[1]);
    const ox=horizontal?-s*half:c*half,oz=horizontal?c*half:-s*half,n=batch.base;
    batch.positions.push(a.x+ox,y,a.z+oz,a.x-ox,y,a.z-oz,b.x+ox,y,b.z+oz,b.x-ox,y,b.z-oz);
    batch.uvs.push(0,0,1,0,0,1,1,1);
    if(horizontal)batch.indices.push(n,n+2,n+1,n+1,n+2,n+3);
    else batch.indices.push(n,n+1,n+2,n+1,n+3,n+2);
  };
  digits.split("").forEach((digit,index)=>{
    const offset=(index-(digits.length-1)/2)*0.62;
    for(const key of segments[digit]||[]){
      const [x,z,w,l]=strokes[key];addStroke(x+offset,z,w,l);
    }
  });
}

function polylineMid(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const half = cum[cum.length - 1] / 2;
  for (let i = 1; i < points.length; i++) {
    if (cum[i] >= half) {
      const t = (half - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      const a = points[i - 1], b = points[i], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x: a.x + (b.x - a.x) * t, y: a.y, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len };
    }
  }
  return null;
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

function nearestPointOnPolyline(point, points) {
  let best = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dz = b.z - a.z;
    const length2 = dx * dx + dz * dz;
    const t = length2 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length2)) : 0;
    const candidate = { x: a.x + dx * t, y: a.y + (b.y - a.y) * t, z: a.z + dz * t };
    const distanceM = Math.hypot(point.x - candidate.x, point.z - candidate.z);
    if (!best || distanceM < best.distanceM) best = { ...candidate, distanceM };
  }
  return best;
}

function splitMedianAtAccessGaps(points, gapEveryM = 160, gapWidthM = 8) {
  if (points.length < 2) return [];
  const cumulative=[0];
  for(let i=1;i<points.length;i++) cumulative.push(cumulative[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z));
  const total=cumulative.at(-1), intervals=[];
  let cursor=0;
  for(let centre=gapEveryM;centre<total;centre+=gapEveryM){
    const start=Math.max(cursor,centre-gapWidthM/2),end=Math.min(total,centre+gapWidthM/2);
    if(start>cursor+3) intervals.push([cursor,start]);
    cursor=end;
  }
  if(total>cursor+3) intervals.push([cursor,total]);
  const sampleAt=distance=>{
    let i=1;while(i<cumulative.length-1&&cumulative[i]<distance)i++;
    const a=points[i-1],b=points[i],span=Math.max(1e-9,cumulative[i]-cumulative[i-1]),t=(distance-cumulative[i-1])/span;
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
  };
  return intervals.map(([start,end])=>{
    const line=[sampleAt(start)];
    for(let i=1;i<points.length-1;i++)if(cumulative[i]>start&&cumulative[i]<end)line.push(points[i]);
    line.push(sampleAt(end));
    return line;
  }).filter(line=>line.length>1);
}

function addMedianMeshFence(batch, points, height = 1.15) {
  const clean=[];
  for(const p of points){const prev=clean.at(-1);if(!prev||Math.hypot(p.x-prev.x,p.z-prev.z)>0.25)clean.push(p);}
  if(clean.length<2)return;
  const total=clean.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-clean[i].x,p.z-clean[i].z),0);
  const sampleAt=distance=>{
    let walked=0;
    for(let i=1;i<clean.length;i++){
      const a=clean[i-1],b=clean[i],len=Math.hypot(b.x-a.x,b.z-a.z);
      if(walked+len>=distance){const t=(distance-walked)/Math.max(len,1e-9);return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,dx:(b.x-a.x)/Math.max(len,1e-9),dz:(b.z-a.z)/Math.max(len,1e-9)};}
      walked+=len;
    }
    const a=clean.at(-2),b=clean.at(-1),len=Math.hypot(b.x-a.x,b.z-a.z)||1;
    return{x:b.x,y:b.y,z:b.z,dx:(b.x-a.x)/len,dz:(b.z-a.z)/len};
  };
  // Posts and steel rails form a visible welded-mesh safety fence on the median.
  for(let d=0;d<=total;d+=3){
    const p=sampleAt(d),yaw=Math.atan2(p.dx,p.dz);
    addBox(batch,p.x,p.y+height/2,p.z,0.09,height,0.09,yaw);
  }
  for(const level of [0.12,0.42,height-0.08]){
    for(let d=0;d<total;d+=1.5){
      const p=sampleAt(d),q=sampleAt(Math.min(total,d+1.55)),len=Math.hypot(q.x-p.x,q.z-p.z);
      if(len>0.1)addBox(batch,(p.x+q.x)/2,p.y+level,(p.z+q.z)/2,0.045,0.045,len+0.04,Math.atan2(q.x-p.x,q.z-p.z));
    }
  }
  // Vertical mesh wires at close spacing; all are batched into one draw call.
  for(let d=0.75;d<total;d+=0.75){
    const p=sampleAt(d),yaw=Math.atan2(p.dx,p.dz);
    addBox(batch,p.x,p.y+height/2,p.z,0.025,height-0.12,0.025,yaw);
  }
}

function addVerifiedCarriagewayMedians(edges, grassBatch, concreteTopBatch, curbBatch, fenceBatch) {
  const physicalRoads = new Map();
  for (const edge of edges) {
    const model = edge.roadModel;
    if (model?.groupingSource !== "osm:paired-oneway-carriageways" || !model.physicalRoadId || !model.carriagewayId) continue;
    if (!physicalRoads.has(model.physicalRoadId)) physicalRoads.set(model.physicalRoadId, new Map());
    const carriageways = physicalRoads.get(model.physicalRoadId);
    if (!carriageways.has(model.carriagewayId)) carriageways.set(model.carriagewayId, []);
    carriageways.get(model.carriagewayId).push(edge);
  }
  let medianSegments = 0;
  const emittedPairs = new Set();
  for (const carriageways of physicalRoads.values()) {
    const lanes = [...carriageways.values()];
    if (lanes.length !== 2) continue;
    for (const a of lanes[0]) {
      if (!a.roadModel?.oneWay || !Array.isArray(a.centerline) || a.centerline.length < 2) continue;
      const midA = polylineMid(a.centerline);
      if (!midA) continue;
      let best = null;
      for (const b of lanes[1]) {
        if (!b.roadModel?.oneWay || !Array.isArray(b.centerline) || b.centerline.length < 2) continue;
        const midB = polylineMid(b.centerline);
        if (!midB || midA.dx * midB.dx + midA.dz * midB.dz > -0.5) continue;
        const nearest = nearestPointOnPolyline(midA, b.centerline);
        if (!nearest || nearest.distanceM < 4 || nearest.distanceM > 45) continue;
        if (!best || nearest.distanceM < best.distanceM) best = { edge: b, distanceM: nearest.distanceM };
      }
      if (!best) continue;
      const b = best.edge;
      const pairKey = [a.id, b.id].sort().join("|");
      if (emittedPairs.has(pairKey)) continue;
      emittedPairs.add(pairKey);
      const matched = a.centerline.map(point => {
        const nearest = nearestPointOnPolyline(point, b.centerline);
        return nearest && nearest.distanceM >= 4 && nearest.distanceM <= 45
          ? { point: { x: (point.x + nearest.x) / 2, y: (point.y + nearest.y) / 2, z: (point.z + nearest.z) / 2 }, distanceM: nearest.distanceM }
          : null;
      }).filter(Boolean);
      if (matched.length < 2) continue;
      const separationM = matched.reduce((sum, item) => sum + item.distanceM, 0) / matched.length;
      const widthA = (a.lanes || []).reduce((sum, lane) => sum + (lane.widthM || 0), 0);
      const widthB = (b.lanes || []).reduce((sum, lane) => sum + (lane.widthM || 0), 0);
      const medianWidthM = separationM - (widthA + widthB) / 2;
      // A divider is emitted only when paired, opposite-flow OSM carriageways
      // leave a measurable physical gap after both carriageway widths are accounted for.
      if (!Number.isFinite(medianWidthM) || medianWidthM < 0.8 || medianWidthM > 12) continue;
      const medianLine = matched.map(item => ({ ...item.point, y: item.point.y + 0.025 }));
      const lengthM = medianLine.slice(1).reduce((sum, point, index) =>
        sum + Math.hypot(point.x - medianLine[index].x, point.z - medianLine[index].z), 0);
      if (lengthM < 8) continue;
      // Open a deliberate 8 m median crossing every 160 m. Both the raised
      // divider and its metal mesh stop at these access gaps.
      const sections=splitMedianAtAccessGaps(medianLine,160,8);
      for(const section of sections){
        addRaisedMedian(grassBatch, concreteTopBatch, curbBatch, section, medianWidthM, 0.28);
        addMedianMeshFence(fenceBatch,section,1.15);
      }
      medianSegments++;
    }
  }
  return medianSegments;
}


export function createRoadMeshes(THREE, network, options = {}) {
  if (!THREE?.BufferGeometry || !THREE?.Mesh || !Array.isArray(network?.edges))
    throw new Error("Three.js and a valid road network are required");
  const group = new THREE.Group();
  const batches = new Map(), marks = new Batch(), junction = new Batch(), bridges = new Batch(), medians = new Batch(), medianGrass = new Batch(), medianConcreteTops = new Batch();
  const nodeEnds = new Map(); // nodeId -> [{left,right,y}]
  const nodeDegree = new Map();
  let renderedEdges = 0, skippedEdges = 0, markingSegments = 0, stopLines = 0, arrows = 0, speedLimitSymbols = 0, bridgeEdges = 0, bridgeLengthM = 0;
  const speedMarkedWays = new Set();
  for (const e of network.edges) {
    nodeDegree.set(e.fromNodeId, (nodeDegree.get(e.fromNodeId) || 0) + 1);
    nodeDegree.set(e.toNodeId, (nodeDegree.get(e.toNodeId) || 0) + 1);
  }

  for (const edge of network.edges) {
    let foundation, surface;
    try {
      foundation = buildRoadFoundation(edge);
      surface = buildRoadSurfaceData(foundation, { surfaceOffsetM: SURFACE_Y });
    } catch (error) {
      skippedEdges++;
      continue;
    }
    const type = roadClass(edge);
    if (!batches.has(type)) batches.set(type, new Batch());
    const batch = batches.get(type), base = batch.base;
    batch.positions.push(...surface.positions);
    batch.uvs.push(...surface.uvs);
    for (const index of surface.indices) batch.indices.push(base + index);
    renderedEdges++;

    // Bridge-tagged OSM ways receive a visible concrete deck and side parapets.
    // The deck follows the imported vertical coordinates exactly: OSM bridge=yes
    // alone does not provide a metric elevation, so no artificial rise is added.
    if (edge.osm?.bridge && edge.osm.bridge !== "no") {
      bridgeEdges++;
      const widthM = foundation.crossSection.laneWidthM;
      const alignment = foundation.alignment;
      for (let i = 1; i < alignment.length; i++) {
        const a = alignment[i - 1], b = alignment[i];
        const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
        if (len < 0.5) continue;
        bridgeLengthM += len;
        const yaw = Math.atan2(dx, dz), nx = -dz / len, nz = dx / len;
        const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, cy = (a.y + b.y) / 2;
        addBox(bridges, cx, cy - 0.16, cz, widthM + 1.0, 0.34, len + 0.12, yaw);
        for (const side of [-1, 1]) {
          const offset = side * (widthM / 2 + 0.24);
          const rx = cx + nx * offset, rz = cz + nz * offset;
          addBox(bridges, rx, cy + 0.48, rz, 0.22, 0.96, len + 0.12, yaw);
          addBox(bridges, rx, cy + 1.0, rz, 0.32, 0.12, len + 0.12, yaw);
        }
      }
    }

    const { left, right } = foundation.boundaries;
    const addEnd = (nodeId, l, r) => {
      if (!nodeEnds.has(nodeId)) nodeEnds.set(nodeId, []);
      nodeEnds.get(nodeId).push({ left: l, right: r });
    };
    addEnd(edge.fromNodeId, left[0], right[0]);
    addEnd(edge.toNodeId, left[left.length - 1], right[right.length - 1]);

    // ---- markings ----
    const lanes = foundation.laneCentrelines;
    const forward = lanes.filter(l => l.direction === "forward").sort((a, b) => b.centreOffsetM - a.centreOffsetM);
    const reverse = lanes.filter(l => l.direction === "reverse").sort((a, b) => a.centreOffsetM - b.centreOffsetM);
    const roundabout = edge.osm?.junction === "roundabout" || edge.osm?.junction === "circular";
    const inner = (a, b) => a.points.map((p, i) => mid(p, b.points[i]));
    const before = marks.indices.length;
    if (forward.length && reverse.length && !roundabout) {
      // opposing flows: solid centre line between the innermost lanes
      const f = forward.reduce((best, l) => Math.abs(l.centreOffsetM) < Math.abs(best.centreOffsetM) ? l : best);
      const r = reverse.reduce((best, l) => Math.abs(l.centreOffsetM) < Math.abs(best.centreOffsetM) ? l : best);
      addRibbon(marks, inner(f, r), LINE_W * 1.3);
    }
    for (const group2 of [forward, reverse]) {
      const sorted = [...group2].sort((a, b) => a.centreOffsetM - b.centreOffsetM);
      for (let i = 1; i < sorted.length; i++) addRibbon(marks, inner(sorted[i - 1], sorted[i]), LINE_W, { dashed: true });
    }
    // edge lines, inset from the carriageway boundary
    const outerLeft = lanes.reduce((best, l) => l.centreOffsetM > best.centreOffsetM ? l : best, lanes[0]);
    const outerRight = lanes.reduce((best, l) => l.centreOffsetM < best.centreOffsetM ? l : best, lanes[0]);
    const inset = (lane, boundary, ratio) => lane.points.map((p, i) => ({
      x: boundary[i].x + (p.x - boundary[i].x) * ratio, y: p.y, z: boundary[i].z + (p.z - boundary[i].z) * ratio }));
    if (!roundabout && left.length === outerLeft.points.length) {
      addRibbon(marks, inset(outerLeft, left, Math.min(0.2, 0.2 / Math.max(0.5, outerLeft.widthM))), LINE_W);
      addRibbon(marks, inset(outerRight, right, Math.min(0.2, 0.2 / Math.max(0.5, outerRight.widthM))), LINE_W);
    }
    markingSegments += (marks.indices.length - before) / 6;

    // stop lines where a lane runs into a real junction (3+ edges at the node)
    for (const lane of lanes) {
      if (lane.direction === "both") continue;
      const pts = lane.points, toEnd = lane.direction === "forward";
      const endNode = toEnd ? edge.toNodeId : edge.fromNodeId;
      // Circulating roundabout traffic has priority: no stop line on the ring itself.
      if (roundabout || (nodeDegree.get(endNode) || 0) < 3 || surface.lengthM < 12) continue;
      const a = toEnd ? pts[pts.length - 2] : pts[1], b = toEnd ? pts[pts.length - 1] : pts[0];
      const len = Math.hypot(b.x - a.x, b.z - a.z); if (len < 1e-6) continue;
      const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
      const stop = { x: b.x - dx * 1.5, z: b.z - dz * 1.5 };
      addCross(marks, stop, dx, dz, lane.widthM / 2 - 0.15, STOP_W, b.y);
      stopLines++;
    }
    // direction arrows on long edges, one per lane, in the lane's direction of travel
    if (surface.lengthM > 30 && !roundabout) {
      for (const lane of lanes) {
        if (lane.direction === "both") continue;
        const m = polylineMid(lane.points); if (!m) continue;
        const sign = lane.direction === "forward" ? 1 : -1;
        addArrow(marks, m, m.dx * sign, m.dz * sign, m.y, lane.widthM);
        arrows++;
      }
    }
    // Paint OSM-mapped speed limits onto the carriageway as large two-digit
    // symbols. One marking per source way avoids clutter on split geometry.
    const speedValue=String(edge.osm?.maxspeed??"").match(/\d+/)?.[0];
    const sourceWay=edge.osm?.wayId||edge.selection?.sourceWayId||edge.id;
    if(speedValue&&Number(speedValue)>0&&!speedMarkedWays.has(sourceWay)&&surface.lengthM>20&&lanes.length){
      const lane=lanes[0],m=polylineMid(lane.points);
      if(m){addSpeedLimitMarking(marks,m,m.dx,m.dz,Number(speedValue));speedMarkedWays.add(sourceWay);speedLimitSymbols++;}
    }
  }

  const medianFence = new Batch();
  const medianCount = addVerifiedCarriagewayMedians(network.edges, medianGrass, medianConcreteTops, medians, medianFence);

  // ---- junction patches (fan around each shared node from real boundary endpoints) ----
  let junctionCount = 0;
  for (const [nodeId, ends] of nodeEnds) {
    if (ends.length < 2) continue;
    if (ends.length === 2) {
      // Degree-2 node (a bend): only patch when the two boundaries do not already meet.
      const [a, b] = ends, gap = Math.max(Math.hypot(a.left.x - b.left.x, a.left.z - b.left.z), Math.hypot(a.right.x - b.right.x, a.right.z - b.right.z),
        Math.hypot(a.left.x - b.right.x, a.left.z - b.right.z) * 0, 0);
      const swapped = Math.max(Math.hypot(a.left.x - b.right.x, a.left.z - b.right.z), Math.hypot(a.right.x - b.left.x, a.right.z - b.left.z));
      if (Math.min(gap, swapped) < 0.05) continue;
    }
    const pts = ends.flatMap(e => [e.left, e.right]);
    const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length };
    const sorted = pts.map(p => ({ p, a: Math.atan2(p.z - c.z, p.x - c.x) })).sort((u, v) => u.a - v.a).map(o => o.p);
    const n = junction.base;
    junction.positions.push(c.x, c.y + JUNCTION_Y, c.z);
    junction.uvs.push(.5, .5);
    for (const p of sorted) { junction.positions.push(p.x, p.y + JUNCTION_Y, p.z); junction.uvs.push(0, 0); }
    for (let i = 0; i < sorted.length; i++) {
      const j = (i + 1) % sorted.length;
      const a = { x: sorted[i].x - c.x, z: sorted[i].z - c.z }, b = { x: sorted[j].x - c.x, z: sorted[j].z - c.z };
      // normalY of (c, v_i, v_j) = (v_i-c) x (v_j-c) component; require upward winding
      const normalY = (sorted[i].z - c.z) * (sorted[j].x - c.x) - (sorted[i].x - c.x) * (sorted[j].z - c.z);
      if (Math.abs(normalY) < 1e-6) continue;
      if (normalY > 0) junction.indices.push(n, n + 1 + i, n + 1 + j);
      else junction.indices.push(n, n + 1 + j, n + 1 + i);
    }
    junctionCount++;
  }

  const addMesh = (name, batch, material, userData) => {
    if (!batch.positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(batch.positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(batch.uvs, 2));
    geometry.setIndex(batch.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere?.();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.userData = userData || {};
    group.add(mesh);
  };
  for (const [type, batch] of batches) {
    addMesh("osm-roads:" + type, batch, options.roadMaterial ?? new THREE.MeshStandardMaterial({ color: CLASS_COLORS[type] ?? 0x363d41, roughness: 1, metalness: 0 }), { highwayClass: type });
  }
  addMesh("osm-road-junctions", junction, options.roadMaterial ?? new THREE.MeshStandardMaterial({ color: 0x4a5054, roughness: 1, metalness: 0 }), { junctions: junctionCount });
  addMesh("osm-road-markings", marks, options.markingMaterial ?? new THREE.MeshStandardMaterial({ color: 0xe6e0bc, roughness: .9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }), { markings: true });
  addMesh("osm-road-medians", medians, options.medianMaterial ?? new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: 1, metalness: 0, side: THREE.DoubleSide }), { medianSegments: medianCount, medianHeightM: 0.28, source: "paired-opposing-osm-carriageways" });
  addMesh("osm-road-median-grass", medianGrass, options.medianGrassMaterial ?? new THREE.MeshStandardMaterial({ color: 0x557c49, roughness: 1, metalness: 0 }), { medianSegments: medianCount, medianHeightM: 0.28, surface: "landscaped-grass" });
  addMesh("osm-road-median-concrete-tops", medianConcreteTops, options.medianMaterial ?? new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: 1, metalness: 0 }), { medianSegments: medianCount, medianHeightM: 0.28, surface: "concrete" });
  addMesh("osm-road-median-metal-mesh-fence", medianFence, options.medianFenceMaterial ?? new THREE.MeshStandardMaterial({ color: 0x66727a, roughness: 0.58, metalness: 0.82 }), { medianSegments: medianCount, fenceHeightM: 1.15, accessGapEveryM: 160, accessGapWidthM: 8 });
  addMesh("osm-bridge-structures", bridges, options.bridgeMaterial ?? new THREE.MeshStandardMaterial({ color: 0x777d80, roughness: .92, metalness: .04 }), { bridgeEdges, bridgeLengthM: Number(bridgeLengthM.toFixed(1)), deckAndParapets: true });

  group.userData = {
    roadMeshCount: batches.size + (junction.positions.length ? 1 : 0) + (bridges.positions.length ? 1 : 0) + (medians.positions.length ? 1 : 0) + (medianFence.positions.length ? 1 : 0),
    edgeCount: renderedEdges, skippedEdges, junctionCount, markingSegments, stopLines, arrows,
    bridgeEdges, bridgeLengthM: Number(bridgeLengthM.toFixed(1)), medianCount, speedLimitSymbols,
    networkId: network.id, batched: true
  };
  return group;
}
