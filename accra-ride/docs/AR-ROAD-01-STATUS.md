# AR-ROAD-01 — status (La Paz → Akweteyman), stage 1: offline 3D modules

**Not complete.** This stage delivers procedural 3D infrastructure generators and their tests. The automated
OpenStreetMap extraction and interpretation pipeline has **not** been built or run, and nothing here has been
placed at a real OSM location.

## Why only the modules

The build session could not reach Overpass, Nominatim or Geofabrik (the egress proxy returned HTTP 403 for all of them),
so no live OSM data could be retrieved. The 3D modules were built first against synthetic cross-sections.
Three.js loads from a CDN in the game, so the WebGL game and its browser smoke test could not be run either.

## Delivered

| Module | File | Notes |
|---|---|---|
| Procedural footbridge | `src/map/footbridge.js` | Elevated deck + girders, end columns (and median columns when the median is >= 1.2 m), staircases and landings both sides, rails and mesh. All dimensions are `configurable-default` / `caller-override`, never OSM measurements. |
| Bus shelter | `src/map/bus-shelter.js` | Replaces the old four-box canopy inside `road-feature-renderer.js`. 17 boxes: platform, posts, roof, glazing, bench, route board, bin, stop sign. |
| Median profiles | `src/map/median-profiles.js` | Tiled-block, mesh-fence, concrete-barrier, open; per-chainage assignment; tapered transitions. Unassigned stretches resolve to `open` and are reported as `unassigned`. |
| Corridor spec | `data/corridor/lapaz-akweteyman-infrastructure.json` | Both footbridges listed with anchor `unplaced` (no coordinates invented). |
| Tests | `tests/corridor-infrastructure.test.js` | 17 tests: clearance over carriageways, stair limits, railings, rotation invariance, box budget, provenance, shelter never entering the carriageway, median profile forms and tapers, renderer integration. |
| Preview | `scripts/render-infrastructure-preview.mjs` | Software projection of the generated geometry. **Not** the WebGL game. Images in `docs/road-evidence/ar-road-01-*.png`. |

## Assumptions to confirm

- 5.5 m vertical clearance, 2.2 m deck width, 1.2 m rail height and the stair limits are engineering defaults, not Ghanaian standards or measurements.
- Footbridge staircases are straight flights running along the road, with stepped (not sloped) handrails.

## Not done

- Overpass extraction, raw-data storage with provenance, and the interpretation layer (carriageways, slip roads, junctions, pedestrian paths, bus platforms).
- Placement of the La Paz and Akweteyman footbridges at mapped positions; wiring medians and footbridges into the runtime.
- Lane markings, arrows, merge/exit markings, directional signs, day/night streetlights, collision geometry.
- Instancing/LOD/chunk loading, Android performance measurements, WebGL screenshots, browser gameplay smoke test, minimap/navigation validation.
