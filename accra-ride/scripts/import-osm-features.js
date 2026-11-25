#!/usr/bin/env node
/**
 * Extract real OSM point/line road features (crossings, signals, stop/give-way and other
 * signs, bollards, speed humps, guard-rail style barriers) for Accra Central and Lapaz
 * from the SAME Geofabrik Ghana PBF used for the road networks. Writes
 * data/osm/<area>.features.json in the networks' local metric frame. The road networks
 * themselves are not touched.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { classifyFeature, projectToLocal } from "../src/map/road-features.js";

const AREAS = [
  // AR-ROAD-01 corridor bounds: Lapaz start (5.6095021,-0.2507127)
  // to the OSM Akweteyman landmark (5.6110956,-0.231767), with a
  // 300–400 m local infrastructure margin. Selected-road matching later
  // removes unrelated features outside the playable route graph.
  { id: "lapaz", bounds: { south: 5.6060, west: -0.2545, north: 5.6147, east: -0.2278 } }
];
const PBF = process.env.OSM_PBF_PATH || "accra-ride/data/osm/ghana-latest.osm.pbf";
const OUT = "accra-ride/data/osm";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(cmd + " " + args.join(" ") + " failed: " + (r.stderr || r.stdout));
}

async function importArea(area) {
  const b = area.bounds, bbox = [b.west, b.south, b.east, b.north].join(",");
  const clip = OUT + "/" + area.id + ".features.osm.pbf", filtered = OUT + "/" + area.id + ".features.filtered.osm.pbf", seq = OUT + "/" + area.id + ".features.geojsonseq";
  run("osmium", ["extract", "-b", bbox, "--strategy=complete_ways", "--overwrite", "-o", clip, PBF]);
  run("osmium", ["tags-filter", "--overwrite", "-o", filtered, clip,
    "n/highway=crossing,traffic_signals,stop,give_way", "n/crossing", "n/traffic_sign", "n/barrier=bollard", "n/traffic_calming",
    "n/highway=street_lamp,bus_stop,speed_camera", "n/man_made=gantry", "w/man_made=gantry", "w/footway=sidewalk", "w/highway=footway,path",
    "w/barrier=guard_rail,jersey_barrier,cable_barrier"]);
  run("osmium", ["export", "-f", "geojsonseq", "--add-unique-id=type_id", "--overwrite", "-o", seq, filtered]);
  const origin = { lat: (b.south + b.north) / 2, lon: (b.west + b.east) / 2 };
  const features = [];
  for (const raw of (await readFile(seq, "utf8")).split(/\r?\n/)) {
    const line = raw.trim().replace(/^\u001e/, "");
    if (!line) continue;
    const f = JSON.parse(line), props = f.properties ?? {}, id = String(props["@id"] ?? f.id ?? "");
    const tags = Object.fromEntries(Object.entries(props).filter(([k]) => !k.startsWith("@") && k !== "id"));
    if (f.geometry?.type === "Point") {
      const kind = classifyFeature(tags, "point");
      if (!kind) continue;
      const [lon, lat] = f.geometry.coordinates;
      features.push({ id, kind, position: projectToLocal(lat, lon, origin), osm: { lat, lon, tags } });
    } else if (f.geometry?.type === "LineString") {
      const kind = classifyFeature(tags, "line");
      if (!kind) continue;
      const pts = f.geometry.coordinates.map(([lon, lat]) => projectToLocal(lat, lon, origin));
      if (pts.length >= 2) features.push(kind === "gantry"
        ? { id, kind, position: pts[Math.floor(pts.length / 2)], osm: { tags } } : { id, kind, line: pts, osm: { tags } });
    }
  }
  const counts = features.reduce((a, x) => (a[x.kind] = (a[x.kind] ?? 0) + 1, a), {});
  await writeFile(OUT + "/" + area.id + ".features.json", JSON.stringify({
    areaId: area.id, bounds: b, projection: { type: "local-equirectangular", origin },
    source: { provider: "OpenStreetMap via Geofabrik", license: "ODbL-1.0", attribution: "© OpenStreetMap contributors" },
    counts, features
  }) + "\n");
  console.log("[" + area.id + "] features", JSON.stringify(counts));
}

await mkdir(OUT, { recursive: true });
for (const area of AREAS) await importArea(area);
