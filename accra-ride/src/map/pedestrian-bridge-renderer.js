/**
 * Procedural, batched pedestrian footbridges for OSM-mapped bridge ways.
 * The mapped footway/bridge way supplies the position and crossing orientation;
 * deck, columns, railings and stairs are generated as real elevated geometry.
 * Dimensions are configurable because OSM rarely maps structural dimensions.
 */
const finite = Number.isFinite;
const lineSnapLimitM = 22;
class Batch {
  constructor(){ this.p=[]; this.i=[]; }
  box(cx,cy,cz,sx,sy,sz,yaw=0){
    const c=Math.cos(yaw),s=Math.sin(yaw),n=this.p.length/3;
    for(const dy of [-1,1])for(const dz of [-1,1])for(const dx of [-1,1]){
      const x=dx*sx/2,z=dz*sz/2;
      this.p.push(cx+x*c+z*s,cy+dy*sy/2,cz-x*s+z*c);
    }
    const f=(a,b,d,e)=>this.i.push(n+a,n+b,n+d,n+a,n+d,n+e);
    f(4,6,7,5);f(0,1,3,2);f(0,4,5,1);f(2,3,7,6);f(0,2,6,4);f(1,5,7,3);
  }
}
const material=(THREE,color,metalness=0.05,roughness=0.8)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
function mesh(THREE,batch,mat,name){
  if(!batch.p.length)return null;
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(batch.p,3));
  g.setIndex(batch.i);g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);m.name=name;m.castShadow=true;m.receiveShadow=true;return m;
}
function roadWidth(edge){return Math.max(6,(edge.lanes||[]).reduce((s,l)=>s+(l.widthM||3.5),0));}
export function createPedestrianBridgeMeshes(THREE,features,network,options={}){
  if(!THREE?.Group||!THREE?.BufferGeometry||!THREE?.Float32BufferAttribute||!THREE?.MeshStandardMaterial)throw new Error("Three.js bridge primitives are required");
  const cfg={deckHeightM:5.6,deckWidthM:3.4,stairWidthM:2.1,stairRunM:7.5,railHeightM:1.25,...options};
  const edges=new Map(network.edges.map(e=>[e.id,e]));
  const deck=new Batch(),steel=new Batch(),stairs=new Batch();
  let built=0,skipped=0;
  for(const f of features||[]){
    if(f.kind!=="pedestrian_bridge"||!f.line||f.line.length<2){continue;}
    const edge=edges.get(f.edgeId);
    if(!edge||!f.heading||!finite(f.heading.x)||!finite(f.heading.z)){skipped++;continue;}
    const roadWidthM=roadWidth(edge),rx=f.heading.x,rz=f.heading.z;
    // The mapped pedestrian way crosses the selected motor road. Its perpendicular
    // direction is the bridge span; the deck is extended beyond both road edges.
    const first=f.line[0],last=f.line[f.line.length-1];
    const mappedX=last.x-first.x,mappedZ=last.z-first.z,mappedLength=Math.hypot(mappedX,mappedZ);
    if(mappedLength<3){skipped++;continue;}
    const sx=mappedX/mappedLength,sz=mappedZ/mappedLength;
    // A pedestrian bridge way must actually cross the selected road. Reject paths
    // that run along the carriageway rather than inventing a crossing over it.
    if(Math.abs(sx*rx+sz*rz)>0.55){skipped++;continue;}
    const halfSpan=roadWidthM/2+cfg.stairRunM+2;
    const mappedMid=f.line[Math.floor(f.line.length/2)];
    if(!mappedMid||!finite(mappedMid.x)||!finite(mappedMid.z)){skipped++;continue;}
    // The OSM footway can approach from a side path and its midpoint may not
    // coincide with the carriageway. Snap the bridge deck centre to the actual
    // intersection vicinity on the selected road edge before building the span.
    let centre=f.position||mappedMid,bestDistance=Infinity;
    if(Array.isArray(edge.centerline)&&edge.centerline.length>=2){
      centre=null;
      for(let i=1;i<edge.centerline.length;i++){
        const a=edge.centerline[i-1],b=edge.centerline[i],vx=b.x-a.x,vz=b.z-a.z;
        const l2=vx*vx+vz*vz||1;
        const t=Math.max(0,Math.min(1,((mappedMid.x-a.x)*vx+(mappedMid.z-a.z)*vz)/l2));
        const point={x:a.x+vx*t,y:a.y+(b.y-a.y)*t,z:a.z+vz*t};
        const distance=Math.hypot(mappedMid.x-point.x,mappedMid.z-point.z);
        if(distance<bestDistance){bestDistance=distance;centre=point;}
      }
      if(!centre||bestDistance>lineSnapLimitM){skipped++;continue;}
    }
    if(!centre||!finite(centre.x)||!finite(centre.z)){skipped++;continue;}
    const yaw=Math.atan2(sx,sz),y=cfg.deckHeightM;
    deck.box(centre.x,y,centre.z,cfg.deckWidthM,0.32,halfSpan*2,yaw);
    // Deck edge parapets and continuous handrails.
    for(const side of [-1,1]){
      const offset=side*(cfg.deckWidthM/2-0.08);
      steel.box(centre.x+rx*offset,y+0.72,centre.z+rz*offset,0.12,1.15,halfSpan*2,yaw,0);
      steel.box(centre.x+rx*offset,y+1.25,centre.z+rz*offset,0.10,0.10,halfSpan*2,yaw,0);
    }
    // Support columns stand outside the carriageway, never in its running lanes.
    for(const side of [-1,1]){
      const along=side*(roadWidthM/2+0.9);
      steel.box(centre.x+sx*along, y/2, centre.z+sz*along,0.55,y,0.55,0);
      // Stair flights descend outward on each side, with individual visible treads.
      const steps=12,run=cfg.stairRunM/steps,rise=y/steps;
      for(let k=0;k<steps;k++){
        const distance=roadWidthM/2+1.1+(k+0.5)*run;
        const stairY=y-(k+0.5)*rise-0.12;
        const x=centre.x+sx*side*distance,z=centre.z+sz*side*distance;
        stairs.box(x,stairY,z,cfg.stairWidthM,0.18,run+0.06,yaw);
      }
      // Stair stringers/handrails on both outer edges.
      for(const edgeSide of [-1,1]){
        const across=edgeSide*(cfg.stairWidthM/2);
        const start=roadWidthM/2+1.1,end=start+cfg.stairRunM;
        const mid=(start+end)/2;
        steel.box(centre.x+sx*side*mid+rx*across,y*0.58,centre.z+sz*side*mid+rz*across,0.12,0.14,Math.hypot(cfg.stairRunM,y),yaw);
      }
    }
    built++;
  }
  const group=new THREE.Group();
  const deckMesh=mesh(THREE,deck,material(THREE,0x777d82,0.35,0.72),"osm-footbridge-decks");
  const steelMesh=mesh(THREE,steel,material(THREE,0x59636b,0.72,0.42),"osm-footbridge-steel-and-railings");
  const stairMesh=mesh(THREE,stairs,material(THREE,0x777d82,0.25,0.8),"osm-footbridge-staircases");
  for(const item of [deckMesh,steelMesh,stairMesh])if(item)group.add(item);
  group.name="osm-pedestrian-footbridges";
  group.userData={built,skipped,deckHeightM:cfg.deckHeightM,source:"OSM bridge=footway / bridge=yes; dimensions procedural",collisionRequired:true};
  return group;
}
