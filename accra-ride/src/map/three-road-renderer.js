/**
 * Three.js road mesh factory. Pass the THREE namespace from the game's existing runtime;
 * this module intentionally does not create a second renderer or alter the HUD.
 */
const CLASS_WIDTH = { motorway:14, trunk:12, primary:10, secondary:8, tertiary:7, residential:6, unclassified:6, living_street:5, service:4.5 };
const materialFor = (THREE, color, roughness=1) => new THREE.MeshStandardMaterial({color,roughness});
function roadWidth(edge) { return CLASS_WIDTH[edge.osm?.highway] ?? 6; }
function offsetPoint(a,b,offset) {
 const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
 return {x:-dz/len*offset,z:dx/len*offset};
}
export function createRoadMeshes(THREE, network, options={}) {
 if(!THREE?.BufferGeometry || !THREE?.Mesh || !Array.isArray(network?.edges)) throw new Error("Three.js and a valid road network are required");
 const group=new THREE.Group(), roadMaterial=options.roadMaterial??materialFor(THREE,0x34383b), markingMaterial=options.markingMaterial??new THREE.LineBasicMaterial({color:0xe8d9a4});
 const roadMeshes=[];
 for(const edge of network.edges) {
  const points=edge.centerline;
  if(!Array.isArray(points)||points.length<2) continue;
  const half=roadWidth(edge)/2, vertices=[], indices=[];
  for(let i=0;i<points.length;i++) {
   const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
   const offset=offsetPoint(prev,next,half),p=points[i];
   vertices.push(p.x+offset.x,p.y+0.025,p.z+offset.z,p.x-offset.x,p.y+0.025,p.z-offset.z);
   if(i>0){const n=i*2;indices.push(n-2,n-1,n,n-1,n+1,n);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,roadMaterial);mesh.name=`road:${edge.id}`;mesh.userData={edgeId:edge.id,osmWayId:edge.osm?.wayId??null};
  group.add(mesh);roadMeshes.push(mesh);
  if(edge.lanes?.some(l=>l.direction==="reverse")&&edge.lanes?.some(l=>l.direction==="forward")) {
   const lineVertices=[];
   for(const p of points) lineVertices.push(p.x,p.y+0.045,p.z);
   const lineGeometry=new THREE.BufferGeometry();
   lineGeometry.setAttribute("position",new THREE.Float32BufferAttribute(lineVertices,3));
   const line=new THREE.Line(lineGeometry,markingMaterial);line.name=`road-centre:${edge.id}`;group.add(line);
  }
 }
 group.userData={roadMeshCount:roadMeshes.length,networkId:network.id};
 return group;
}
