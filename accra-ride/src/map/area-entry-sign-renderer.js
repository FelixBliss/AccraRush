/**
 * Physical community-entry signboards for the approved Lapaz–Madina route.
 * Signs are attached to existing route edges only. This module never creates
 * road edges, junctions, connectors, minimap lines or navigation instructions.
 */
const finite = value => typeof value === "number" && Number.isFinite(value);

function sampleEdge(edge, fraction) {
  const points = edge?.centerline;
  if (!Array.isArray(points) || points.length < 2) throw new Error("Entry sign requires a route edge with a centreline");
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    lengths.push(length);
    total += length;
  }
  if (!(total > 0)) throw new Error("Entry sign route edge has no measurable length");
  let remaining = total * fraction;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i];
    if (length <= 1e-9) continue;
    if (remaining <= length || i === lengths.length - 1) {
      const a = points[i], b = points[i + 1], t = Math.max(0, Math.min(1, remaining / Math.max(length, 1e-9)));
      const dx = b.x - a.x, dz = b.z - a.z, horizontal = Math.hypot(dx, dz);
      return {
        point: { x: a.x + dx * t, y: a.y + (b.y - a.y) * t, z: a.z + dz * t },
        tangent: { x: dx / horizontal, z: dz / horizontal }
      };
    }
    remaining -= length;
  }
  throw new Error("Could not sample entry sign route position");
}

function makeCanvas(sign, canvasFactory) {
  const canvas = canvasFactory();
  canvas.width = 1024;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is required for physical sign lettering");
  context.fillStyle = "#075b3b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#ffffff";
  context.lineWidth = 14;
  context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  context.textAlign = "center";
  context.textBaseline = "middle";
  const words = String(sign.text || "").trim().split(/\s+/);
  const heading = words.slice(0, 2).join(" ");
  const place = words.slice(2).join(" ");
  context.fillStyle = "#ffffff";
  context.font = "bold 58px Arial, sans-serif";
  context.fillText(heading, canvas.width / 2, 112, 900);
  context.font = "bold 112px Arial, sans-serif";
  context.fillText(place, canvas.width / 2, 248, 930);
  return canvas;
}

function setPosition(object, x, y, z) {
  if (object.position?.set) object.position.set(x, y, z);
  else object.position = { x, y, z };
}

export function createAreaEntrySignMeshes(THREE, document, network, options = {}) {
  if (!THREE?.Group || !THREE?.BoxGeometry || !THREE?.Mesh || !THREE?.MeshStandardMaterial || !THREE?.CanvasTexture) {
    throw new Error("Three.js Group, BoxGeometry, Mesh, MeshStandardMaterial and CanvasTexture are required");
  }
  if (!Array.isArray(network?.edges)) throw new Error("Entry signs require the existing selected road graph");
  const canvasFactory = options.canvasFactory || (() => {
    if (typeof globalThis.document?.createElement !== "function") throw new Error("Browser canvas is unavailable");
    return globalThis.document.createElement("canvas");
  });
  const edges = new Map(network.edges.map(edge => [edge.id, edge]));
  const group = new THREE.Group();
  const signIds = [];
  const signEdges = [];

  for (const sign of document?.signs || []) {
    const edge = edges.get(sign.routeEdgeId);
    if (!edge) throw new Error("Entry sign references an edge outside the selected graph: " + sign.routeEdgeId);
    if (edge.selection?.role !== "route") throw new Error("Entry sign may only attach to an approved route edge: " + sign.routeEdgeId);
    if (!finite(sign.edgeFraction) || sign.edgeFraction < 0 || sign.edgeFraction > 1 ||
        ![-1, 1].includes(sign.side) || !finite(sign.setbackM) || sign.setbackM < 1 ||
        !finite(sign.widthM) || sign.widthM < 1 || !finite(sign.heightM) || sign.heightM < 0.5 ||
        !finite(sign.panelBottomM) || sign.panelBottomM < 1) {
      throw new Error("Entry sign has invalid route placement or dimensions: " + sign.id);
    }
    if (!["both", "forward", "reverse"].includes(sign.direction)) throw new Error("Entry sign has an unsupported facing direction: " + sign.id);

    const sampled = sampleEdge(edge, sign.edgeFraction);
    let dx = sampled.tangent.x, dz = sampled.tangent.z;
    if (sign.direction === "reverse") { dx = -dx; dz = -dz; }
    const nx = -sampled.tangent.z, nz = sampled.tangent.x;
    const laneWidthM = (edge.lanes || []).reduce((sum, lane) => sum + (lane.widthM || 0), 0);
    if (!(laneWidthM > 0)) throw new Error("Entry sign route edge has no verified lane width: " + sign.routeEdgeId);
    const offsetM = laneWidthM / 2 + sign.setbackM;
    const x = sampled.point.x + nx * sign.side * offsetM;
    const z = sampled.point.z + nz * sign.side * offsetM;
    const yaw = Math.atan2(-dx, -dz);
    const lateralX = Math.cos(yaw), lateralZ = -Math.sin(yaw);

    const canvas = makeCanvas(sign, canvasFactory);
    const texture = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x173c2d, roughness: 0.9, metalness: 0 });
    const faceMaterial = new THREE.MeshStandardMaterial({
      map: texture, roughness: 0.92, metalness: 0,
      ...(THREE.DoubleSide !== undefined ? { side: THREE.DoubleSide } : {})
    });
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4f4b, roughness: 0.95, metalness: 0.05 });
    const panelGeometry = new THREE.BoxGeometry(sign.widthM, sign.heightM, 0.14);
    const panel = new THREE.Mesh(panelGeometry, [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, faceMaterial, faceMaterial]);
    setPosition(panel, x, sampled.point.y + sign.panelBottomM + sign.heightM / 2, z);
    panel.rotation.y = yaw;
    panel.name = "area-entry-sign:" + sign.id;
    panel.userData = { signId: sign.id, areaName: sign.areaName, routeEdgeId: sign.routeEdgeId, routeOnly: true };
    group.add(panel);

    const postGeometry = new THREE.BoxGeometry(0.14, sign.panelBottomM + sign.heightM + 0.12, 0.14);
    const footingGeometry = new THREE.BoxGeometry(0.42, 0.16, 0.42);
    for (const direction of [-1, 1]) {
      const px = x + lateralX * direction * sign.widthM * 0.38;
      const pz = z + lateralZ * direction * sign.widthM * 0.38;
      const post = new THREE.Mesh(postGeometry, postMaterial);
      setPosition(post, px, sampled.point.y + (sign.panelBottomM + sign.heightM + 0.12) / 2, pz);
      post.rotation.y = yaw;
      post.name = "area-entry-sign-post:" + sign.id;
      group.add(post);
      const footing = new THREE.Mesh(footingGeometry, postMaterial);
      setPosition(footing, px, sampled.point.y + 0.08, pz);
      footing.rotation.y = yaw;
      footing.name = "area-entry-sign-footing:" + sign.id;
      group.add(footing);
    }
    signIds.push(sign.id);
    signEdges.push(sign.routeEdgeId);
  }

  group.userData = {
    count: signIds.length,
    signIds,
    routeEdgeIds: [...new Set(signEdges)],
    roadGraphModified: false,
    navigationModified: false,
    minimapModified: false
  };
  return group;
}
