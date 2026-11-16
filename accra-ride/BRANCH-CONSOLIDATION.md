# Accra Rush — Consolidated Branch Findings

This document brings the useful, non-production architecture work from the former AccraRide branches into master. It is a planning/reference document, not a claim that the features below are implemented.

## Phase 1: shared road and vehicle contracts

- Use Three.js world coordinates consistently: X east/west, Y height, Z north/south.
- Store distances in metres and speeds in metres/second internally; convert to km/h only for the HUD.
- Road nodes, edges, lanes and junction movements require stable string IDs.
- Road graph connectivity is authoritative. Rendered meshes must never imply a connection that is absent from graph data.
- Represent opposing travel directions and lane permissions explicitly.
- Junctions expose legal incoming-lane to outgoing-lane movements. AI may select only defined movements.
- Road geometry, lane centrelines, AI navigation, minimap guidance and destinations consume the same graph.
- Player and AI share a vehicle-state contract; control policy differs, state units do not.
- A vehicle's physics state remains separate from its Three.js visual model.
- Collision response changes state/velocity; it must not silently delete vehicles. Recovery and despawn require explicit safe conditions.

## Passenger competition contract

- Each competitor receives an independent passenger instance, even when pickup and destination are shared.
- One competitor collecting a passenger must not remove another competitor's passenger.
- Pickup and destination points must be connected to the road graph.
- Mission distance and ETA come from valid route steps, not straight-line distance.
- First valid destination arrival wins; rewards and penalties apply once per valid state transition.

## Accra road-network scope

Start with a small, connected corridor around Kwame Nkrumah Circle, Ring Road Central, Obetsebi Lamptey, Kaneshie, Accra Central and Ako Adjei. Treat these as candidate graph anchors until the exact route geometry and legal connections are verified. Expand toward Achimota/Lapaz, Airport/37, Tema, Osu and the coastal corridor only after the core network passes.

OpenStreetMap references retained from the research branch:
- https://www.openstreetmap.org/way/11664610
- https://www.openstreetmap.org/way/11664763
- https://www.openstreetmap.org/#map=15/5.5695/-0.2158

Do not describe hand-authored test curves as surveyed or map-accurate. Preserve OSM attribution and ODbL obligations if OSM geometry is imported.

## Branch integration and safety gates

1. Preserve the current master driving prototype as the known baseline.
2. Add road graph validators and a tiny sample network before replacing any production road logic.
3. Test straight and curved traversal, explicit junction exits, opposing traffic, steering, braking, reverse, reset and collision recovery.
4. Treat automated tests, deployment health and Android gameplay as separate evidence.
5. Mark every check as PASS, FAIL, NOT TESTED or NOT IMPLEMENTED. NOT TESTED is never PASS.
6. Do not merge isolated prototype HTML files into the production page without a demonstrated Android pass.
7. Keep reusable vehicle assets and prototype work isolated until they are integrated and tested deliberately.

## Tactical abilities

Special abilities are game power-ups, not conventional firearms. Use limited inventory, cooldowns, warnings and counterplay. Offensive effects, shields, traps, boosts and repairs should communicate through defined game events. Avoid instant vehicle deletion; define damage levels and recovery/respawn behaviour.

## Suggested development order

0. Preserve and verify the baseline.
1. Shared contracts and graph validators.
2. Straight/curved road kit and one explicit junction.
3. Vehicle traversal and collision regression.
4. Traffic and safe overtaking on the same graph.
5. Passenger competition and AI opponent.
6. Friend multiplayer.
7. Tactical abilities and damage recovery.
8. Accra environment, UI polish, optimisation and release.

## Important distinction

This document consolidates useful design and architecture findings only. It does not import unverified branch gameplay code, does not claim the Corolla GLB has been integrated, and does not certify any Android gameplay behaviour.
## Review of remaining code branches

The following legacy branches were compared against current `master`. Their complete historical snapshots are not merged wholesale because they are behind/diverged from the current game and would overwrite newer branding, controls, traffic setup or collision behaviour.

### Findings already represented in master

- `fix/accra-ride-tight-gap-collisions`: its swept 2D player/traffic collision approach and collision separation logic are already present in the current master driving page. No separate merge is needed.
- `fix/phase0-traffic-collisions-density`: its earlier swept collision check and traffic density/overtaking logic are superseded by the newer master implementation. Do not replace master with this older page.
- `accraride/phase-0-player-collision-response` and `accraride/rear-impact-from-known-good-7533a00`: their rear-impact distinction and per-AI collision cooldown ideas are already represented in the master collision response. Their older traffic/control versions are not safe full-file replacements.
- `accraride/traffic-density-overtaking-collision-sweep`: its traffic spacing, lane-change and swept-collision work overlaps the current master implementation. The current master version is the retained baseline.

### Useful work preserved as isolated sandboxes

- `accraride/road-network-integration`: Corolla taxi GLB, road graph sandbox, branch-road sandbox and architecture/research notes were selectively copied or consolidated.
- `accraride/branching-road-network`: branch-road prototype and architecture direction are represented by the preserved branch-road sandbox and consolidated architecture notes.
- `accraride/road-graph-curved-road-prototype`: curved-road graph experiment is represented by the preserved curved-road sandbox.
- `accraride/curved-master-speeds-environment`: its later curved-road/traffic environment variant is preserved as `prototypes/curved-road-traffic-environment.html`.
- `accraride/combined-master-curved-prototype`: its combined driving experiment is preserved as `prototypes/combined-curved-driving.html`.
- `accraride/road-network-integration`: the Corolla GLB is in `assets/vehicles/accrarush_corolla_taxi.glb`; it is not yet integrated into the active player vehicle.

### Not promoted into production

- `accraride/production-graph-integration`: the full file replaces the current highway movement with a graph-based world and changes the control/vehicle model. It remains unverified and is not safe to merge into the active game. Its diagnostic prototype and road concepts are retained for review.
- `accraride/master-speed-recovery`: contains AI cruise-speed recovery and player-aware overtaking ideas, but it is an older divergent copy. The logic needs a focused port and Android test before promotion; copying its entire file would roll back master changes.
- `accraride/road-network-integration`, `accraride/branching-road-network`, `accraride/road-graph-curved-road-prototype`, `accraride/curved-master-speeds-environment`, and `accraride/combined-master-curved-prototype`: prototypes are preserved separately, not connected to production.
- `docs/accra-ride-technical-blueprint`: the technical plan was consolidated into this document and the master foundation notes; no stale copy is required.
- `FelixBliss-patch-1`: adds an unrelated Dart workflow; it is not part of the current Three.js game build and is not promoted.

## Merge status

Useful research, documentation, the Corolla GLB and four isolated driving/road prototypes have been brought into `master`. Production-code branches were reviewed for overlap; no unverified full-file replacement was merged. The current master already contains the key swept collision and rear-impact behaviour from the relevant older fixes.

Automated tests must be rerun after this consolidation. The prototype pages and imported vehicle asset still require Android validation before any production integration.
- `accraride/master-speed-recovery`: the older AI speed-recovery/player-aware overtaking experiment is preserved at `prototypes/speed-recovery-overtaking.html` for isolated comparison; its full source is not promoted into production.
- `accraride/production-graph-integration`: the graph-driven driving page and diagnostic page are preserved under `prototypes/`; they remain isolated because the branch changes the active vehicle/world movement model and has not passed Android verification.
