# AccraRush OSM area import

This pipeline downloads and converts two bounded OpenStreetMap road areas into the existing AccraRush graph contract. It is deliberately isolated from the production driving page until the imported data and runtime integration pass acceptance.

## Areas

| Area | South | West | North | East |
|---|---:|---:|---:|---:|
| Accra Central | 5.525 | -0.245 | 5.585 | -0.165 |
| Lapaz | 5.595 | -0.295 | 5.665 | -0.215 |

The importer subdivides each area into 0.01-degree Overpass requests. Ways returned in multiple tiles are deduplicated by OSM way ID before graph construction. The Overpass query requests complete way geometry, so roads selected by a tile retain their full geometry across tile boundaries.

## Run

From the repository root:

```sh
node accra-ride/scripts/import-osm-areas.js
node --test accra-ride/tests/*.test.js
```

Or run the **Import Accra OSM road networks** workflow manually from GitHub Actions on branch `feature/osm-accra-central-lapaz-import`. It downloads both areas, runs the graph contract tests and commits generated files under `accra-ride/data/osm/`.

## Data contract

Each generated `*.network.json` contains:
- OSM way metadata and OpenStreetMap ODbL attribution.
- Stable graph node and edge IDs, local metre coordinates and curved centreline samples.
- Directional lane records derived from `oneway`, roundabout and lane tags.
- Diagnostics for way/node/edge counts, connected components, dead ends, junctions and highway classes.

The Three.js renderer and directed Dijkstra navigation helpers live in `src/map/`. They are reusable modules; they are not yet wired into the current standalone prototype page. The route helper respects one-way direction and can be used by player route guidance and AI traffic. AI movement should sample the selected edge centreline rather than move on a straight-line approximation.

## Acceptance gates — do not mark ready until all pass

1. Both generated datasets exist and are non-empty; their bounds and road-class distributions are reviewed.
2. Graph validation reports no malformed edges, duplicate IDs or dangling endpoints. Connected components and dead ends are reviewed against the intended map coverage rather than blindly rejected.
3. Both areas render in the actual Three.js game scene with visible curves, branches and junctions.
4. A player can traverse routes across multiple junctions and area branches without gaps or stuck transitions.
5. AI traffic can plan and complete directed routes in both areas, including one-way roads, without disappearing or becoming stranded.
6. An integrated Android landscape build is driven manually through representative routes in both areas.

Passing the Node tests alone does not satisfy these gates. The current prototype must remain unchanged until the integrated replacement is validated.

## Source and attribution

Road data: © OpenStreetMap contributors, licensed under the Open Database License (ODbL). Include visible attribution in the game map UI and preserve source metadata in redistributed extracts. See https://www.openstreetmap.org/copyright and https://www.openstreetmap.org.

## Operational notes

Overpass instances are shared community infrastructure. The downloader makes small sequential requests, waits between tiles and retries/falls back between endpoints. If both endpoints are unavailable or rate-limited, rerun later rather than increasing request concurrency. Do not publish a partial area as a completed dataset.
