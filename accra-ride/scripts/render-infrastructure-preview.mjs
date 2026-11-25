#!/usr/bin/env node
/**
 * Geometry preview for AR-ROAD-01. Draws the real generated box geometry (footbridge, bus shelter,
 * median profiles) with a software oblique projection on a 2D canvas.
 * This is NOT the WebGL game: it has no lighting model, textures or Three.js, so it only proves what
 * shapes the generators emit. Usage: node render-infrastructure-preview.mjs <outDir>
 */
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { planFootbridge, appendFootbridge } from "../src/map/footbridge.js";
import { appendBusShelter } from "../src/map/bus-shelter.js";
import { appendMedianSegment, MEDIAN_PROFILES } from "../src/map/median-profiles.js";

const outDir = process.argv[2] || ".";
await mkdir(outDir, { recursive: true });
const { chromium } = createRequire(import.meta.url)("playwright");
// Long boxes are split into <=1.2 m chunks so the painter's sort by centre depth stays accurate.
class Rec {
  constructor() { this.boxes = []; }
  box(cx, cy, cz, sx, sy, sz, yaw, color, layer = 1) {
    const nx = Math.max(1, Math.ceil(sx / 1.2)), nz = Math.max(1, Math.ceil(sz / 1.2)), c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const lx = (i + 0.5) / nx * sx - sx / 2, lz = (j + 0.5) / nz * sz - sz / 2;
      this.boxes.push([cx + lx * c + lz * s, cy, cz - lx * s + lz * c, sx / nx, sy, sz / nz, yaw, color, layer]);
    }
  }
}
const ROAD = [0.23, 0.24, 0.26], GROUND = [0.55, 0.62, 0.45];
// Ground and road slabs are drawn first (layer 0): a painter's sort by centre depth would otherwise paint large slabs over structures.
const ground = (rec, x0, x1, z0, z1, color, layer = 0) => rec.box((x0 + x1) / 2, -0.05, (z0 + z1) / 2, x1 - x0, 0.1, z1 - z0, 0, color, layer);

// Scene 1: footbridge over a dual carriageway with a tiled median. Road runs along z, bridge spans x.
const bridge = new Rec();
ground(bridge, -22, 22, -26, 26, GROUND);
ground(bridge, -9.5, -1.5, -30, 30, ROAD, 0.5); ground(bridge, 1.5, 9.5, -30, 30, ROAD, 0.5);
appendMedianSegment(bridge, { a: { x: 0, z: -30 }, b: { x: 0, z: 30 }, widthM: 3, profileId: "tiled-block" });
// Road heading is +z: left normal of (0,1) is (-1,0), so the plan's +u points to -x.
appendFootbridge(bridge, planFootbridge({ crossSection: { leftOuterM: 9.5, rightOuterM: 9.5, median: { leftM: 1.5, rightM: -1.5 } } }), { x: 0, z: 0, heading: { x: 0, z: 1 } });

// Scene 2: bus shelter beside the road (shelter at x = -(4.2) facing the road at x = 0).
const shelter = new Rec();
ground(shelter, -14, 6, -8, 8, GROUND); ground(shelter, -3.5, 3.5, -8, 8, ROAD, 0.5);
appendBusShelter(shelter, { x: -4.2, z: 0, heading: { x: 0, z: 1 }, side: 1 });

// Scene 3: the four median profiles side by side (each 3 m wide, 14 m long).
const medians = new Rec();
ground(medians, -26, 26, -10, 10, ROAD, 0.5);
Object.keys(MEDIAN_PROFILES).forEach((id, i) => appendMedianSegment(medians, { a: { x: -18 + i * 12, z: -7 }, b: { x: -18 + i * 12, z: 7 }, widthM: 3, profileId: id }));

const scenes = [
  { file: "ar-road-01-footbridge.png", rec: bridge, az: -38, pitch: 26, scale: 26, cx: 0, cy: 3, cz: 0, title: "Procedural footbridge (software projection of generated geometry, not WebGL)" },
  { file: "ar-road-01-bus-shelter.png", rec: shelter, az: 30, pitch: 22, scale: 72, cx: -4.5, cy: 1.2, cz: 0, title: "Procedural bus shelter (software projection, not WebGL)" },
  { file: "ar-road-01-median-profiles.png", rec: medians, az: -62, pitch: 20, scale: 30, cx: -6, cy: 0.5, cz: 0, title: "Median profiles: tiled-block, mesh-fence, concrete-barrier, open (software projection)" }
];
const browser = await chromium.launch();
for (const scene of scenes) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.setContent("<body style='margin:0;background:#bcd7e8'><canvas id=c width=1280 height=720></canvas></body>");
  await page.evaluate(({ boxes, az, pitch, scale, cx, cy, cz, title }) => {
    const ctx = document.getElementById("c").getContext("2d"), A = az * Math.PI / 180, P = pitch * Math.PI / 180;
    const view = (x, y, z) => {
      const rx = x - cx, rz = z - cz, ry = y - cy;
      const x1 = rx * Math.cos(A) - rz * Math.sin(A), z1 = rx * Math.sin(A) + rz * Math.cos(A);
      return { sx: 640 + x1 * scale, sy: 400 - (ry * Math.cos(P) - z1 * Math.sin(P)) * scale, d: z1 * Math.cos(P) - ry * Math.sin(P) };
    };
    const faces = [];
    for (const [bx, by, bz, sx, sy, sz, yaw, col, layer] of boxes) {
      const c = Math.cos(yaw), s = Math.sin(yaw), V = [];
      for (const dy of [-1, 1]) for (const dz of [-1, 1]) for (const dx of [-1, 1]) {
        const lx = dx * sx / 2, lz = dz * sz / 2;
        V.push([bx + lx * c + lz * s, by + dy * sy / 2, bz - lx * s + lz * c]);
      }
      // index = (dy+1)/2*4 + (dz+1)/2*2 + (dx+1)/2
      for (const [idx, shade] of [[[4, 6, 7, 5], 1.0], [[0, 4, 5, 1], 0.78], [[2, 3, 7, 6], 0.7], [[0, 2, 6, 4], 0.62], [[1, 5, 7, 3], 0.85]]) {
        const pts = idx.map(i => view(...V[i])), depth = pts.reduce((a, p) => a + p.d, 0) / 4;
                faces.push({ pts, depth, layer, color: col.map(v => Math.round(Math.min(1, v * shade) * 255)) });
      }
    }
    faces.sort((a, b) => a.layer - b.layer || b.depth - a.depth);
    for (const f of faces) {
      ctx.beginPath(); f.pts.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy))); ctx.closePath();
      ctx.fillStyle = "rgb(" + f.color.join(",") + ")"; ctx.fill();
    }
    ctx.fillStyle = "#10283b"; ctx.font = "16px sans-serif"; ctx.fillText(title, 16, 26);
  }, { boxes: scene.rec.boxes, ...scene });
  await page.screenshot({ path: outDir + "/" + scene.file });
  await page.close();
  console.log("wrote", scene.file, scene.rec.boxes.length, "boxes");
}
await browser.close();
