# AccraRush Phase 1 — Closed-loop racing circuits

**Objective:** one independently playable, geographically authentic closed-loop circuit in Accra Central and one in Lapaz. This is not a generic connectivity cleanup.

## Circuit acceptance

A candidate must:
- start and finish at the exact same OSM graph node;
- use only existing OSM edges and legal directed lane movements;
- traverse at least three distinct named roads and multiple recognizable parts of the region;
- be a meaningful circuit (target 1.8–18 km; not a tiny artificial ring);
- have a continuous ordered edge/lane sequence with no teleport or coordinate snapping;
- support player navigation, minimap route display and AI traffic;
- permit at least three consecutive gameplay laps in each area.

A region is not accepted merely because endpoint count is zero, the largest component is connected, a build passes, or a headless scene loads.

## Current engineering implementation

`scripts/analyze-racing-circuits.js` analyzes the full committed OSM network for each area. It builds a directed graph from each edge's legal lane directions, computes strongly connected components, and searches for closed walks composed exclusively of existing directed OSM edges. It records ordered edge IDs, lane IDs, directions, node IDs, road names and distance. It does not modify source datasets or fabricate connectors.

Run:
```sh
node --test accra-ride/tests/analyze-racing-circuits.test.js
node accra-ride/scripts/analyze-racing-circuits.js
```

The CI workflow uploads `data/osm/closed-loop-circuit-analysis.json` for inspection. The automated candidate is a graph-analysis result, not yet a gameplay-approved race route. It must be reviewed against the map for geographic coverage, recognizable areas, sensible road sequence and racing quality before integration.

## Required next implementation gate

1. Review each CI-generated candidate against OSM map geometry and named road sequence.
2. If no suitable circuit exists in the current selected subset, expand/reselect from the full OSM extract using real roads.
3. Convert approved candidate steps into an explicit circuit route consumed by player, minimap and AI systems.
4. Add lap progress/checkpoint logic and validate three consecutive laps in browser gameplay for both regions.
5. Keep master protected until both areas pass.


## Verified candidate circuits from the current selected-road graphs

The full OSM graph analysis and the current five-road-plus-real-connectors selection were both run in GitHub Actions against the complete committed network documents. The current selection produced a directed closed loop in BOTH regions:

| Region | Start node | Directed segments | Distance | Named corridors/landmarks |
|---|---|---:|---:|---|
| Accra Central | `osm-node-5.5651479_-0.1940412` | 85 | 7,026 m | Independence Avenue, Ridge Roundabout, Ako Adjei Interchange, Ring Road Central, Ring Road East |
| Lapaz | `osm-node-5.6308332_-0.2374314` | 94 | 7,067 m | J.A. Kuffour Avenue, Mile Seven Roundabout, Nsawam Road, Achimota Forest Road, George Walker Bush Highway, plus local connecting streets |

The ordered source edge/lane/direction manifests are committed as:
- `data/osm/accra-central.race-circuit.json`
- `data/osm/lapaz.race-circuit.json`

The runtime now loads the relevant manifest, verifies every edge/lane/direction against the selected OSM navigation graph, verifies exact closure at the start node, and exposes a sampled `raceCircuit`. Player spawn is anchored to the first circuit segment. One quarter of the AI traffic is assigned the continuous circuit route; the remaining traffic retains its normal real-graph free-drive routes.

The test suite checks both manifests against the real selected networks, confirms the start/finish node is identical, verifies meaningful multi-kilometre route length and named-road coverage, samples the route, and checks player spawn at the circuit start. The dedicated circuit-analysis workflow independently re-runs graph analysis and uploads its report.

**Status:** circuit discovery, manifests and runtime/AI integration implemented on the feature branch. Browser gameplay validation must still demonstrate the player completing repeated laps and AI remaining on the circuit without visual gaps or route failures. Do not merge to master until browser/manual device acceptance is complete.
