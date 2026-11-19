# Phase 4 — Production Road Network Foundation

**Implemented on this branch:** graph primitives, UTM 30N projection, local metric transform, polyline measurement/sampling, explicit junction movement validation and automated tests. **Not implemented:** production OSM area data, Three.js road renderer, route service, minimap integration, AI traffic integration and Android certification.

## Architecture decisions
- One directed graph is authoritative for rendering, player lane tracking, AI, junction legality, routing, minimap, pickup/drop-off and mission routes.
- Canonical units: metres, metres/second, metres/second² and radians. One Three.js world unit equals one metre.
- Source CRS WGS84; import to EPSG:32630 (UTM 30N). World axes: X=easting, Y=elevation, Z=negative northing.
- Each area is a self-contained package with stable IDs and explicit gateway links. Load only selected area and explicitly connected neighbours.
- Crossings are not automatically junctions. Every traversable junction has an explicit legal movement table.
- Unknown source facts remain unknown. Schematic prototypes are not geography.

## Graph contract
Nodes: stable ID, position and source reference. Edges: stable ID, directed from/to nodes, ordered centreline, measured length, road class, surface, speed limit plus source, access restrictions, source way IDs and confidence. Lanes: stable ID, parent edge, direction, width/type and restrictions. Junctions: node ID and explicit incoming-edge/direction to outgoing-edge/direction movements. Landmarks: stable ID, name, position, source reference and confidence. Area links: reciprocal gateway links only.

The new core module validates topology, route movement legality, UTM projection, local transforms, polyline lengths and distance sampling. Existing validators.js remains backward compatible; integration is staged.

## Rendering design
A future RoadNetworkRenderer consumes graph edges only. Sample each centreline, compute tangent/perpendicular, build indexed BufferGeometry for asphalt, lane surfaces/markings, shoulders and sidewalks. Junction meshes use junction approach geometry, not overlapping road ribbons. Roundabouts are explicit circulatory edge topology and legal exits. Terrain/building props are separate layers. Use shared materials, merged static meshes by material/area chunk, curvature-adaptive sampling, frustum/distance culling, low-cost mobile shadows, and deterministic disposal of geometry/material/texture on unload. Avoid per-frame allocations.

## Navigation/minimap
RouteService computes directed paths over the graph and restrictions. Route steps store edge ID, direction and lane ID. Guidance derives current road, next legal movement, next road name, remaining distance and arrival from player edge/lane and distance-along-edge. Minimap draws the same graph and route state; no second road dataset. Pixel/metre scale cannot alter world geometry.

## AI traffic
AI state is edge ID, lane ID, direction and distance-along-edge. Vehicles advance along centreline metres, obey lane direction and speed limits, and select only listed legal junction movements. Overtaking requires compatible adjacent lanes and a safe gap. Recovery projects onto reachable lane segments; if none exists, stop/recover at the last valid position rather than teleport across disconnected roads.

## Accra Central and Lapaz geography
Use OSM ways, nodes and turn-restriction relations as the initial source and preserve OSM IDs/attribution. Keep projected global coordinates so area gateways align. Do not publish earlier illustrative bounding boxes or hand-authored loops as surveyed extents.

The selectable Accra Central and Lapaz networks in phase-2-navigation.js are not geographic road graphs: their coordinates are schematic and edges jump between broad place names. The Lapaz circuit links Lapaz, Achimota, Dzorwulu, Airport/Accra Mall, Shiashie, Madina, Legon and Atomic as if they were one local loop. Do not use that topology for production navigation. Preserve menu area IDs while replacing only after sourced extraction and review.

## Prototype disposition
The prototypes README says these pages are isolated, not loaded by index.html or 3d-prototype.html, and not Android-certified. Port mechanics, not their maps or UI:
- curved-road-graph.html: curved-road steering/traffic experiment; candidate curve-following math after tests.
- branch-road-network.html: branch/junction and minimap concept; legal movements still need graph validation.
- combined-curved-driving.html: integrated synthetic Catmull-Rom route; visual/handling reference only.
- curved-road-traffic-environment.html: alternate/overlapping curve and traffic experiment; compare before porting.
- graph-integration-driving.html: graph-oriented driving and scene experiment; embedded Central Accra nodes/roads explicitly gameplay-scaled, not survey-grade GIS.
- graph-integration-diagnostic.html: diagnostics and minimap sandbox; separate schematic graph is not production data.
No prototype page is imported into production. Runtime/browser/Android execution comparison remains outstanding.

## Target modules
- src/core/road-network.js — implemented graph and geometry primitives.
- data/roads/<area>/{manifest,network,landmarks,routes}.json — not populated.
- src/world/roads/road-network-renderer.js — proposed renderer.
- src/navigation/{route-service,navigation-state}.js — proposed routing/guidance.
- src/traffic/road-traffic-controller.js — proposed traffic integration.
- src/ui/minimap-road-layer.js — proposed same-graph minimap.
- tests/road-network.test.js — implemented core tests.

## Migration order
1. Land graph contract independently (this branch).
2. Import/review Accra Central OSM data.
3. Import/review Lapaz separately; no cross-area jump without gateway geometry.
4. Build renderer from graph and verify world/minimap agreement.
5. Add routing/guidance, then AI legal lane-following.
6. Integrate behind a feature flag into a separate gameplay entrypoint.
7. Run automated and Android landscape acceptance before production promotion.

## Acceptance gates
- 100% of edge endpoints resolve; every traversed junction passes explicit movement validation.
- Every rendered road and minimap segment maps to the same graph edge IDs.
- World/minimap centreline projection error under 1% viewport width at identical transform.
- AI never traverses prohibited lane directions or movements in deterministic tests.
- Area unload disposes all generated GPU resources and returns scene references to baseline.
- Android: 30 FPS minimum on agreed baseline device during a 10-minute traffic run, no unbounded heap/GPU growth, no touch/HUD regressions, landscape-only.
These are target gates, not claimed test results.
