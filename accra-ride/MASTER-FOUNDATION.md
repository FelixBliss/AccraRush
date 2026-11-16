# Accra Rush — Master Technical Foundation

**Status:** Architecture baseline; implementation gates not yet passed  
**Engine:** Three.js / WebGL, mobile-first landscape  
**Production rule:** Keep the existing `accra-ride/3d-prototype.html` on `master` as the recoverable reference until replacement gameplay passes Android acceptance tests.

## 1. Product definition

Accra Rush is a competitive 3D driving game set in a recognisable, stylised-realistic Accra. The core competitive loop is a passenger pickup-and-delivery race: competitors receive equivalent passenger instances, race to their pickup points, then race to the same destination. The first valid drop-off wins. Traffic is shared world traffic; each competitor's passenger instance is private to that competitor.

Two competition paths are planned:
- **AI race:** the player competes against computer-controlled drivers.
- **Friend race:** players compete online using the same match rules and world state.

A clean driving ruleset may be offered separately from **Action Passenger Rush**, which adds tactical abilities. Tactical items are fictional game mechanics, not conventional firearms: EMP pulse, homing impact projectile, shield, road trap, nitro, steering disruptor and repair. Every attack needs readable warnings, limited inventory/cooldowns and counterplay.

## 2. Engineering constraints

- Target Android phones; landscape gameplay.
- Keep the project compatible with the user's phone-only, zero-monthly-budget workflow.
- Stay on Three.js for this development cycle. Do not migrate to Unity or introduce paid services.
- Prefer authored, reusable assets and small test scenes over large procedural systems.
- Straight and curved road segments first. Use a small number of explicit, authored connections; do not start with a complex procedural junction generator.
- Keep graphics realistic and performance-conscious. Avoid cartoon styling and expensive effects that compromise frame rate.
- Do not add a dependency or physics engine until an audit demonstrates a specific need.
- Deployment success is not gameplay verification. A feature is accepted only after the defined test passes on Android.

## 3. Canonical architecture contracts

### World units and coordinates
- World distances are metres; internal speed is metres/second; HUD converts to km/h.
- Three.js world axes: X lateral, Y vertical, Z longitudinal.
- Stable string IDs identify roads, lanes, vehicles, routes, passengers, matches and items.
- No gameplay system relies on array position or a rendered mesh's name as identity.

### Road data
- Road graph is authoritative; road meshes, lane paths, traffic, route guidance and pickup/drop-off access derive from the same data.
- Each road edge has stable ID, start/end node IDs, ordered centreline, length, road class, speed limit and allowed directions.
- Straight and curved centreline segments are supported from the start.
- Each lane has stable ID, parent edge, direction, width and lane type.
- A connection/junction explicitly lists legal incoming-to-outgoing movements. Visual road overlap never implies connectivity.
- Every route is a continuous ordered list of directed edges/lane movements. Reject disconnected routes.

### Vehicle and physics state
- Player, AI and networked vehicles share one vehicle-state contract: ID, type, position, heading, speed, acceleration, dimensions, current edge/lane, route cursor, gear, damage and control intent.
- Separate simulation/physics state from the 3D visual model.
- Inputs express steering, throttle, brake and gear; the movement system owns position and velocity.
- Collision changes state and velocity through defined events. It must not make vehicles clip through one another, vanish instantly or teleport during recovery.
- Vehicle model dimensions and collision bounds use the same metre scale.

### Match and passenger state
- A match has a stable ID, seed, start time, status, shared traffic state and ordered competitor list.
- Every competitor gets an equivalent but individually owned passenger instance; one player's pickup must not remove another player's passenger.
- Competitors share pickup and destination coordinates/rules, not passenger object identity.
- Match states: waiting, countdown, racing, completed, cancelled.
- Competitor states: toPickup, passengerOnboard, delivered, disqualified.
- Pickup/drop-off require valid proximity, speed/stop rules and a single authoritative state transition.
- Winner is the first valid delivery recorded by the match authority. Prevent duplicate rewards or multiple winners.
- AI and friend multiplayer must use the same match rules and event contracts.

### Tactical abilities
- Abilities use typed events and server/host-authoritative validation in multiplayer.
- Define inventory, cooldown, range, targeting, hit validation, duration, damage, counterplay and recovery before adding visuals.
- Damage levels must be recoverable and readable: performance impairment, steering impairment, severe slowdown/immobilisation, then respawn with a defined penalty.
- Passenger progress is not permanently destroyed by a single attack.
- Effects are cosmetic representations of authoritative gameplay events.

### Persistence and online readiness
- Save only versioned plain data; never serialize Three.js objects.
- Keep local/offline AI match playable without a backend.
- Design match IDs, competitor IDs, event payloads and deterministic rules so friend multiplayer can be layered on without rewriting local gameplay.
- Do not introduce login, database or paid backend until online play is ready to be implemented.

## 4. Development order and gates

| Phase | Deliverable | Gate before next phase |
|---|---|---|
| 0 | Repository cleanup, one documented master baseline, build/test process | Correct repository, clean Accra Rush-only root, baseline can be restored |
| 1 | Shared units, IDs, data contracts, lifecycle and event boundaries | Contract validation and no duplicate sources of truth |
| 2 | Small road kit: straight + curve + explicit connection | Geometry continuity, valid route traversal, Android frame-rate check |
| 3 | One detailed taxi, vehicle dimensions, controls, collision and camera | Forward/reverse/steering/braking/collision/reset all pass on Android |
| 4 | AI traffic on the same road data | Both directions, lane following, safe overtaking, no clipping or bizarre speed |
| 5 | One AI passenger race | Equivalent passenger instances, correct pickup/drop-off, exactly one winner |
| 6 | Friend race architecture and online session | Disconnect/rejoin, authority, shared traffic and deterministic winner tests |
| 7 | Tactical abilities and damage/recovery | Every ability has counterplay and passes repeatable gameplay tests |
| 8 | Accra environment and signature landmarks | Recognisable scale, optimised assets and stable Android performance |
| 9 | Progression, rewards, ads, polish and release | Full regression, privacy/store checks and release build verification |

## 5. First vertical slice

Do not expand the city before this small playable slice passes:
1. One detailed yellow Corolla taxi.
2. One straight road and one curved road with a valid connection.
3. Player controls: steering, accelerator, brake, D/R and reset.
4. A few AI vehicles travelling in both directions.
5. Reliable collision and recovery.
6. One AI competitor with its own equivalent passenger.
7. Shared pickup and destination; first valid drop-off wins.
8. One offensive tactical ability and one defensive shield.
9. Minimal polished HUD and Android landscape performance check.

## 6. Acceptance and reporting rules

- Every test is recorded as **PASS** or **FAIL**. “Not confirmed” means **FAIL / not accepted**.
- Never claim a feature works based only on code presence, HTTP 200, successful deployment or a prototype screenshot.
- Run relevant regression checks after each change: startup, controls, forward/reverse, steering, braking, camera, traffic, collisions, reset and mobile layout.
- Keep each implementation change small, reversible and scoped to named files.
- Do not merge experimental road/camera/vehicle changes into the production baseline until Android acceptance passes.
- Keep one active development branch at a time and merge accepted work to `master`. Delete obsolete branches only after their unique commits/assets are preserved and verified.

## 7. Current known risks

- The curved/branch-road experiments are prototypes, not accepted production gameplay. Previous Android checks reported incorrect forward/reverse direction, unstable AI movement, and unconfirmed junction selection/reset. Treat those checks as failed until retested.
- The cockpit camera is not accepted: the user reported that the attempted mode showed a high-angle view rather than a true cockpit.
- The existing master prototype is a reference baseline, not proof that the new competitive passenger-race vision is implemented.
- The Corolla GLB and road prototypes currently exist on the integration branch, not the master baseline. Asset loading and in-game appearance still require Android verification.
- Real Accra road accuracy requires verified centreline data and attribution; hand-authored test curves must not be described as surveyed roads.

## 8. Immediate next task

Audit the master prototype and integration assets against the contracts above. Then implement only Phase 1 foundations on a dedicated working branch: shared constants/types, validators and event contracts, without replacing the current driving page. Merge to master only after static checks and Android regression tests pass.
