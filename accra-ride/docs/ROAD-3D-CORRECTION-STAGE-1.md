# 3D road correction — Stage 1: inspection findings and baseline

Branch `fix/road-3d-engineering`, cut from accepted `master` `d8dcd55` (2026-11-25).

**Method and limits.** Findings below come from reading the code and measuring the committed data. **No defect was reproduced at
runtime**: the game loads Three.js from `cdn.jsdelivr.net`, which the build session's network policy blocks, so the real game, WebGL
rendering and Android-browser checks could not be run. Each item is labelled *confirmed by code/data* or *hypothesis (needs runtime repro)*.

## Baseline (master, unchanged)

`npm test`: 107 tests, 105 pass, 0 fail, 2 skipped (previously recorded against this exact master baseline; not rerun during the current correction because the GitHub host is unreachable from the execution container). A fresh run is still required on the rebased candidate.

## Data facts (measured on `data/osm/lapaz.network.json`)

- 263 edges: 199 `route`, 64 `connector`. Lanes per edge: 1→15, 2→110, 3→104, 4→31, 5→3 edges.
- **Every centerline point in the committed OSM network has `y = 0`.** The network itself has no per-node elevation values. PR #53 adds a separate DEM profile at runtime; do not confuse that runtime overlay with source network elevations.
- 7 edges are tagged `bridge=yes, layer=1` (54, 68, 105, 366, 370, 56 and 59 m). Their decks are drawn at the imported `y`, i.e. at ground level.

## Findings by reported defect

### A. Vehicle sinking
- *Confirmed:* the player's height is never updated. `player.position` is set once to `(2.75, 0, 3.1)` (`accrarush.html:112`) and the frame loop changes only `x` and `z` (lines 286–287). `applyRoadPose` hard-codes `y = 0` for AI and re-spawn (line 236).
- *Confirmed:* the visible ground is a single flat 12 km plane at `y = -0.28` (line 103); road surface sits at `+0.035`, medians top out at about `+0.305`.
- *Consequence:* on today's flat data nothing is sampled, so any elevation work (PR #53) turns the fixed `y = 0` into a real sinking/floating bug.
- *Hypothesis:* the reported "under the road" cases are the car driving into the 0.28 m raised median or bridge parapets, which have no collision, and so appearing to be below the surface.

### B. Road boundary violations
- *Confirmed:* **the player has no road-boundary collision at all.** `findNearestRoad` is used only to build `playerPose` for the minimap and HUD (lines 289–290); the comment at line 283 says the road does not constrain the car. The only collision test is vehicle-to-vehicle (`hypot(dx, dz) < 3.0`, line 341).
- Medians, parapets, guardrails and footbridge columns therefore have no physical presence.

### C. Missing road surfaces
- *Hypothesis:* the per-class road meshes and junction fans use `MeshStandardMaterial` with the default `FrontSide` (`three-road-renderer.js:388–390`), so any triangle with downward winding vanishes. `road-surface-geometry.js` enforces upward winding and counts `invertedTriangles`, but the junction fan in `three-road-renderer.js:360–370` builds its own triangles. Only the marking and median materials are `DoubleSide`.
- Needs: render the corridor, run a per-triangle `normal.y` audit, and look for gaps against the 64 connector edges.

### D. Suspended / disconnected roads
- *Confirmed:* with all `y = 0` and ground at `-0.28`, roads sit 0.31 m above the grass plane everywhere, and the bridge decks are not elevated.
- *Hypothesis:* "hanging" sections are the connector/ramp edges around Tetteh Quarshie, which are rendered but excluded from the route graph (see `docs/LAPAZ-MADINA-ALIGNMENT-AND-VISUAL-REFERENCE.md`).

## Median openings, junctions, AI
- Medians are generated only where opposing carriageways are paired (`addVerifiedCarriagewayMedians`, 0.28 m high). The code has no concept of an opening, and navigation has no cross-carriageway edges, so a median opening currently cannot be a route.
- AI follows directed route lines (`u.route`, `roadRuntime.sample`) and does not read geometry; there is no AI turning logic across a median.

## Overlap with open PRs (reconciled for the route-preserving foundation)

| PR | Base | What it already touches |
|---|---|---|
| #53 *road infrastructure and median design* | master | `road-elevation.js`, `road-terrain.js`, `build-lapaz-elevation.js`, `roadside-access.js`, `road-navigation.js`, `road-network-runtime.js`, `accrarush.html`, feature renderer |
| #52 *AR-ROAD-01 infrastructure* | #51's branch | `pedestrian-bridge-renderer.js`, feature renderer, runtime |
| #51 *Lapaz–Akweteyman section and entry signs* | master | `area-building-renderer.js`, `area-entry-sign-renderer.js`, runtime |

Building elevation, terrain, medians or footbridges again here would duplicate #53 / #52 and conflict with them.

## External repositories

Only `whidrubeld/three-map-terrain` could be matched by name; the supplied links for `osm_3d_model`, `mapforge`, `kit-cidade-lowpoly` and `codriver`
are not in this session and several candidates exist for `osm_3d_model`. No source has been integrated; licences have not been checked.

## Stage 1 result

Inspection complete, baseline recorded. Stages 2–9 are blocked on the decisions listed in the PR description.


## Route integrity correction — 2026-11-25

The comparison against PR #53 found that its original draft changed the approved corridor:
- Start moved from `osm-node-5.6095021_-0.2507127` (Lapaz) to `osm-node-5.6057850_-0.2514423` (Abeka–Lapaz Junction).
- Outbound route changed from 125 steps / 18,738 m to 120 steps / 18,312.331 m.
- Return route changed from 112 steps / 16,716 m to 107 steps / 16,290.129 m.
- Five Mampon Okai Avenue segments were removed from outbound and the matching five were removed from return.

**Correction committed on the PR #53 infrastructure branch:** `c1032546836045958fcae44a110cee6b5b27178a`. The branch subsequently received the generated DEM refresh commit `557545279925173b6ac158be441085194e522e04`.

The current route and section files are byte-identical to the accepted master blobs:
- `lapaz-madina-route.json`: `7001ebe510b3253a9d373b9be887c1c4dfef0006`.
- `lapaz-madina-sections.json`: `4d32154a74e508c86f90f4f099d7b92dad61d986`.

Source-data checks on the current branch confirm:
- Original Lapaz and Madina endpoint IDs.
- 125 outbound steps and 112 return steps.
- 18,738 m outbound and 16,716 m return; 18.7 km route reference.
- Mampon Okai Avenue and the five restored route edges.
- Outbound and return step-to-step node continuity.
- Every route edge ID exists in the unchanged selected OSM network.
- All 199 unique route nodes have an elevation sample in the regenerated 199-sample DEM profile.
- The Lapaz section alignment is restored to the 125-step master route.
- The PR #53 feature extracts retain all master features and add 113 Lapaz features plus 61 Accra Central features; no master feature IDs were removed.

An automated regression test, `accra-ride/tests/lapaz-route-integrity.test.js`, now pins the exact master route/section Git blob IDs and checks endpoints, counts, distances, continuity and network edge membership.

## Current validation status

- Source-data route audit: completed as described above.
- Automated route-integrity test: committed, **not executed locally**.
- Full Node suite on corrected head: **not run**.
- GitHub Actions core-test and browser-smoke runs for the current head report `action_required` and expose no jobs; they are not passing test evidence.
- Vercel reports a successful deployment status for the current head; that is deployment status only, not proof of correct rendering.
- Browser gameplay and WebGL inspection: **NOT TESTED**.
- Samsung Android browser acceptance: **NOT TESTED**.

## Stage 1 result and Stage 2 handoff

The source inspection and route correction are recorded. The corrected route-preserving infrastructure candidate is the foundation for Stage 2. Continue with targeted repository source/licence inspection and reconcile #51/#52 unique work. Do not duplicate existing #53 systems. Do not merge the PRs or claim runtime acceptance until the required tests and device review pass.
