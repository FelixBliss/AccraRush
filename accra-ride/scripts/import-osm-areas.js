#!/usr/bin/env node
/**
 * Download OSM highway ways as overlapping 0.01° Overpass tiles.
 * Usage: node accra-ride/scripts/import-osm-areas.js
 */
import { mkdir, writeFile } from "node:fs/promises";
import { importOsmRoadNetwork, mergeOverpassTiles } from "../src/map/osm-import.js";

const AREAS = [
  { id:"accra-central", bounds:{south:5.525,west:-0.245,north:5.585,east:-0.165} },
  { id:"lapaz", bounds:{south:5.595,west:-0.295,north:5.665,east:-0.215} }
];
const ENDPOINTS = ["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];
const TILE = 0.01, sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
async function fetchTile(b) {
  const query = `[out:json][timeout:60];way["highway"](${b.south},${b.west},${b.north},${b.east});out body geom;`;
  let lastError;
  for (const endpoint of ENDPOINTS) {
    for (let attempt=0;attempt<4;attempt++) {
      try {
        const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {headers:{"user-agent":"AccraRush/0.1 OSM road importer (https://github.com/FelixBliss/AccraRush)"}});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.elements)) throw new Error("Overpass response has no elements array");
        return data;
      } catch (error) { lastError=error; await sleep(1200*(attempt+1)); }
    }
  }
  throw new Error(`Tile ${JSON.stringify(b)} failed: ${lastError?.message}`);
}
async function main() {
  await mkdir("accra-ride/data/osm", {recursive:true});
  for (const area of AREAS) {
    const tiles=[];
    for(let south=area.bounds.south;south<area.bounds.north-1e-8;south+=TILE) {
      for(let west=area.bounds.west;west<area.bounds.east-1e-8;west+=TILE) {
        const b={south,west,north:Math.min(south+TILE,area.bounds.north),east:Math.min(west+TILE,area.bounds.east)};
        process.stdout.write(`[${area.id}] fetching ${JSON.stringify(b)}\n`);
        tiles.push(await fetchTile(b)); await sleep(900);
      }
    }
    const elements=mergeOverpassTiles(tiles);
    const network=importOsmRoadNetwork({areaId:area.id,elements,bounds:area.bounds});
    const output={areaId:area.id,bounds:area.bounds,tiles:tiles.length,elementCount:elements.length,network};
    await writeFile(`accra-ride/data/osm/${area.id}.network.json`,JSON.stringify(output,null,2)+"\n");
    process.stdout.write(`[${area.id}] ways=${network.diagnostics.osmWays} nodes=${network.nodes.length} edges=${network.edges.length} components=${network.diagnostics.connectedComponents}\n`);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
