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

The import is accepted only if both areas are generated and graph validation plus targeted tests pass. Dataset existence alone is not acceptance. Inspect geographic coverage and connectivity before renderer integration.

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
