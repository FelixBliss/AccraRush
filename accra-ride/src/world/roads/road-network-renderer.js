import { buildRoadRibbonData, buildJunctionPatchData, resolveRoadRenderWidth } from "./road-geometry.js";

/**
 * Builds disposable Three.js meshes from the canonical OSM road graph.
 * Pass the THREE namespace from the owning game entry point; this module does
 * not load a second Three.js runtime or mutate the live game scene.
 */
export function createRoadNetworkRenderer(THREE,network,options={}) {
 if(!THREE?.Group||!THREE?.BufferGeometry||!THREE?.Mesh)throw new TypeError("a compatible Three.js namespace is required");
 if(!network||!Array.isArray(network.edges)||!Array.isArray(network.nodes))throw new TypeError("a validated road network is required");
 const group=new THREE.Group(),ownedMaterials=[];
 const asphalt=options.asphaltMaterial??new THREE.MeshStandardMaterial({color:options.asphaltColor??0x30343a,roughness:.96,metalness:0});
 if(!options.asphaltMaterial)ownedMaterials.push(asphalt);
 const widthResolver=edge=>resolveRoadRenderWidth(edge,options.roadWidths);
 const makeGeometry=data=>{
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(data.positions,3));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(data.uvs,2));
  geometry.setIndex(data.indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
 };
 for(const edge of network.edges){
  const width=widthResolver(edge),data=buildRoadRibbonData(edge.centerline,width.widthM,{surfaceOffsetM:options.surfaceOffsetM??.04});
  const mesh=new THREE.Mesh(makeGeometry(data),asphalt);
  mesh.name="road:"+edge.id;
  mesh.userData={edgeId:edge.id,roadClass:edge.roadClass??"unknown",renderWidthM:width.widthM,renderWidthSource:width.source,sourceWayId:edge.sourceWayId??edge.source?.wayId??null};
  mesh.receiveShadow=options.receiveShadow??false;mesh.castShadow=false;group.add(mesh);
 }
 for(const junction of network.junctions??[]){
  const data=buildJunctionPatchData(network,junction,widthResolver);if(!data)continue;
  const mesh=new THREE.Mesh(makeGeometry(data),asphalt);
  mesh.name="junction:"+junction.nodeId;mesh.userData={junctionNodeId:junction.nodeId,movementStatus:junction.movementStatus??"review_required"};
  mesh.receiveShadow=options.receiveShadow??false;mesh.castShadow=false;group.add(mesh);
 }
 group.name=options.name??("road-network:"+network.areaId??network.id);
 let disposed=false;
 return {
  group,
  dispose(){
   if(disposed)return;disposed=true;
   group.traverse(object=>{if(object.geometry)object.geometry.dispose();});
   for(const material of ownedMaterials)material.dispose();
   group.clear();
  }
 };
}
