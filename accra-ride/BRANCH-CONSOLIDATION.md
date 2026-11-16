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