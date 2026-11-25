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
  constructor() { this.positions = []; this.colors = []; this.indices = []; this.yOffset = 0; }
  box(cx, cy, cz, sx, sy, sz, yaw, color) {
    // yaw rotates about Y; sx across (local x), sz along (local z)
    const c = Math.cos(yaw), s = Math.sin(yaw), base = this.positions.length / 3;
    const corners = [];
    for (const dy of [-1, 1]) for (const dz of [-1, 1]) for (const dx of [-1, 1]) {
      const lx = dx * sx / 2, lz = dz * sz / 2;
      corners.push([cx + lx * c + lz * s, cy + this.yOffset + dy * sy / 2, cz - lx * s + lz * c]);
    }
    for (const p of corners) { this.positions.push(...p); this.colors.push(...color); }
    // corner index = (dy+1)/2*4 + (dz+1)/2*2 + (dx+1)/2.
    // Outward winding keeps the top visible from the driving camera.
    const f = (a, b, d, e) => this.indices.push(base + a, base + b, base + d, base + a, base + d, base + e);
    f(4, 6, 7, 5); // top
    f(0, 1, 3, 2); // bottom
    f(0, 4, 5, 1); f(2, 3, 7, 6); f(0, 2, 6, 4); f(1, 5, 7, 3);
  }
}

const roadWidth = edge => Math.max(3, (edge.lanes || []).reduce((s, l) => s + (l.widthM || 3.5), 0));
const shoulderWidthForEdge = edge => ({
  motorway: 1.0, motorway_link: 0.55, trunk: 0.9, trunk_link: 0.55,
  primary: 0.65, primary_link: 0.45, secondary: 0.45, secondary_link: 0.35,
  tertiary: 0.3, tertiary_link: 0.25, residential: 0.2, unclassified: 0.2, service: 0.15
}[edge.osm?.highway] ?? 0);
function fullRoadCorridorWidth(network, centre, roadDx, roadDz, baseWidth) {
  const nx = -roadDz, nz = roadDx;
  let minAcross = -baseWidth / 2, maxAcross = baseWidth / 2;
  for (const edge of network.edges) {
    if (!(edge.centerline?.length >= 2)) continue;
    const halfWidth = (roadWidth(edge) + shoulderWidthForEdge(edge)) / 2;
    for (let i = 1; i < edge.centerline.length; i++) {
      const a = edge.centerline[i - 1], b = edge.centerline[i];
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (length < 0.5 || Math.abs((dx / length) * roadDx + (dz / length) * roadDz) < 0.72) continue;
      const t = Math.max(0, Math.min(1, ((centre.x - a.x) * dx + (centre.z - a.z) * dz) / (length * length)));
      const px = a.x + dx * t, pz = a.z + dz * t;
      if (Math.hypot(centre.x - px, centre.z - pz) > 65) continue;
      const across = (px - centre.x) * nx + (pz - centre.z) * nz;
      minAcross = Math.min(minAcross, across - halfWidth);
      maxAcross = Math.max(maxAcross, across + halfWidth);
    }
  }
  return maxAcross - minAcross;
}
const sidewalkWidth = edge => ({
  motorway: 2.8, trunk: 2.8, primary: 2.8, secondary: 2.4,
  tertiary: 2.2, residential: 1.9, unclassified: 1.9, service: 1.8
}[edge.osm?.highway] ?? 2.0);

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
    batch.yOffset = f.position?.y ?? (f.line?.length
      ? f.line.reduce((sum, point) => sum + (point.y || 0), 0) / f.line.length
      : 0);
    const dx = f.heading?.x ?? 1, dz = f.heading?.z ?? 0, yaw = Math.atan2(dx, dz);
    const nx = -dz, nz = dx; // left normal
    counts[f.kind] = (counts[f.kind] || 0) + 1;
    if (f.kind === "pedestrian_bridge" && f.line?.length >= 2) {
      const first = f.line[0], last = f.line[f.line.length - 1];
      const cx = f.line.reduce((sum, p) => sum + p.x, 0) / f.line.length;
      const cz = f.line.reduce((sum, p) => sum + p.z, 0) / f.line.length;
      const lineDx = last.x - first.x, lineDz = last.z - first.z;
      const lineLength = Math.hypot(lineDx, lineDz);
      if (lineLength < 2) continue;
      const bridgeDx = lineDx / lineLength, bridgeDz = lineDz / lineLength;
      const roadDx = f.heading?.x ?? bridgeDz, roadDz = f.heading?.z ?? -bridgeDx;
      let minAcross = -lineLength / 2, maxAcross = lineLength / 2;
      // Expand the deck to the full local road corridor where parallel OSM
      // carriageways exist; this avoids drawing a bridge over only one side.
      for (const candidate of network.edges) {
        if (!(candidate.centerline?.length >= 2)) continue;
        const candidateWidth = roadWidth(candidate) + shoulderWidthForEdge(candidate);
        for (let i = 1; i < candidate.centerline.length; i++) {
          const a = candidate.centerline[i - 1], b = candidate.centerline[i];
          const sx = b.x - a.x, sz = b.z - a.z, segLength = Math.hypot(sx, sz);
          if (segLength < 0.5 || Math.abs((sx / segLength) * roadDx + (sz / segLength) * roadDz) < 0.72) continue;
          const vx = b.x - a.x, vz = b.z - a.z, lengthSq = vx * vx + vz * vz;
          const t = Math.max(0, Math.min(1, ((cx - a.x) * vx + (cz - a.z) * vz) / lengthSq));
          const px = a.x + vx * t, pz = a.z + vz * t;
          if (Math.hypot(cx - px, cz - pz) > 65) continue;
          const across = (px - cx) * bridgeDx + (pz - cz) * bridgeDz;
          minAcross = Math.min(minAcross, across - candidateWidth / 2);
          maxAcross = Math.max(maxAcross, across + candidateWidth / 2);
        }
      }
      const span = Math.max(lineLength, maxAcross - minAcross) + 1.2;
      const yawBridge = Math.atan2(bridgeDx, bridgeDz);
      const deckY = 5.2; // Batch.yOffset supplies the surveyed road elevation
      batch.box(cx, deckY, cz, 3.4, 0.28, span, yawBridge, COLORS.gantry);
      // Parapets run along both edges of the full-span deck.
      for (const side of [-1, 1]) {
        const offset = side * 1.58;
        batch.box(cx - bridgeDz * offset, deckY + 0.62, cz + bridgeDx * offset,
          0.12, 1.0, span, yawBridge, COLORS.rail);
      }
      // Simple stair/ramp landings at both ends, outside the road span.
      for (const end of [-1, 1]) {
        const along = end * (span / 2 + 1.4);
        batch.box(cx + bridgeDx * along, deckY - 1.05, cz + bridgeDz * along,
          2.4, 0.16, 2.8, yawBridge, COLORS.walk);
      }
      counts.pedestrian_bridge_span_m = Math.max(counts.pedestrian_bridge_span_m || 0, Number(span.toFixed(1)));
      continue;
    }
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
        const pathYaw = Math.atan2(b.x - a.x, b.z - a.z);
        const pathWidth = sidewalkWidth(edge);
        batch.box((a.x + b.x) / 2, 0.07, (a.z + b.z) / 2, pathWidth, 0.14, len, pathYaw, COLORS.walk);
        for (const side of [-1, 1]) batch.box(
          (a.x + b.x) / 2 - (b.z - a.z) / len * side * pathWidth / 2,
          0.13,
          (a.z + b.z) / 2 + (b.x - a.x) / len * side * pathWidth / 2,
          0.12, 0.18, len, pathYaw, COLORS.rail
        );
      }
      continue;
    }
    const p = f.position;
    if (!p) continue;
    if (f.kind === "crossing") {
      // Zebra bars are inset inside the actual carriageway width so no stripe
      // reaches a kerb, walkway, verge or adjacent environment mesh.
      const crossingWidth = Math.max(2, width - 0.5);
      const n = Math.max(3, Math.floor(crossingWidth / 1.0));
      for (let i = 0; i < n; i++) {
        const off = -crossingWidth / 2 + (i + 0.5) * (crossingWidth / n);
        batch.box(p.x + nx * off, 0.075, p.z + nz * off, crossingWidth / n * 0.48, 0.01, 3, yaw, COLORS.stripe);
      }
      // Authored pedestrian signal heads at both kerb approaches; mapped vehicle
      // signals remain separately rendered from their OSM nodes.
      for (const side of [-1, 1]) {
        const sx = p.x + nx * side * (hw + 0.85), sz = p.z + nz * side * (hw + 0.85);
        batch.box(sx, 1.45, sz, 0.12, 2.9, 0.12, yaw, COLORS.pole);
        batch.box(sx, 2.65, sz, 0.38, 0.62, 0.24, yaw, COLORS.signalHead);
        batch.box(sx - dx * 0.13, 2.79, sz - dz * 0.13, 0.16, 0.13, 0.035, yaw, COLORS.signalRed);
        batch.box(sx - dx * 0.13, 2.51, sz - dz * 0.13, 0.16, 0.13, 0.035, yaw, COLORS.lamp);
      }
      counts.pedestrian_signal_heads = (counts.pedestrian_signal_heads || 0) + 2;
      continue;
    }
    if (f.kind === "speed_hump") { batch.box(p.x, 0.04, p.z, width, 0.08, 0.7, yaw + Math.PI / 2, COLORS.hump); continue; }
    // Poles stand at the road edge on the side the OSM node lies on (right-hand side if on the centreline).
    const side = f.side ?? -1; // +1 = left of travel
    const dist = ["bus_stop", "pickup_zone"].includes(f.kind) && f.accessBay
      ? hw + shoulderWidthForEdge(edge) + 0.75 + (f.accessBayType === "pickup" ? 1.6 : 1.75) + 1.3
      : Math.max(f.offsetM ?? 0, hw + 0.7);
    const cx = p.x - nx * side * (f.offsetM ?? 0), cz = p.z - nz * side * (f.offsetM ?? 0); // point on the centreline
    const px = cx + nx * side * dist, pz = cz + nz * side * dist;
    if (f.kind === "gantry") {
      // Measure all nearby parallel carriageways so an overhead gantry spans
      // the complete local divided road rather than stopping at one carriageway.
      const spanWidth = fullRoadCorridorWidth(network, { x: cx, z: cz }, dx, dz, width);
      for (const s of [-1, 1]) {
        const gx = cx + nx * s * (spanWidth / 2 + 1), gz = cz + nz * s * (spanWidth / 2 + 1);
        batch.box(gx, 3.25, gz, 0.42, 6.5, 0.42, yaw, COLORS.gantry);
        batch.box(gx, 0.18, gz, 0.9, 0.22, 0.9, yaw, COLORS.gantry);
        batch.box(gx, 5.75, gz, 0.62, 0.16, 0.62, yaw, COLORS.gantry);
      }
      batch.box(cx, 6.25, cz, spanWidth + 3.0, 0.42, 0.5, yaw, COLORS.gantry);
      batch.box(cx, 5.82, cz, spanWidth + 2.6, 0.18, 0.28, yaw, COLORS.gantry);
      const panelCount = Math.max(2, Math.min(6, Math.ceil(spanWidth / 2.8)));
      const panelWidth = (spanWidth + 1.8) / panelCount;
      counts.gantry_span_m = Math.max(counts.gantry_span_m || 0, Number(spanWidth.toFixed(1)));
      for (let i = 0; i < panelCount; i++) {
        const offset = (i - (panelCount - 1) / 2) * panelWidth;
        const sx = cx + nx * offset - dx * 0.34, sz = cz + nz * offset - dz * 0.34;
        batch.box(sx, 5.05, sz, panelWidth - 0.12, 1.35, 0.12, yaw, COLORS.panel);
        // White lane/direction legend bars keep the overhead signs legible at game scale.
        batch.box(sx, 5.22, sz - dz * 0.075, panelWidth * 0.42, 0.08, 0.025, yaw, COLORS.giveWay);
        batch.box(sx, 4.94, sz - dz * 0.075, panelWidth * 0.25, 0.07, 0.025, yaw, COLORS.giveWay);
      }
      continue;
    }
    if (f.kind === "street_lamp") {
      batch.box(px, 3.5, pz, 0.16, 7, 0.16, yaw, COLORS.pole);
      batch.box(px - nx * side * 0.8, 7, pz - nz * side * 0.8, 1.6, 0.1, 0.12, yaw + Math.PI / 2, COLORS.pole);
      batch.box(px - nx * side * 1.5, 6.9, pz - nz * side * 1.5, 0.45, 0.14, 0.25, yaw + Math.PI / 2, COLORS.lamp);
      continue;
    }
    if (f.kind === "pickup_zone") {
      batch.box(px, 0.14, pz, 2.5, 0.18, 4.0, yaw, COLORS.walk);
      batch.box(px, 2.2, pz, 1.9, 0.12, 3.0, yaw, COLORS.shelter);
      for (const side of [-1, 1]) {
        batch.box(px + dx * side * 1.25, 1.15, pz + dz * side * 1.25, 0.1, 2.3, 0.1, yaw, COLORS.pole);
      }
      batch.box(px + dx * 1.0, 1.1, pz + dz * 1.0, 0.35, 0.9, 0.12, yaw, COLORS.signalHead);
      continue;
    }
    if (f.kind === "bus_stop") {
      if (f.accessBay) batch.box(px, 0.14, pz, 2.8, 0.18, 4.5, yaw, COLORS.walk);
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
  batch.yOffset = 0;
  // Sidewalks mapped as OSM tags on the road itself (sidewalk=left|right|both), unless a mapped footway already covers the edge.
  const covered = new Set(features.filter(x => x.kind === "sidewalk").map(x => x.edgeId));
  for (const edge of network.edges) {
    const tag = edge.osm?.sidewalk;
    if (!["left", "right", "both"].includes(tag) || covered.has(edge.id) || !(edge.centerline?.length >= 2)) continue;
    const hw = roadWidth(edge) / 2 + shoulderWidthForEdge(edge), sides = tag === "both" ? [1, -1] : [tag === "left" ? 1 : -1];
    for (let i = 1; i < edge.centerline.length; i++) {
      const a = edge.centerline[i - 1], b = edge.centerline[i], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.5) continue;
      const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len, off = hw + 1.0;
      batch.yOffset = (a.y + b.y) / 2;
      for (const s of sides) {
        const width = sidewalkWidth(edge), yaw = Math.atan2(ux, uz);
        const cx = (a.x + b.x) / 2 - uz * s * off, cz = (a.z + b.z) / 2 + ux * s * off;
        batch.box(cx, 0.07, cz, width, 0.14, len, yaw, COLORS.walk);
        for (const curbSide of [-1, 1]) batch.box(
          cx - uz * s * curbSide * width / 2, 0.13, cz + ux * s * curbSide * width / 2,
          0.12, 0.18, len, yaw, COLORS.rail
        );
      }
      counts.sidewalk_tagged = (counts.sidewalk_tagged || 0) + 1;
    }
  }
  batch.yOffset = 0;
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
