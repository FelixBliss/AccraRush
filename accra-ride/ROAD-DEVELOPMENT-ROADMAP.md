# AccraRush — Road Development Roadmap

**Document type:** Independent road-engineering roadmap  
**Scope:** Physical road design, geometry, surfaces, markings, junctions and road infrastructure  
**Repository:** `FelixBliss/AccraRush`  
**Status:** RD-01 to RD-04 planned in implementation-ready detail; implementation and acceptance remain pending  
**Protected document:** `accra-ride/MASTER-FOUNDATION.md` is not to be edited by this roadmap.

---

## 1. Purpose and boundary

This document governs the design and construction of the physical road system in AccraRush. It is separate from the Master Product and Technical Foundation roadmap. It does not replace, amend, or change that roadmap.

The road system must be derived from the imported OpenStreetMap (OSM) road network for Accra Central and Lapaz. The goal is a convincing, continuous, accurately classified and drivable 3D road environment.

The authoritative road model must be shared by:
- 3D road surfaces and markings;
- lane geometry and legal travel directions;
- junction connections and turning movements;
- player road-following and steering boundaries;
- AI traffic paths; and
- route guidance and minimap data.

A visually overlapping mesh is not proof of a connected road. A directed graph edge is not automatically a separate physical carriageway. Geometry and traffic must not independently invent conflicting road layouts.

## 2. Non-negotiable design rules

1. Preserve OSM geographic alignment and source attribution.
2. Do not replace real roads with synthetic straight roads or invented connectors.
3. Never infer a road connection from visual overlap alone; use explicit graph connectivity.
4. Distinguish physical road segments, carriageways, directed edges and lanes.
5. Do not double physical road width or lane markings when the graph contains directional representations of the same road.
6. Use four traffic lanes total (two each way) and a central concrete block-tile divider only where source data and road configuration support a divided four-lane road. Do not force this design onto every road.
7. Respect one-way roads, separate carriageways, road class, width, bridge/tunnel/layer tags and access restrictions where present.
8. Use credible elevation/terrain data for slopes. Do not invent dramatic gradients from 2D OSM geometry.
9. Avoid exposed terrain at road joins and junctions without concealing unrelated land under oversized road meshes.
10. Performance must remain suitable for Android browser gameplay.
11. A phase is not accepted because code compiles or a deployment succeeds. Record measurable tests and manual gameplay evidence.
12. Keep the current production driving page and `master` branch protected until the relevant acceptance gates pass.

## 3. Existing implementation baseline

The following baseline was inspected on `master` before this roadmap was created:

- `accra-ride/src/map/three-road-renderer.js` currently builds simple offset ribbon meshes, grouped by OSM highway class.
- Its road width is currently the greater of a class default and the sum of lane widths attached to an edge. The data audit must establish whether this represents a physical carriageway width correctly for each imported edge and whether reciprocal/directional records can cause duplication.
- Its centreline marking is a single continuous line emitted for edges that contain both forward and reverse lanes. It is not yet a complete lane-marking system.
- Its offset geometry uses a local perpendicular at each centreline point. It does not yet implement robust miter/bevel/round joins or explicit junction surface construction.
- `accra-ride/src/map/road-navigation.js` builds directed navigation arcs from lane directions and samples centreline geometry. The road construction must preserve compatibility with this graph contract or introduce a versioned, tested adapter.
- The independent OSM audit report on master records both Accra Central and Lapaz as passed at the dataset/connectivity-audit level. This is not renderer or Android gameplay acceptance.

This is a code-inspection baseline, not a claim that the current road renderer is complete.

## 4. Road development sequence

| ID | Stage | Status |
|---|---|---|
| RD-01 | Road data and renderer assessment | Defined; execution pending |
| RD-02 | Physical road classification and lane architecture | Defined; execution pending |
| RD-03 | Road foundations, alignment, width and elevation model | Defined; execution pending |
| RD-04 | Continuous 3D road surface construction | Defined; execution pending |
| RD-05 | Junction and turning-surface construction | Planned |
| RD-06 | Lane markings and road-edge markings | Planned |
| RD-07 | Concrete block-tile median construction | Planned |
| RD-08 | Terrain elevation, slopes and vertical transitions | Planned |
| RD-09 | Asphalt materials and repaired-surface detailing | Planned |
| RD-10 | Kerbs, sidewalks, shoulders and drainage | Planned |
| RD-11 | Crossings, arrows, stop lines and road furniture | Planned |
| RD-12 | Road-network and gameplay integration | Planned |
| RD-13 | Independent Accra Central and Lapaz validation | Planned |
| RD-14 | Android browser road acceptance and release approval | Planned |

---

# 5. Detailed implementation plan — first four stages

## RD-01 — Road data and renderer assessment

**Objective:** Establish exactly what the imported data represents before changing road geometry.

### Work
1. Inspect both generated network datasets and document their schemas, IDs, coordinate systems, centreline ordering, node references, lane records and OSM tags.
2. Inventory road classes and relevant tags, including `highway`, `lanes`, `lanes:forward`, `lanes:backward`, `oneway`, `width`, `maxspeed`, `junction`, `bridge`, `tunnel`, `layer`, `surface`, `sidewalk`, `cycleway` and access restrictions where available.
3. Identify whether opposite directions are represented as lanes on one edge, separate directed edges, separate carriageways, or a mixture.
4. Detect duplicate or near-duplicate centreline geometry without deleting legitimate parallel carriageways, ramps or frontage roads.
5. Map every road edge to its physical road/carriageway interpretation and identify ambiguous cases for review.
6. Inspect the current renderer, navigation index, player road-following and AI route consumers to identify all geometry assumptions.
7. Record current performance and rendering behaviour in Accra Central and Lapaz where a browser test is available.
8. Create representative test samples: divided highway, undivided two-way road, one-way street, residential road, service road, ramp/link, curved road and multi-arm junction.

### Required outputs
- `road-data-audit.json`: machine-readable counts and issue samples for each area.
- `ROAD-DATA-AUDIT.md`: schema explanation, road-representation findings and unresolved ambiguities.
- Representative edge/road fixtures for automated tests.
- Baseline renderer/navigation test results.

### Exit criteria
- Both area datasets are inspected independently.
- Physical road versus directed-edge representation is documented.
- Potential duplicate carriageways and lane-count inflation are identified with examples.
- No ambiguous lane or width assumption is silently promoted to a universal rule.
- The current renderer limitations and downstream consumers are documented.

**Failure condition:** If the audit cannot distinguish separate carriageways from duplicate representations reliably, RD-02 must not invent a lane layout. Ambiguous records remain flagged for review.

## RD-02 — Physical road classification and lane architecture

**Objective:** Define a consistent physical-road and lane model that accurately represents the source network and can be shared by rendering, traffic and navigation.

### Work
1. Define explicit concepts and stable IDs for physical road, carriageway, directed edge, lane, lane boundary and junction connection.
2. Define deterministic classification rules using OSM tags and audited geometry. Keep source values and confidence/provenance with derived values.
3. Resolve lane counts in this order: explicit directional lane tags; explicit total lane tags combined with one-way/direction semantics; verified separate-carriageway geometry; then a conservative class-based estimate only when necessary and clearly marked as inferred.
4. Keep unknown lane counts unknown or flagged rather than pretending every road has four lanes.
5. Model divided and undivided roads separately:
   - Divided four-lane example: two lanes in one direction, a central physical median, and two lanes in the opposite direction.
   - Undivided two-way road: opposing traffic lanes without a physical central median unless supported by the source/design.
   - One-way road: only legal direction(s), with no fabricated opposing flow.
   - Separate OSM carriageways: preserve their actual alignment and separation; do not combine them into one oversized ribbon.
6. Define lane width and carriageway width calculation rules. Avoid summing both directional carriageways into a single physical width.
7. Define lane centre paths and legal lane-to-lane junction movements. Renderer and vehicle systems must consume the same IDs.
8. Define fallback handling for missing width/lane tags and keep inferred values distinguishable from measured/tagged values.
9. Add validation for contradictory tags, impossible widths, duplicate lane IDs, invalid directions and mismatched lane totals.

### Required outputs
- Versioned road/lane data contract.
- Road classification and width derivation specification.
- Lane-layout fixtures covering the representative RD-01 road types.
- Automated schema and invariant tests.

### Exit criteria
- A divided four-lane test road produces exactly four traffic lanes, two per direction, and one median definition.
- Directional edge duplication cannot double physical road width or create extra visible lanes.
- One-way, undivided and separate-carriageway fixtures render with their correct configurations.
- Lane IDs and legal directions remain consistent with navigation and AI consumers.
- Inferred values are explicitly marked and traceable.

**Failure condition:** Any fixture that produces the wrong number of physical lanes, illegal direction, or doubled carriageway width blocks RD-02.

## RD-03 — Road foundations, alignment, width and elevation model

**Objective:** Establish a stable geometric foundation for constructing road surfaces that align with the real network and terrain.

### Work
1. Define the world-space road coordinate contract and conversion from geographic coordinates. Preserve metric units and a consistent vertical axis.
2. Define the canonical road alignment from ordered centreline geometry, with stable start/end node references and continuity checks.
3. Calculate carriageway boundaries and lane centre paths from the RD-02 physical road model, not by independently offsetting every directed edge.
4. Introduce a robust cross-section model that can describe carriageways, lanes, shoulders, median reservation and road edges without forcing all components onto every road.
5. Establish endpoint snapping tolerances and geometry validation for adjacent connected segments. Snapping must not collapse legitimate divided carriageways or close unrelated nearby roads.
6. Define curve sampling and smoothing rules that preserve the source alignment and do not cut corners across junctions or buildings.
7. Establish the elevation data contract:
   - retain source Z/elevation when valid;
   - use a suitable DEM/terrain source for ground elevation when available;
   - preserve bridge, tunnel and layer relationships;
   - interpolate only between supported elevation samples;
   - flag missing or uncertain vertical data.
8. Define maximum allowed grade/vertical discontinuity checks as configurable engineering limits, with exceptions reviewed for real terrain or structures.
9. Define how road surfaces meet terrain and how cut/fill or terrain blending will be handled without creating visible green gaps.
10. Create geometry fixtures for straight, curved, sloped, connected and divided roads.

### Required outputs
- Versioned road-foundation geometry contract.
- Coordinate/elevation provenance specification.
- Cross-section and boundary generation utilities.
- Geometry fixtures and automated continuity/grade tests.
- A documented elevation data source decision for Accra Central and Lapaz.

### Exit criteria
- Road alignment is consistent with the source geometry and navigation edge identity.
- Connected endpoints meet within a defined tolerance.
- Lane and carriageway boundaries are stable through curves.
- Separate carriageways remain separate.
- Elevation is traceable to source data or clearly flagged as unavailable/inferred.
- No unsupported elevation spikes or abrupt vertical jumps are introduced.

**Failure condition:** If reliable elevation data is unavailable, the system must use a documented conservative fallback and keep realistic slope claims pending; it must not fabricate terrain grades.

## RD-04 — Continuous 3D road surface construction

**Objective:** Replace fragile ribbon construction with continuous, watertight road-surface geometry suitable for real gameplay.

### Work
1. Build road meshes from RD-03 cross-sections and alignment, not from independent per-edge perpendicular offsets.
2. Implement stable curve joins using appropriate miter limits and bevel/round fallback behaviour for sharp bends.
3. Construct endpoint transitions between connected road segments and ensure width changes are gradual and intentional.
4. Generate explicit junction surface geometry from legal graph connections and adjoining carriageway boundaries. Visual intersection must agree with the road graph.
5. Handle ramps, slip roads, divided carriageways, bridges and tunnels without accidental surface merging.
6. Set consistent vertex winding, normals, UVs and material boundaries. Check for degenerate triangles, inverted faces and z-fighting.
7. Ensure road meshes cover their intended footprint without exposed terrain slivers at segment joins. Do not hide failures by creating oversized rectangles or covering unrelated terrain.
8. Keep the mesh generation batched or otherwise performance-conscious, while preserving per-road metadata needed for debugging and collision/interaction.
9. Add a temporary road-surface diagnostic mode for edge IDs, road boundaries, junction boundaries and mesh validation; keep diagnostics out of the player-facing UI.
10. Add deterministic geometry tests for:
    - straight segments;
    - gentle and sharp curves;
    - connected segment endpoints;
    - T, Y and multi-arm junctions;
    - changing road widths;
    - divided roads and separate carriageways;
    - bridges/tunnels/layer-separated crossings;
    - sloped roads.
11. Measure geometry size, draw calls, memory and frame-time impact on representative Accra Central and Lapaz samples.

### Required outputs
- Reconstructed road surface generator.
- Geometry validation utilities and automated tests.
- Before/after road mesh fixtures or screenshots from the same test locations.
- Performance comparison against the baseline.
- Known-limitations report.

### Exit criteria
- No open surface gaps at connected segment endpoints or constructed junctions in the automated fixtures.
- No accidental connections at grade-separated crossings.
- No duplicate physical road surfaces caused by directional graph records.
- Correct road width and cross-section are preserved through curves and junctions.
- No invalid mesh indices, degenerate triangles or inverted surface normals in test fixtures.
- Performance remains within the project's Android browser budget, with measurements recorded.
- Accra Central and Lapaz test scenes can be loaded for manual visual review.

**Failure condition:** Any broken road join, false junction, doubled carriageway, visible terrain gap in a required fixture, or unacceptable Android performance regression blocks RD-04 acceptance.

---

## 6. Later stages — reserved scope

The following stages are intentionally not implemented by RD-01 to RD-04. They follow only after the foundations and base road surfaces are accepted.

- **RD-05 — Junction and turning surfaces:** legal turn geometry, junction islands, merge/diverge areas and turn radii.
- **RD-06 — Lane and edge markings:** lane dividers, centre lines, edge lines, arrows, stop lines and crosswalk markings.
- **RD-07 — Concrete block-tile medians:** modular median segments, end treatments, junction openings and collision behaviour where supported.
- **RD-08 — Elevation and slopes:** full terrain integration, grade transitions, bridge/tunnel vertical profiles and validation.
- **RD-09 — Asphalt finish:** procedural asphalt variation, resurfacing/repair patches, subtle wear and surface transitions.
- **RD-10 — Roadside construction:** kerbs, sidewalks, shoulders, drainage and roadside transitions.
- **RD-11 — Road safety details:** signs, road studs, pedestrian crossings and other supported road furniture.
- **RD-12 — Gameplay integration:** player boundaries, AI lane paths, legal passing, navigation and minimap alignment.
- **RD-13 — Independent area validation:** separate Accra Central and Lapaz geometry, connectivity, route and traffic audits.
- **RD-14 — Android acceptance:** actual Android browser driving, visual inspection, performance review and release decision.

## 7. Reporting template

Every stage report must include:

- Stage ID and branch/commit.
- Files created or changed.
- Source data and sample locations used.
- Implementation details.
- Automated tests run and exact results.
- Visual/performance evidence.
- Android browser evidence, if applicable.
- Known failures and unresolved assumptions.
- Status: **NOT STARTED**, **IN PROGRESS**, **BLOCKED**, **FAILED**, or **PASSED**.
- Acceptance decision and reviewer evidence.

Do not mark a stage PASSED without its exit criteria and supporting evidence.

## 8. Change-control rule

This roadmap is maintained independently. Changes to it must not modify `accra-ride/MASTER-FOUNDATION.md`. Road implementation must be developed on a dedicated feature branch and reviewed before integration. The production driving page remains protected until the relevant road and gameplay acceptance gates pass.
