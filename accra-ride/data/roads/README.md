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
- Accra Central: 827 motor-road ways, 718 graph edges, 1,317 graph nodes, 118 junction candidates; 3 selected 0.01-degree tiles.
- Lapaz: 630 motor-road ways, 549 graph edges, 999 graph nodes, 99 junction candidates; 3 selected 0.01-degree tiles.

These are deliberately marked partial and productionReady=false. They do not cover the complete selectable areas. Cross-way junction movements remain unknown unless an OSM restriction relation was successfully applied; default bidirectional directions without an explicit direction tag are also marked unknown. Do not use these packages for live routing, AI traffic or missions yet.

Attribution: © OpenStreetMap contributors. Data is available under the Open Database License (ODbL) 1.0. See https://www.openstreetmap.org/copyright.
