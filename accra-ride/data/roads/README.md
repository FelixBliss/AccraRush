# Road network data

This directory contains versioned OpenStreetMap-derived area packages for the production road graph.

## Area package
- manifest.json: area ID, schema version, CRS, local origin, tile coverage, provenance, quality gates and counts.
- network.json: nodes, directed edges, directional travel corridors, junction candidates and turn-restriction status.
- source-index.json: original OSM way IDs, versions, tags, node references and imported turn restrictions.
- landmarks.json: POIs; currently not extracted.

## Coordinate contract
Source coordinates are WGS84 longitude/latitude. Project to EPSG:32630 (UTM zone 30N), store easting/northing in metres, then transform to Three.js: X=easting-originEasting, Y=elevation-originElevation, Z=-(northing-originNorthing). One world unit is one metre. Minimap pixel/metre scaling is presentation only.

## Import rules
1. Preserve OSM way/node/relation IDs, versions and tags.
2. Split ways at shared OSM nodes. A visual crossing is not enough to create a junction.
3. Preserve explicit one-way tags and turn restrictions. Unknown directions and cross-way turns remain unavailable to routing.
4. Keep missing lane widths, lane counts, speed limits and elevations unknown.
5. Exclude non-motor road classes and explicitly motor-vehicle-prohibited ways from the drivable graph; retain exclusions in source-index.
6. Validate connectivity, legal movements, geometry lengths and area gateways before production.

## Imported data status — 19 November 2026

Both launch areas now have partial OSM extracts:
- Accra Central: 827 motor-road ways, 1,458 graph edges, 1,182 graph nodes, 878 junction candidates; 3 selected 0.01-degree tiles.
- Lapaz: 630 motor-road ways, 1,090 graph edges, 897 graph nodes, 638 junction candidates; 3 selected 0.01-degree tiles.

All imported motor-road ways in these selected tiles are represented by one or more graph edges. These packages are deliberately marked partial and productionReady=false. They do not cover the complete selectable areas. Cross-way junction movements remain unknown unless an OSM restriction relation was successfully applied; default bidirectional directions without an explicit direction tag are also marked unknown. Do not use these packages for live routing, AI traffic or missions yet.

Attribution: © OpenStreetMap contributors. Data is available under the Open Database License (ODbL) 1.0. See https://www.openstreetmap.org/copyright.


## Reproducible OSM importer

Run from the repository root:

```sh
node accra-ride/scripts/import-osm-road-areas.mjs accra-central
node accra-ride/scripts/import-osm-road-areas.mjs lapaz
node accra-ride/scripts/import-osm-road-areas.mjs all
```

The importer requests OSM highway ways, referenced nodes and restriction relations from Overpass, then writes area packages. It splits ways at shared and restriction-via nodes, keeps way/node IDs, records source tags and ODbL attribution, converts coordinates to local UTM 30N metres, and builds explicit directed junction movement tables. It preserves unknown lane widths as unknown rather than assigning guessed dimensions. It retries multiple public Overpass instances with exponential backoff.

The configured bounding boxes and local origins are preliminary extraction windows only. Review their coverage, via-way restrictions, access tags, grade-separated crossings, lane tagging and gateway continuity before setting an area status to verified. Do not commit a generated package if the importer reports an incomplete/failed query or the resulting graph fails tests.
