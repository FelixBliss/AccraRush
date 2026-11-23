/**
 * Renders real OSM road features (see road-features.js) as one batched vertex-coloured mesh:
 * zebra crossings, signal poles/heads, stop/give-way/other signs, bollards, speed humps and
 * guard-rail style barriers. Only features that selectRoadFeatures() matched to the selected
 * graph are drawn, at their OSM positions.
 */
const COLORS = {
  stripe: [0.93, 0.92, 0.85], pole: [0.32, 0.34, 0.36], signalHead: [0.08, 0.09, 0.1], signalRed: [0.9, 0.12, 0.1],
  stop: [0.8, 0.08, 0.08], giveWay: [0.95, 0.95, 0.95], sign: [0.1, 0.35, 0.75], bollard: [0.9, 0.9, 0.9],
  hump: [0.9, 0.75, 0.1], rail: [0.62, 0.65, 0.68], lamp: [0.95, 0.9, 0.7], gantry: [0.45, 0.47, 0.5],
  panel: [0.05, 0.45, 0.25], shelter: [0.2, 0.45, 0.6], bench: [0.45, 0.3, 0.18], camera: [0.85, 0.85, 0.85], walk: [0.62, 0.62, 0.6]
};

class Batch {
  constructor() { this.positions = []; this.colors = []; this.indices = []; }
  box(cx, cy, cz, sx, sy, sz, yaw, color) {
    // yaw rotates about Y; sx across (local x), sz along (local z)
    const c = Math.cos(yaw), s = Math.sin(yaw), base = this.positions.length / 3;
    const corners = [];
    for (const dy of [-1, 1]) for (const dz of [-1, 1]) for (const dx of [-1, 1]) {
      const lx = dx * sx / 2, lz = dz * sz / 2;
      corners.push([cx + lx * c + lz * s, cy + dy * sy / 2, cz - lx * s + lz * c]);
    }
    for (const p of corners) { this.positions.push(...p); this.colors.push(...color); }
    // corner index = (dy+1)/2*4 + (dz+1)/2*2 + (dx+1)/2 ; faces wound outward (CCW seen from outside)
    const f = (a, b, d, e) => this.indices.push(base + a, base + b, base + d, base + a, base + d, base + e);
    f(4, 5, 7, 6); // top
    f(0, 2, 3, 1); // bottom
    f(0, 1, 5, 4); f(2, 6, 7, 3); f(0, 4, 6, 2); f(1, 3, 7, 5);
  }
}

const roadWidth = edge => Math.max(3, (edge.lanes || []).reduce((s, l) => s + (l.widthM || 3.5), 0));

export function createRoadFeatureMeshes(THREE, features, network) {
  if (!THREE?.BufferGeometry || !THREE?.Mesh) throw new Error("Three.js is required");
  const group = new THREE.Group();
  const edges = new Map(network.edges.map(e => [e.id, e]));
  const batch = new Batch();
  const counts = {};
  for (const f of features) {
    const edge = edges.get(f.edgeId);
    if (!edge) continue;
    const width = roadWidth(edge), hw = width / 2;
    const dx = f.heading?.x ?? 1, dz = f.heading?.z ?? 0, yaw = Math.atan2(dx, dz);
    const nx = -dz, nz = dx; // left normal
    counts[f.kind] = (counts[f.kind] || 0) + 1;
    if (f.kind === "barrier" && f.line) {
      for (let i = 1; i < f.line.length; i++) {
        const a = f.line[i - 1], b = f.line[i], len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 0.1) continue;
        batch.box((a.x + b.x) / 2, 0.55, (a.z + b.z) / 2, 0.12, 0.35, len, Math.atan2(b.x - a.x, b.z - a.z), COLORS.rail);
        batch.box((a.x + b.x) / 2, 0.2, (a.z + b.z) / 2, 0.06, 0.4, len, Math.atan2(b.x - a.x, b.z - a.z), COLORS.pole);
      }
      continue;
    }
    if (f.kind === "sidewalk" && f.line) {
      for (let i = 1; i < f.line.length; i++) {
        const a = f.line[i - 1], b = f.line[i], len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 0.1) continue;
        batch.box((a.x + b.x) / 2, 0.07, (a.z + b.z) / 2, 1.6, 0.14, len, Math.atan2(b.x - a.x, b.z - a.z), COLORS.walk);
      }
      continue;
    }
    const p = f.position;
    if (!p) continue;
    if (f.kind === "crossing") {
      const n = Math.max(3, Math.floor(width / 1.0));
      for (let i = 0; i < n; i++) {
        const off = -hw + (i + 0.5) * (width / n);
        batch.box(p.x + nx * off, 0.075, p.z + nz * off, width / n * 0.5, 0.01, 3, yaw, COLORS.stripe);
      }
      continue;
    }
    if (f.kind === "speed_hump") { batch.box(p.x, 0.04, p.z, width, 0.08, 0.7, yaw + Math.PI / 2, COLORS.hump); continue; }
    // Poles stand at the road edge on the side the OSM node lies on (right-hand side if on the centreline).
    const side = f.side ?? -1; // +1 = left of travel
    const dist = Math.max(f.offsetM ?? 0, hw + 0.7);
    const cx = p.x - nx * side * (f.offsetM ?? 0), cz = p.z - nz * side * (f.offsetM ?? 0); // point on the centreline
    const px = cx + nx * side * dist, pz = cz + nz * side * dist;
    if (f.kind === "gantry") {
      for (const s of [-1, 1]) batch.box(cx + nx * s * (hw + 1), 3.2, cz + nz * s * (hw + 1), 0.4, 6.4, 0.4, yaw, COLORS.gantry);
      batch.box(cx, 6.1, cz, width + 2.8, 0.5, 0.45, yaw, COLORS.gantry);
      batch.box(cx - dx * 0.3, 5.1, cz - dz * 0.3, Math.min(width, 6), 1.5, 0.08, yaw, COLORS.panel);
      continue;
    }
    if (f.kind === "street_lamp") {
      batch.box(px, 3.5, pz, 0.16, 7, 0.16, yaw, COLORS.pole);
      batch.box(px - nx * side * 0.8, 7, pz - nz * side * 0.8, 1.6, 0.1, 0.12, yaw + Math.PI / 2, COLORS.pole);
      batch.box(px - nx * side * 1.5, 6.9, pz - nz * side * 1.5, 0.45, 0.14, 0.25, yaw + Math.PI / 2, COLORS.lamp);
      continue;
    }
    if (f.kind === "bus_stop") {
      for (const s of [-1, 1]) batch.box(px + dx * s * 1.4, 1.2, pz + dz * s * 1.4, 0.1, 2.4, 0.1, yaw, COLORS.pole);
      batch.box(px, 2.45, pz, 1.8, 0.1, 3.2, yaw, COLORS.shelter);
      batch.box(px, 0.45, pz, 0.5, 0.1, 2.4, yaw, COLORS.bench);
      continue;
    }
    if (f.kind === "speed_camera") {
      batch.box(px, 2.5, pz, 0.14, 5, 0.14, yaw, COLORS.pole);
      batch.box(px - dx * 0.2, 5.1, pz - dz * 0.2, 0.3, 0.3, 0.6, yaw, COLORS.camera);
      continue;
    }
    if (f.kind === "traffic_signals") {
      batch.box(px, 2.6, pz, 0.14, 5.2, 0.14, yaw, COLORS.pole);
      batch.box(px, 4.7, pz, 0.38, 1.1, 0.3, yaw, COLORS.signalHead);
      batch.box(px - dx * 0.17, 5.05, pz - dz * 0.17, 0.2, 0.2, 0.05, yaw, COLORS.signalRed);
    } else if (f.kind === "stop_sign" || f.kind === "give_way_sign" || f.kind === "sign") {
      batch.box(px, 1.2, pz, 0.08, 2.4, 0.08, yaw, COLORS.pole);
      const color = f.kind === "stop_sign" ? COLORS.stop : f.kind === "give_way_sign" ? COLORS.giveWay : COLORS.sign;
      batch.box(px - dx * 0.06, 2.35, pz - dz * 0.06, 0.7, 0.7, 0.05, yaw, color);
    } else if (f.kind === "bollard") {
      batch.box(p.x, 0.45, p.z, 0.2, 0.9, 0.2, yaw, COLORS.bollard);
    }
  }
  // Sidewalks mapped as OSM tags on the road itself (sidewalk=left|right|both), unless a mapped footway already covers the edge.
  const covered = new Set(features.filter(x => x.kind === "sidewalk").map(x => x.edgeId));
  for (const edge of network.edges) {
    const tag = edge.osm?.sidewalk;
    if (!["left", "right", "both"].includes(tag) || covered.has(edge.id) || !(edge.centerline?.length >= 2)) continue;
    const hw = roadWidth(edge) / 2, sides = tag === "both" ? [1, -1] : [tag === "left" ? 1 : -1];
    for (let i = 1; i < edge.centerline.length; i++) {
      const a = edge.centerline[i - 1], b = edge.centerline[i], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.5) continue;
      const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len, off = hw + 1.0;
      for (const s of sides) batch.box((a.x + b.x) / 2 - uz * s * off, 0.07, (a.z + b.z) / 2 + ux * s * off, 1.6, 0.14, len, Math.atan2(ux, uz), COLORS.walk);
      counts.sidewalk_tagged = (counts.sidewalk_tagged || 0) + 1;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(batch.positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(batch.colors, 3));
  geometry.setIndex(batch.indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 }));
  mesh.name = "osm-road-features";
  mesh.userData = { counts, featureCount: features.length };
  if (batch.positions.length) group.add(mesh);
  group.userData = { counts, featureCount: features.length };
  return group;
}
