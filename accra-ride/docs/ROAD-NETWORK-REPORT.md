# Final road network report (Accra Central + Lapaz)

One authoritative selected-road graph per area (`src/map/selected-road-graph.js`), built from the committed Geofabrik-derived
OSM extracts (`data/osm/*.network.json`). Every edge in it is an unmodified source edge (same id, OSM way id, node ids,
centreline, lanes, tags); `selection.role` records whether it is a **route** (one of the five approved roads), a
**connector** (real OSM path joining them) or **junction** (roundabout/slip-road completion).

The same graph feeds world rendering, menu previews, the live minimap, player navigation and AI traffic. The full extract is no longer rendered or drawn.

## Approved roads (as instructed; not substituted)

Accra Central: Independence Avenue, Ring Road Central, Ring Road East, Ring Road West Road, Kwame Nkrumah Avenue.
Lapaz: Nsawam Road, George Walker Bush Highway, Kwashieman–Ofankor Road, Achimota Forest Road, J.A. Kuffour Avenue.
A road is selected when an edge's OSM `name` equals one of these exactly (case/punctuation/dash-normalised). A missing road is a hard error.

## Selection method

1. Keep every edge carrying an approved name.
2. Join disconnected pieces with the cheapest real OSM path (Dijkstra; motorway…tertiary + links at 1×, residential/unclassified at 4× as a last resort).
3. Complete any roundabout the routes touch (all its edges) and keep `*_link` roads joining two retained nodes.
4. Directed repair: dual carriageways are separate one-way ways, so stranded one-way pieces are joined back to the main strongly-connected piece with real directed paths, both directions, capped at 5,000 weighted metres per piece.
5. Pieces with no real path inside the cap are left as they are and reported (Lapaz 91.0% strongly connected; the rest are one-way spurs).

## Results

### accra-central

| Road | Source edges | OSM ways | Length (m) |
|---|---:|---|---:|
| Independence Avenue | 113 | 44 (w1059317693, w1059317694, w1096259876, w11152422, w11153080, w11658655, …) | 10211 |
| Ring Road Central | 81 | 53 (w1052824110, w1052824112, w11160683, w11657993, w11664722, w11664763, …) | 7149 |
| Ring Road East | 78 | 29 (w1094699300, w1094699301, w1094706998, w1094706999, w11153130, w11153564, …) | 7739 |
| Ring Road West Road | 79 | 34 (w1059037524, w1059037777, w1059037778, w1096972074, w1096972075, w1097868033, …) | 8080 |
| Kwame Nkrumah Avenue | 90 | 40 (w1096979302, w11666517, w11666900, w11667029, w13687262, w1439354537, …) | 4824 |

- Source extract: 5005 edges / 4147 nodes. Selected graph: **760 edges / 700 nodes** (15.2% of the extract).
- Route segments: **441**. Connector segments: **319** (283 connecting-path/directed-repair, 36 roundabout/slip-road completion).
- Undirected components: **1** (connected: true). Largest strongly-connected share of nodes: **99.7%**.
- Source-tagged bridge/tunnel edges kept: 26. Elevation: none in source (all y = 0).
- Perf (Node, this sandbox): selection 73 ms, mesh build 74 ms, 11 meshes, 32339 triangles, 448 junction/bend patches, 382 stop lines, 1235 arrows.

### lapaz

| Road | Source edges | OSM ways | Length (m) |
|---|---:|---|---:|
| Nsawam Road | 118 | 62 (w112243422, w129824088, w1557592486, w1557592487, w1557592488, w1557592489, …) | 20015 |
| George Walker Bush Highway | 165 | 98 (w112738218, w112738221, w140841592, w140841594, w1446291299, w1446291300, …) | 19211 |
| Kwashieman–Ofankor Road | 209 | 20 (w1535062291, w1535062292, w29512728, w449234706, w449234707, w512912775, …) | 8521 |
| Achimota Forest Road | 57 | 36 (w1059319736, w1059319737, w129824085, w129824086, w163557159, w172921790, …) | 4894 |
| J.A. Kuffour Avenue | 47 | 17 (w1064465962, w1064465963, w1064465964, w1064465965, w1577023984, w1577023985, …) | 3340 |

- Source extract: 5719 edges / 5026 nodes. Selected graph: **809 edges / 768 nodes** (14.1% of the extract).
- Route segments: **596**. Connector segments: **213** (198 connecting-path/directed-repair, 15 roundabout/slip-road completion).
- Undirected components: **1** (connected: true). Largest strongly-connected share of nodes: **91.0%**.
- Source-tagged bridge/tunnel edges kept: 15. Elevation: none in source (all y = 0).
- Perf (Node, this sandbox): selection 118 ms, mesh build 33 ms, 10 meshes, 38546 triangles, 470 junction/bend patches, 308 stop lines, 1406 arrows.

Danquah Circle (Accra Central, roundabout w510510824) and Prof. Atta Mills High Street (Lapaz, OSM current name) both enter their graph as real connectors.
Unrelated residential streets are excluded; the only residential edges present are last-resort connectors (see tests: selected graph < 20% of the extract).

## Dimension policy (as approved)

Explicit OSM `width`/`lanes` tags first; otherwise road-class inference; 3.5 m lane width is a fallback, not a universal measure.
Provenance is stored per edge (`roadModel.widthSource`): Accra Central 760/760 edges inferred (`inferred:default-lane-width`);
Lapaz 808 inferred, 1 from an OSM `width` tag. The original "howdy1–howdy8" dimensions were **not** recovered and are not claimed.
Medians/shoulders are not in the source, so none are drawn (the foundation reserves them at 0 m).

## Geometry fix: Danquah Circle and Atta Mills Street

Root cause (verified on the actual edges): centreline vertices closer than ~0.3 m apart carry no usable tangent, and offsetting them by half the
road width swung the boundary through the road (Danquah: a duplicated vertex; Atta Mills segment 49: a 0.28 m last segment). Fix in `road-foundations.js`:
interior vertices within 0.35 m are dropped (both endpoints always kept exactly); offsets use a true segment miter; the inside offset of a tight bend is limited so it can never cross
the next vertex. Result: **all 5,005 Accra Central and 5,719 Lapaz source edges** build fold-free surfaces (previously Danquah and Atta Mills failed the RD-04 whole-extract tests).

Note: the folded Atta Mills segment (w476690296-segment-49) is on the same OSM way as the selected Atta Mills segments 0–7 but is not itself in the selected graph; the
fix is in the shared geometry layer so it applies everywhere.

## Rendering

`three-road-renderer.js` now consumes the RD-03 foundations / RD-04 indexed surfaces: UV-mapped upward-facing surfaces batched by road class; fan patches at every shared junction node and at bends whose boundaries leave a gap;
lane-divider (dashed), centre (solid) and edge lines; stop lines at lanes entering junctions; direction arrows on long edges. All triangles are verified upward/non-degenerate by tests.

## Real OSM roadside features (added after review)

The original extract kept only way-level tags, so point features were never imported. `scripts/import-osm-features.js` (workflow `import-osm-features.yml`, run in CI against the same Geofabrik PBF; this sandbox cannot reach OSM) extracted them into `data/osm/<area>.features.json`. The road networks were not re-imported or changed.

| Feature (real OSM) | Accra Central: in area / on selected graph | Lapaz: in area / on selected graph |
|---|---|---|
| Crossings (zebra stripes) | 151 / 77 | 60 / 27 |
| Traffic signals (pole + head) | 52 / 26 | 19 / 15 |
| Stop / give-way signs, other signs | 11 / 2 | 22 / 1 |
| Street lamps | 2 / 0 | 51 / 42 |
| Bus / tro-tro stops (shelter) | 718 / 106 | 516 / 170 |
| Speed cameras | 0 / 0 | 1 / 0 |
| Mapped sidewalks (OSM footway ways) | 30 / 18 | 9 / 8 |
| Sidewalks from the road's own `sidewalk=` tag | 41 edges | 70 edges |
| Bollards / speed humps | 14 / 6 bollards | 1 / 0 |
| Overhead gantries, guard rails | 0 | 0 |

Features are kept only when they lie within 14 m of a selected edge; none are invented. Code: `road-features.js`, `road-feature-renderer.js`; evidence: `*-traffic-signals-crossing.png`.

## Not implemented / not in the source data

- **Gantries, guard rails, medians, shoulders:** none are mapped in OSM (gantry and guard-rail counts are 0; the renderer supports both and will draw them if they are ever mapped) for these areas so none are drawn.
- **Elevation / bridge decks:** no elevation in the source (all y = 0). Bridge/tunnel tags (26 + 15 edges) are preserved on the graph; no connection is made at crossings because connections exist only where OSM shares a node.
- Roundabout-specific markings are not drawn; ring edges get lane dividers only. Speed humps and other signs are drawn only where OSM maps them near the selected roads.
- Menu: the five legacy hand-drawn areas were removed per review; only Accra Central and Lapaz remain.

## Evidence (`docs/road-evidence/`)

`*-selected-network-render.png` (renderer output, top-down), `danquah-circle-after.png`, `atta-mills-street-after.png`, `browser-map-screen.png`, `browser-menu-preview-*.png`,
`*-live-minimap.png`, `*-gameplay.png`, `*-ingame.png`. Browser runs used a local three.js r160 copy because the sandbox cannot reach the CDN (`THREE_LOCAL_DIR`), headless Chrome with SwiftShader, so frame rates are not representative of Android devices; no Android device run was possible.
