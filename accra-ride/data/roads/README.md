# Road network data

This directory holds versioned area packages for the production road graph. Never add hand-drawn/schematic coordinates as verified geography. Every production area must record source attribution, extraction timestamp, licence, CRS, coverage bounds and feature confidence.

## Area package
- manifest.json: area ID, schema version, CRS, local origin, bounds and source metadata.
- network.json: nodes, directed edges, lanes, junctions and legal movements.
- landmarks.json: named POIs with source IDs and confidence.
- routes.json: connected directed routes validated against network.json.

## Coordinate contract
Source coordinates are WGS84 longitude/latitude. Project to EPSG:32630 (UTM zone 30N), store easting/northing in metres, then transform to Three.js: X=easting-originEasting, Y=elevation-originElevation, Z=-(northing-originNorthing). One world unit is one metre. Minimap pixel/metre scaling is presentation only.

## Import rules
1. Extract OSM road ways, nodes and restriction relations; preserve source element IDs and tags.
2. Split ways at real intersections and topology changes. A bridge/tunnel crossing is not a junction unless source topology connects it.
3. Create explicit directed junction movement tables and preserve turn restrictions.
4. Keep unknown lane counts, widths and speed limits unknown; never invent values to make a route pass.
5. Validate connectivity, legal movements, geometry lengths and area gateways.
6. Review major corridors and landmarks against current OSM and aerial/map evidence before marking an area verified.

## Current status
Accra Central and Lapaz have not yet been imported from OSM. Existing selectable loops and prototype roads are schematic/experimental only. No production area package is published here.
