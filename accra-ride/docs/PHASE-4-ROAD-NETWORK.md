# Phase 4 — Production Road Network Foundation

**Implemented on this branch:** graph primitives, UTM 30N projection, local metric transform, polyline measurement/sampling, explicit junction movement validation, unknown-lane preservation and directed route legality gates. Partial OSM road extracts have been committed for Accra Central and Lapaz. A first isolated Three.js road-surface renderer and pure ribbon/junction geometry builders have now been added. They are not yet wired into the protected game entrypoint, profiled on Android, or accompanied by production navigation/AI integration.

## Architecture decisions
- One directed graph is authoritative for rendering, player lane tracking, AI, junction legality, routing, minimap, pickup/drop-off and mission routes.
- Canonical units: metres, metres/second, metres/second² and radians. One Three.js world unit equals one metre.
- Source CRS WGS84; import to EPSG:32630 (UTM 30N). World axes: X=easting, Y=elevation, Z=negative northing.
- Each area is a self-contained package with stable IDs and explicit gateway links. Load only selected area and explicitly connected neighbours.
- Crossings are not automatically junctions. Every traversable junction has an explicit legal movement table.
- Unknown source facts remain unknown. Schematic prototypes are not geography.

## OSM data import — 19 November 2026

The official OpenStreetMap API map endpoint was used to retrieve selected 0.01-degree tiles. Each source way retains its OSM ID, version, ordered node references and original tags. Coordinates are projected to UTM zone 30N; local area origins preserve metre-scale geometry. Ways are split at shared OSM node IDs, and every imported motor-road way in the selected tiles is represented by at least one graph edge.

| Area | OSM motor-road ways | Graph edges | Graph nodes | Junction candidates | Selected tiles |
|---|---:|---:|---:|---:|---:|
| Accra Central | 827 | 1,458 | 1,182 | 878 | 3 |
| Lapaz | 630 | 1,090 | 897 | 638 | 3 |

**Coverage is partial.** The selected tiles sample central business/administrative corridors and Lapaz/Abeka corridors; they do not cover the full menu area bounds. The manifest lists exact tile extents. Missing roads and gateway connections must be imported before gameplay use. These packages are not route-ready or production-ready.

The imported road class filter includes motor-vehicle road classes and excludes pedestrian/cycle/steps-only ways and explicitly prohibited access. OSM lanes, maxspeed, oneway, surface, access, bridge, tunnel and layer tags are retained. Physical lane widths and elevation remain null when not mapped. A directional corridor is not a claim that the road has exactly one physical lane.

One-way directions are routable only where an explicit OSM direction tag was present. Untagged directionality remains unknown. Cross-way junction movements remain unknown until restriction relations and local traffic legality are reviewed. Accra Central returned three restriction relations: two node-based restrictions were applied; one via-way relation requires further review. Lapaz returned no restriction relations in the selected tiles; this does not prove there are no restrictions in the full area. Current generated graph checks report zero endpoint, geometry-length, lane-contract or junction-reference errors in both packages; deterministic Node test execution is still pending.

Attribution: © OpenStreetMap contributors; ODbL 1.0. See https://www.openstreetmap.org/copyright.

## Graph contract
Nodes: stable ID, projected/world position and source reference. Edges: stable ID, directed from/to nodes, ordered centreline, measured length, road class, surface, speed limit plus source, access restrictions, source way IDs and confidence. Directional corridor records: stable ID, parent edge, direction, physical lane count/width when known, and status. Junctions: node ID and explicit incoming-edge/direction to outgoing-edge/direction movements with allowed/prohibited/unknown status. Landmarks: stable ID, name, position, source reference and confidence. Area links: reciprocal gateway links only.

The core module validates graph endpoints, centreline/node alignment, geometry length, lane direction/status, junction movement compatibility and directed route legality. Routes cannot use an unknown lane direction or an unreviewed cross-way turn.

## Rendering implementation and next steps
Implemented in isolation: `src/world/roads/road-geometry.js` builds metre-scaled indexed road ribbons from ordered graph centrelines, stabilizes curve joins with capped miters, and builds junction surface patches from incident graph edges. `src/world/roads/road-network-renderer.js` converts those pure geometry buffers into Three.js meshes and returns a disposable group. The owning game entrypoint passes its existing `THREE` namespace; this avoids loading a second Three.js runtime. Each mesh carries its source edge ID and width provenance.

**Width distinction:** physical lane widths are not generally present in OSM. The renderer uses an explicit area render width or fully tagged lane widths where available; otherwise it uses a configurable road-class gameplay visual width. That fallback is a visual assumption, not surveyed road width, and is tagged `gameplay-render-default` in mesh metadata.

Not yet implemented: lane/edge markings, shoulders, sidewalks, terrain/building integration, adaptive LOD/chunk merging, renderer scene integration, browser visual review and Android GPU profiling. Junction patches are visual surfaces only; their presence does not make unknown turns legal. The renderer is not imported by `accrarush.html` and does not modify the protected driving prototype. Next, test the renderer against both OSM areas in a separate preview page, then profile and optimize before gameplay integration.

## Navigation/minimap
RouteService computes directed paths over the graph and restrictions. Route steps store edge ID, direction and lane ID. Guidance derives current road, next legal movement, next road name, remaining distance and arrival from player edge/lane and distance-along-edge. Minimap draws the same graph and route state; no second road dataset. Pixel/metre scale cannot alter world geometry.

## AI traffic
AI state is edge ID, lane ID, direction and distance-along-edge. Vehicles advance along centreline metres, obey lane direction and speed limits, and select only listed legal junction movements. Overtaking requires compatible adjacent lanes and a safe gap. Recovery projects onto reachable lane segments; if none exists, stop/recover at the last valid position rather than teleport across disconnected roads.

## Prototype disposition
The prototypes README states these pages are isolated sandboxes, not loaded by index.html or 3d-prototype.html, and not Android-certified. Their mechanics are candidates for isolated extraction and testing; their schematic maps and UI are not production assets. See PHASE-4-PROTOTYPE-AUDIT.md.

## Migration order
1. Complete OSM tile coverage for Accra Central and Lapaz; import restriction relations and review uncertain junctions.
2. Validate area gateways and connect only surveyed adjacent roads.
3. Build renderer from graph and verify world/minimap agreement.
4. Add routing/guidance, then AI legal lane-following.
5. Integrate behind a feature flag into a separate gameplay entrypoint.
6. Run automated and Android landscape acceptance before production promotion.

## Acceptance gates
- 100% of edge endpoints resolve; every traversed junction passes explicit movement validation.
- Every rendered road and minimap segment maps to the same graph edge IDs.
- World/minimap centreline projection error under 1% viewport width at identical transform.
- AI never traverses prohibited lane directions or movements in deterministic tests.
- Area unload disposes all generated GPU resources and returns scene references to baseline.
- Android: 30 FPS minimum on agreed baseline device during a 10-minute traffic run, no unbounded heap/GPU growth, no touch/HUD regressions, landscape-only.
These are target gates, not claimed test results.
