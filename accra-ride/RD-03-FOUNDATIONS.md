# RD-03 — Road Foundations, Alignment, Width and Elevation

**Status:** IN PROGRESS — first geometry contract and pure utilities added; automated execution and real-network integration remain pending.  
**Branch:** `feature/rd-03-road-foundations`  
**Base:** RD-02 implementation branch `feature/rd-02-lane-architecture`  
**Scope:** Accra Central and Lapaz road foundation geometry.  
**Protected:** `master` and the current production driving page remain unchanged.

## Implemented in this branch

- Added `src/map/road-foundations.js`.
- Establishes a metric world-space alignment from ordered RD-02 edge centrelines.
- Removes consecutive duplicate horizontal points without mutating source graph geometry.
- Calculates horizontal length, cumulative distance, ascent, descent and maximum observed grade.
- Builds lane-centre paths and left/right carriageway boundaries from RD-02 lane widths.
- Handles directional divided carriageways, centred one-way carriageways and shared bidirectional lanes.
- Supports explicit optional shoulder and median reservations; defaults are zero rather than invented infrastructure.
- Preserves physical-road and carriageway IDs and lane/width provenance.
- Records flat or unverified vertical data as unverified; does not invent Accra terrain slopes or claim a DEM source.
- Validates graph-connected endpoints against a configurable metric tolerance and reports gaps without silently snapping geometry.
- Added deterministic tests for asymmetric divided roads, one-way roads, shared lanes, elevation provenance, invalid widths and endpoint continuity.
- Added an isolated GitHub Actions workflow for RD-03/RD-04 geometry tests.

## Important limitations

- The imported OSM projection currently supplies a flat Y coordinate. This branch does not pretend that it is measured terrain elevation.
- OSM width coverage is sparse. Inferred RD-02 lane widths remain explicitly identified as inferred.
- Foundations are not yet consumed by the live Three.js renderer.
- No junction surface, road mesh, road markings, terrain mesh or median asset is built in RD-03.
- The new test workflow has been authored but has not yet been observed passing.

## RD-03 exit criteria

1. Run all new geometry tests and relevant existing OSM/navigation tests.
2. Build foundations for representative edges from both real area datasets.
3. Verify straight, curved, divided, one-way, residential/service and connected-segment samples.
4. Confirm endpoint tolerance does not snap unrelated roads or collapse separate carriageways.
5. Record the source/provenance and uncertainty of every width and elevation value.
6. Confirm foundations preserve graph IDs and lane IDs consumed by navigation and AI.
7. Inspect Accra Central and Lapaz samples visually before RD-03 can be accepted.

## RD-04 boundary

RD-04 will consume this foundation contract to build continuous 3D surfaces. It must add curve joins, endpoint transitions, grade-aware vertices, mesh validation and performance measurements. It must not bypass RD-03 by independently offsetting raw directed edges.
