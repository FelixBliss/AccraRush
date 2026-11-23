/**
 * Renders real OSM road features (see road-features.js) as one batched vertex-coloured mesh:
 * zebra crossings, signal poles/heads, stop/give-way/other signs, bollards, speed humps and
 * guard-rail style barriers. Only features that selectRoadFeatures() matched to the selected
 * graph are drawn, at their OSM positions.
 */
const COLORS = {
  stripe: [0.93, 0.92, 0.85], pole: [0.32, 0.34, 0.36], signalHead: [0.08, 0.09, 0.1], signalRed: [0.9, 0.12, 0.1],
  stop: [0.8, 0.08, 0.08], giveWay: [0.95, 0.95, 0.95], sign: [0.1, 0.35, 0.75], bollard: [0.9, 0.9, 0.9],\n  signRed: [0.82, 0.035, 0.035], signWhite: [0.96, 0.96, 0.92], signBlue: [0.035, 0.22, 0.58], signYellow: [0.98, 0.78, 0.06], signBlack: [0.04, 0.045, 0.05], signGreen: [0.06, 0.65, 0.2], signAmber: [0.98, 0.55, 0.04],
  hump: [0.9, 0.75, 0.1], rail: [0.62, 0.65, 0.68], lamp: [0.95, 0.9, 0.7], gantry: [0.45, 0.47, 0.5],
  panel: [0.05, 0.45, 0.25], shelter: [0.2, 0.45, 0.6], shelterGlass: [0.58, 0.72, 0.76], shelterRoof: [0.16, 0.2, 0.22],
  bench: [0.45, 0.3, 0.18], camera: [0.85, 0.85, 0.85], walk: [0.62, 0.62, 0.6], kerb: [0.53, 0.54, 0.52], stopBlue: [0.08, 0.28, 0.58], bin: [0.25, 0.34, 0.29]
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
    // corner index = (dy+1)/2*4 + (dz+1)/2*2 + (dx+1)/2.
    // Outward winding keeps the top visible from the driving camera.
    const f = (a, b, d, e) => this.indices.push(base + a, base + b, base + d, base + a, base + d, base + e);
    f(4, 6, 7, 5); // top
    f(0, 1, 3, 2); // bottom
    f(0, 4, 5, 1); f(2, 3, 7, 6); f(0, 2, 6, 4); f(1, 5, 7, 3);
  }
  polygon(cx, cy, cz, points, yaw, color) {
    const c = Math.cos(yaw), s = Math.sin(yaw), base = this.positions.length / 3;
    this.positions.push(cx, cy, cz); this.colors.push(...color);
    for (const [lx, ly] of points) {
      this.positions.push(cx + lx * c, cy + ly, cz - lx * s);
      this.colors.push(...color);
    }
    for (let i = 1; i < points.length - 1; i++) {
      this.indices.push(base, base + i, base + i + 1, base, base + i + 1, base + i);
    }
  }
  disc(cx, cy, cz, radius, yaw, color, segments = 24) {
    const points = Array.from({ length: segments }, (_, i) => {
      const a = i * Math.PI * 2 / segments;
      return [Math.cos(a) * radius, Math.sin(a) * radius];
    });
    this.polygon(cx, cy, cz, points, yaw, color);
  }
}

const roadWidth = edge => Math.max(3, (edge.lanes || []).reduce((s, l) => s + (l.widthM || 3.5), 0));
const DIGITS = {
  "0": ["a","b","c","d","e","f"], "1": ["b","c"], "2": ["a","b","g","e","d"],
  "3": ["a","b","g","c","d"], "4": ["f","g","b","c"], "5": ["a","f","g","c","d"],
  "6": ["a","f","g","e","c","d"], "7": ["a","b","c"], "8": ["a","b","c","d","e","f","g"],
  "9": ["a","b","c","d","f","g"]
};
function addSpeedDigits(batch, cx, cy, cz, yaw, value) {
  const digits = String(value).replace(/[^0-9]/g, "").slice(0, 3);
  const layouts = { a:[0,.15,.16,.045], g:[0,0,.16,.045], d:[0,-.15,.16,.045],
    f:[-.08,.075,.045,.14], b:[.08,.075,.045,.14], e:[-.08,-.075,.045,.14], c:[.08,-.075,.045,.14] };
  const c = Math.cos(yaw), sn = Math.sin(yaw), gap = digits.length === 3 ? .19 : .23;
  digits.split("").forEach((digit, index) => {
    const dx = (index - (digits.length - 1) / 2) * gap;
    for (const key of DIGITS[digit] || []) {
      const [ox, oy, w, h] = layouts[key], lx = dx + ox, front = -.105;
      const x = cx + lx * c + front * sn, z = cz - lx * sn + front * c;
      batch.box(x, cy + oy, z, w, h, .025, yaw, COLORS.signBlack);
    }
  });
}
function addSignPole(batch, px, pz, yaw) {
  batch.box(px, 1.45, pz, .12, 2.9, .12, yaw, COLORS.pole);
}

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
      // OSM-mapped footway geometry becomes a raised pavement slab with a kerb
      // on the carriageway-facing edge. The OSM side is retained by selectRoadFeatures().
      for (let i = 1; i < f.line.length; i++) {
        const a = f.line[i - 1], b = f.line[i], len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 0.1) continue;
        const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
        const nx = -uz, nz = ux, yaw = Math.atan2(ux, uz), side = f.side ?? 1;
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        batch.box(mx, 0.075, mz, 1.6, 0.15, len + 0.04, yaw, COLORS.walk);
        batch.box(mx - nx * side * 0.72, 0.14, mz - nz * side * 0.72, 0.18, 0.28, len + 0.04, yaw, COLORS.kerb);
      }
      continue;
    }
    const p = f.position;
    if (!p) continue;
    if (f.kind === "crossing") {
      // Zebra bars run across the full carriageway and are repeated along the road,
      // perpendicular to vehicle travel (not spaced across individual lanes).
      const stripeCount = Math.max(5, Math.min(9, Math.floor(width / .9)));
      for (let i = 0; i < stripeCount; i++) {
        const along = (i - (stripeCount - 1) / 2) * .62;
        batch.box(p.x + dx * along, 0.078, p.z + dz * along, width * .88, .016, .34, yaw, COLORS.stripe);
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
      // Full-width overhead structure: paired legs, base plates, twin cross-beams
      // and multiple sign panels spanning the selected carriageway.
      for (const s of [-1, 1]) {
        const gx = cx + nx * s * (hw + 1), gz = cz + nz * s * (hw + 1);
        batch.box(gx, 3.25, gz, 0.42, 6.5, 0.42, yaw, COLORS.gantry);
        batch.box(gx, 0.18, gz, 0.9, 0.22, 0.9, yaw, COLORS.gantry);
        batch.box(gx, 5.75, gz, 0.62, 0.16, 0.62, yaw, COLORS.gantry);
      }
      batch.box(cx, 6.25, cz, width + 3.0, 0.42, 0.5, yaw, COLORS.gantry);
      batch.box(cx, 5.82, cz, width + 2.6, 0.18, 0.28, yaw, COLORS.gantry);
      const panelCount = Math.max(2, Math.min(4, Math.ceil(width / 2.8)));
      const panelWidth = (width + 1.8) / panelCount;
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
    if (f.kind === "bus_stop") {
      // Distinguish a mapped shelter from a simple stop pole. Ghanaian OSM data
      // often records shelter/bench/bin explicitly; do not draw amenities tagged "no".
      const tags = f.osm?.tags ?? {};
      const hasShelter = tags.shelter === "yes";
      const hasBench = tags.bench === "yes";
      const hasBin = tags.bin === "yes";
      const sideX = dz, sideZ = -dx; // local across-road axis in world coordinates
      const signX = px + dx * 1.65, signZ = pz + dz * 1.65;
      batch.box(signX, 1.3, signZ, 0.09, 2.6, 0.09, yaw, COLORS.pole);
      batch.box(signX - dx * 0.06, 2.35, signZ - dz * 0.06, 0.72, 0.82, 0.08, yaw, COLORS.stopBlue);
      batch.box(signX - dx * 0.11, 2.36, signZ - dz * 0.11, 0.42, 0.08, 0.025, yaw, COLORS.giveWay);
      if (hasShelter) {
        // Open-front shelter: roof, four supports, rear glazing and two side screens.
        // Local X spans the pavement depth; local Z follows the road.
        const across = 1.55, along = 3.1, depth = 1.55, h = 2.25;
        batch.box(px, h, pz, across, 0.14, along, yaw, COLORS.shelterRoof);
        for (const sx of [-1, 1]) for (const sz of [-1, 1])
          batch.box(px + sideX * sx * across * 0.46, h / 2, pz + sideZ * sx * across * 0.46 + dz * sz * (along / 2 - 0.08), 0.09, h, 0.09, yaw, COLORS.pole);
        // Rear panel is opposite the road; the front remains open for boarding.
        batch.box(px - sideX * side * (depth / 2 - 0.07), 1.15, pz - sideZ * side * (depth / 2 - 0.07), 0.055, 1.9, along - 0.28, yaw, COLORS.shelterGlass);
        for (const sz of [-1, 1])
          batch.box(px + dx * sz * (along / 2 - 0.1), 1.12, pz + dz * sz * (along / 2 - 0.1), depth, 1.8, 0.055, yaw, COLORS.shelterGlass);
        // Roof fascia and a slim lower rear rail give the shelter a readable frame.
        batch.box(px, 2.12, pz - dz * 0.02, across, 0.08, 0.08, yaw, COLORS.pole);
        batch.box(px - sideX * side * (depth / 2 - 0.04), 0.42, pz - sideZ * side * (depth / 2 - 0.04), 0.08, 0.08, along - 0.25, yaw, COLORS.pole);
      }
      if (hasBench) {
        const bx = px - sideX * side * 0.05, bz = pz - sideZ * side * 0.05;
        batch.box(bx, 0.48, bz, 0.48, 0.08, 1.9, yaw, COLORS.bench);
        batch.box(bx - side * 0.2, 0.82, bz, 0.08, 0.58, 1.9, yaw, COLORS.bench);
        for (const zoff of [-0.72, 0.72])
          batch.box(bx + dx * zoff, 0.24, bz + dz * zoff, 0.42, 0.48, 0.08, yaw, COLORS.pole);
      }
      if (hasBin) {
        batch.box(px + side * 0.48, 0.48, pz - dz * 1.15, 0.34, 0.82, 0.34, yaw, COLORS.bin);
        batch.box(px + sideX * side * 0.48 - dx * 1.15, 0.9, pz + sideZ * side * 0.48 - dz * 1.15, 0.38, 0.08, 0.38, yaw, COLORS.pole);
      }
      continue;
    }
    if (f.kind === "speed_camera") {
      batch.box(px, 2.5, pz, 0.14, 5, 0.14, yaw, COLORS.pole);
      batch.box(px - dx * 0.2, 5.1, pz - dz * 0.2, 0.3, 0.3, 0.6, yaw, COLORS.camera);
      continue;
    }
    if (f.kind === "traffic_signals") {
      addSignPole(batch, px, pz, yaw);
      batch.box(px, 4.8, pz, .48, 1.35, .34, yaw, COLORS.signalHead);
      for (const [y, color] of [[5.2, COLORS.signalRed], [4.8, COLORS.signAmber], [4.4, COLORS.signGreen]])
        batch.disc(px - dx * .19, y, pz - dz * .19, .13, yaw, color, 16);
    } else if (f.kind === "speed_limit") {
      addSignPole(batch, px, pz, yaw);
      const tags = f.osm?.tags ?? {}, raw = String(tags.maxspeed ?? tags.traffic_sign ?? "");
      const value = raw.match(/[0-9]{1,3}/)?.[0] ?? "50";
      const sx = px - dx * .08, sz = pz - dz * .08;
      batch.disc(sx, 2.72, sz, .55, yaw, COLORS.signRed);
      batch.disc(sx - dx * .035, 2.72, sz - dz * .035, .45, yaw, COLORS.signWhite);
      addSpeedDigits(batch, sx, 2.72, sz, yaw, value);
    } else if (f.kind === "roundabout_sign" || f.kind === "roundabout") {
      addSignPole(batch, px, pz, yaw);
      const sx = px - dx * .08, sz = pz - dz * .08;
      batch.box(sx, 2.72, sz, .96, .96, .08, yaw, COLORS.signBlue);
      batch.disc(sx - dx * .055, 2.72, sz - dz * .055, .34, yaw, COLORS.signWhite);
      batch.disc(sx - dx * .075, 2.72, sz - dz * .075, .23, yaw, COLORS.signBlue);
      // Three arrowheads around the white ring communicate circulating traffic.
      for (const [ox, oy, rot] of [[0,.27,0],[.25,-.12,2.1],[-.25,-.12,-2.1]]) {
        const x = sx + ox * Math.cos(yaw), z = sz - ox * Math.sin(yaw);
        const a = rot + yaw, pts = [[0,.11],[-.07,-.06],[.07,-.06]];
        batch.polygon(x - dx * .09, 2.72 + oy, z - dz * .09, pts.map(([u,v])=>[u*Math.cos(a-yaw)-v*Math.sin(a-yaw),u*Math.sin(a-yaw)+v*Math.cos(a-yaw)]), yaw, COLORS.signWhite);
      }
    } else if (f.kind === "no_entry_sign") {
      addSignPole(batch, px, pz, yaw);
      const sx = px - dx * .08, sz = pz - dz * .08;
      batch.disc(sx, 2.72, sz, .48, yaw, COLORS.signRed);
      batch.box(sx - dx * .06, 2.72, sz - dz * .06, .62, .13, .045, yaw, COLORS.signWhite);
    } else if (f.kind === "give_way_sign") {
      addSignPole(batch, px, pz, yaw);
      const sx = px - dx * .08, sz = pz - dz * .08;
      const triangle = [[-.48,.36],[.48,.36],[0,-.48]];
      batch.polygon(sx, 2.72, sz, triangle, yaw, COLORS.signRed);
      batch.polygon(sx - dx * .025, 2.72, sz - dz * .025, triangle.map(([x,y])=>[x*.82,y*.82]), yaw, COLORS.signWhite);
    } else if (f.kind === "stop_sign") {
      addSignPole(batch, px, pz, yaw);
      const sx = px - dx * .08, sz = pz - dz * .08;
      const oct = Array.from({length:8},(_,i)=>{const a=Math.PI/8+i*Math.PI/4;return [.46*Math.cos(a),.46*Math.sin(a)];});
      batch.polygon(sx, 2.72, sz, oct, yaw, COLORS.signRed);
      batch.box(sx - dx * .04, 2.72, sz - dz * .04, .38, .055, .025, yaw, COLORS.signWhite);
    } else if (f.kind === "one_way_sign") {
      addSignPole(batch, px, pz, yaw);
      const sx = px - dx * .08, sz = pz - dz * .08;
      batch.box(sx, 2.72, sz, .92, .62, .08, yaw, COLORS.signBlue);
      batch.box(sx - dx * .05, 2.72, sz - dz * .05, .1, .34, .03, yaw, COLORS.signWhite);
      batch.polygon(sx - dx * .07, 2.72, sz - dz * .07, [[-.22,-.06],[.22,-.06],[0,.22]], yaw, COLORS.signWhite);
    } else if (f.kind === "warning_sign" || f.kind === "pedestrian_sign") {
      addSignPole(batch, px, pz, yaw);
      const sx = px - dx * .08, sz = pz - dz * .08;
      if (f.kind === "warning_sign") {
        batch.polygon(sx, 2.72, sz, [[0,.52],[-.48,-.38],[.48,-.38]], yaw, COLORS.signYellow);
        batch.polygon(sx - dx * .025, 2.72, sz - dz * .025, [[0,.38],[-.34,-.28],[.34,-.28]], yaw, COLORS.signBlack);
      } else {
        batch.box(sx, 2.72, sz, .88, .88, .08, yaw, COLORS.signBlue);
        batch.polygon(sx - dx * .06, 2.72, sz - dz * .06, [[0,.3],[-.25,-.2],[.25,-.2]], yaw, COLORS.signWhite);
      }
    } else if (f.kind === "sign") {
      addSignPole(batch, px, pz, yaw);
      batch.box(px - dx * .08, 2.72, pz - dz * .08, .88, .88, .08, yaw, COLORS.signBlue);
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
      for (const s of sides) {
        const mx = (a.x + b.x) / 2 - uz * s * off, mz = (a.z + b.z) / 2 + ux * s * off;
        const yaw = Math.atan2(ux, uz);
        batch.box(mx, 0.075, mz, 1.6, 0.15, len + 0.04, yaw, COLORS.walk);
        // Raised kerb sits on the road-facing edge of the mapped pavement.
        batch.box(mx + uz * s * 0.72, 0.14, mz - ux * s * 0.72, 0.18, 0.28, len + 0.04, yaw, COLORS.kerb);
      }
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
