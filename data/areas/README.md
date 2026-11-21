# AccraRush OSM area datasets

This folder contains imported, area-scoped OpenStreetMap road graphs.

## Import

Requires Node.js 20+ (native fetch; no third-party runtime dependencies).

```sh
node scripts/import-osm-areas.mjs accra-central
node scripts/import-osm-areas.mjs lapaz
node scripts/import-osm-areas.mjs all
```

The importer queries OSM highway ways inside the configured bounding boxes, keeps OSM node/way identifiers, splits ways into stable road segments, retains one-way/lane/surface/speed/name tags, and writes:

- `data/areas/<area-id>/roads.json`
- `data/areas/<area-id>/validation.json`

The importer tries multiple public Overpass instances. Public Overpass services can be busy; rerun after a delay if all endpoints reject the request. For repeatable production imports, retain the raw source response and record the import timestamp and endpoint.

## Validation limits

The generated report checks basic data integrity, area coverage, junction-node count and connected-component structure. It does **not** certify map accuracy, legal turn movements, lane topology, route reachability between mission points, Three.js rendering, AI traffic behaviour or Android performance. Those are separate acceptance gates.

A structural PASS is not a gameplay PASS. The Accra Central and Lapaz area packages remain unaccepted until their actual imported data and in-game route tests have been reviewed.

## Data and attribution

© OpenStreetMap contributors. Data is available under the Open Database Licence (ODbL) 1.0. Preserve attribution in the game and comply with ODbL obligations when distributing derived databases. See https://www.openstreetmap.org/copyright and https://opendatacommons.org/licenses/odbl/1-0/.
