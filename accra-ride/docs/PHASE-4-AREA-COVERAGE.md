# Phase 4 — Accra Central and Lapaz OSM coverage windows

These are project-defined playable extraction windows, not legal, municipal or official neighbourhood boundaries. OSM place features are used as geographic centres only.

| Area | OSM place feature | Centre (lat, lon) | Extraction bounds (south, west, north, east) | Tile grid |
|---|---|---|---|---|
| Accra Central | node/11215199773 | 5.54595, -0.20739 | 5.535, -0.225, 5.575, -0.185 | 2 × 2 tiles, each 0.02° |
| Lapaz | node/5566513301 | 5.60737, -0.24869 | 5.585, -0.275, 5.625, -0.235 | 2 × 2 tiles, each 0.02° |

Each rectangle is approximately 4.4 km × 4.4 km at Accra's latitude. The rectangles intentionally overlap adjacent neighbourhood corridors where needed for continuous driving. They must not be described as official suburb borders.

## Imported OSM content

The reproducible importer retrieves:
- Drivable highway ways and referenced node geometry.
- OSM restriction relations and their members.
- Tagged landmarks/POIs: amenity, shop, tourism, historic, leisure, public_transport, railway and place.
- OSM way IDs, versions, tags and ordered node references.

Attribution: © OpenStreetMap contributors. Data is available under the Open Database License (ODbL) 1.0: https://www.openstreetmap.org/copyright.

## Quality gates

- The manifest remains `coverage.status=partial` and `completeAreaCoverage=false` until the project verifies edge continuity at all four borders.
- A rectangular query window is not proof that every road or legal gateway has been mapped.
- OSM default directionality, one-way tags, access restrictions, bridge/tunnel/layer separation and turn restrictions must be reviewed.
- Via-way restrictions that cannot be resolved remain explicitly unresolved.
- Unknown junction movements remain unavailable to route planning and AI traffic.
- POIs are OSM-tagged landmarks, not field-verified destinations.
- No physical lane widths, missing speed limits or elevation values may be invented.

The expansion workflow commits generated area packages only after structural road-network tests pass. Production readiness remains false until the separate geographic and gameplay acceptance gates are satisfied.
