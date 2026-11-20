# AccraRush OSM area import

This pipeline builds the AccraRush road networks from one regional OpenStreetMap PBF download. It no longer queries public Overpass servers.

## Source and geographic coverage

Source: [Geofabrik Ghana OSM extract](https://download.geofabrik.de/africa/ghana.html), downloaded from `https://download.geofabrik.de/africa/ghana-latest.osm.pbf`.

| Area | South | West | North | East |
|---|---:|---:|---:|---:|
| Accra Central | 5.525 | -0.245 | 5.585 | -0.165 |
| Lapaz | 5.595 | -0.295 | 5.665 | -0.215 |

The workflow downloads the Ghana PBF once, installs Osmium, then extracts each existing area with the `complete_ways` strategy. Osmium exports line geometries as GeoJSONSeq; the importer converts those features into the existing AccraRush graph contract. No Overpass endpoint or tile request is used.

## Run

Requirements: Node.js 22, `osmium-tool`, and the Geofabrik Ghana PBF at `accra-ride/data/osm/ghana-latest.osm.pbf`.

```sh
sudo apt-get install osmium-tool
curl -L https://download.geofabrik.de/africa/ghana-latest.osm.pbf -o accra-ride/data/osm/ghana-latest.osm.pbf
node accra-ride/scripts/import-osm-areas.js
node --test accra-ride/tests/osm-import.test.js accra-ride/tests/road-navigation.test.js
```

Or manually run **Import Accra OSM road networks** in GitHub Actions on `feature/osm-accra-central-lapaz-import`.

## Outputs

- `accra-central.network.json` and `lapaz.network.json`: generated road graph datasets.
- `accra-central.osm.pbf` and `lapaz.osm.pbf`: bounded source extracts.
- `import-report.json`: source, bounds, way/node/edge counts, components, junctions, dead ends and road classes.
- `independent-validation-report.json`: separately computed bounds, geometry, connectivity, coverage, junction, lane-direction and route-reachability audit.

The import is accepted only if both areas are generated, targeted tests pass, and the independent audit reports `passed` for both areas. Dataset existence or importer self-validation alone is not acceptance.

## Playable OSM runtime

The production entry point `accrarush.html` loads only the selected area's generated network when a drive starts. The previous synthetic straight highway and hard-coded traffic loop are removed from the playable scene.

- Three.js road geometry is batched by OSM highway class to keep draw calls low.
- Player movement samples real directed road centreline geometry in metres; reverse gear travels back along the same route.
- AI cars and motorcycles receive routes generated from the directed OSM graph and spawn near the player's route.
- AI speed matching follows vehicles ahead on the same directed edge. Passing is permitted only on suitable wider one-way or clear wide two-way roads.
- Player steering is clamped to the available road width.
- The map menu offers Accra Central and Lapaz as real OSM free-drive areas, not fictional landmark loops.
- OpenStreetMap attribution is shown during gameplay.

The automated workflow tests both real datasets for multi-edge player/AI route generation and route sampling, in addition to the independent audit.

## Manual Android acceptance still required

Automated graph and source checks do not replace in-game validation. Before calling renderer, navigation or AI traffic production-complete, manually drive both areas on an Android landscape build and confirm:

1. The full road network renders without missing tiles, broken joins or severe frame drops.
2. Player movement follows curved roads and turns at real junctions.
3. Reverse gear follows the same road in the opposite direction.
4. AI traffic stays on valid road geometry, respects one-way direction and avoids collisions.
5. AI overtaking occurs only where the road width and opposing traffic make it safe.
6. Multiple routes can be completed in both Accra Central and Lapaz without stuck transitions.

Keep production `master` unchanged until these manual acceptance gates pass.

## Phase 4 acceptance gates

1. Both complete datasets exist and are independently reviewed for bounds, road-class distribution and geographic coverage.
2. No malformed edges, duplicate IDs or dangling endpoints; components, junctions and dead ends are reviewed.
3. Both areas render in the actual playable Three.js scene.
4. Player routes traverse multiple junctions and branches without gaps or stuck transitions.
5. AI traffic completes legal directed routes in both areas without stranding or disappearing.
6. Android landscape build is manually driven through representative routes in both areas.

Keep production `master` unchanged until every gate passes.

## Attribution and licensing

Road data © OpenStreetMap contributors, licensed under ODbL. Preserve attribution and source metadata in the game and comply with ODbL when distributing adapted databases. See https://www.openstreetmap.org/copyright and https://www.geofabrik.de/data/download.html.
