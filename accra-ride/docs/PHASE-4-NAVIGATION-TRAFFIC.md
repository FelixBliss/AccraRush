# Phase 4 — Navigation and AI traffic core

This slice adds reusable, isolated graph-based navigation and deterministic traffic-agent primitives. It does not connect them to the live game entrypoint and does not mark either OSM area route-ready.

## Navigation
- Dijkstra route search operates on directed lane corridors.
- Only lanes explicitly marked `allowed` are traversable.
- Every edge-to-edge transition requires a matching junction movement with status `allowed`.
- Unknown and prohibited movements are excluded. A missing legal route returns `no_verified_route`, not a guessed route.
- Guidance reports current/next road names, remaining metres and the next junction movement.
- Reverse travel samples the centreline in reverse order.

## AI traffic
- Agent state is graph-native: edge ID, lane ID, direction and distance-along-edge in metres.
- Movement follows the source centreline and respects mapped speed limits when available.
- Same-corridor lead vehicles impose a conservative following-speed target.
- Junction transitions require an explicit caller-selected candidate from the legal movement list.
- Without a legal selection, the vehicle stops at the edge endpoint. It never teleports across a disconnected road.
- Lane changing and overtaking are intentionally disabled until lane adjacency and lane geometry are represented and validated.

## Current limitations
The current Accra Central and Lapaz packages are partial and contain unknown directions and junction movements. These new services will therefore refuse many real-world routes and stop AI vehicles at unreviewed junctions. This is intentional. They are tested against deterministic fixtures only, not certified for live OSM gameplay.

## Next gates
1. Complete area coverage and gateway links from fresh OSM extracts.
2. Review one-way direction, access, restriction relations and junction legality.
3. Add route generation tests against the reviewed area packages.
4. Add player edge/lane matching and route-progress tracking.
5. Add AI spawn/despawn, multiple-agent collision avoidance and verified lane-change/overtake rules.
6. Wire renderer, navigation and traffic behind a feature flag in a separate gameplay entrypoint.
7. Profile Android landscape performance and verify no HUD, control or prototype regressions.
