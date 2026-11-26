# Lapaz–Madina Corridor Road Design Specification

**Branch:** `feature/lapaz-madina-road-design`  
**Base:** current `master` after the approved Lapaz–Madina corridor merge  
**Scope:** complete road-and-environment treatment for the existing Lapaz → Madina route.  
**Status:** implementation contract; not a claim that the visual features or Android acceptance are complete.

## Design principle

Keep the approved Accra route, source OSM alignment, route ordering, and legal road graph. Build an original AccraRush driving environment on top of that geography. OSM is a source of road alignment, road class, junctions, mapped facilities, and attribution—not a requirement to copy OSM's visual appearance. Do not replace the corridor with a schematic road or import unrelated city roads.

## 1. Road cross-sections

Resolve each route section independently from its OSM classification, lane tags, paired carriageways, and measured road width. Do not force one width across the whole corridor.

- Major divided highways: target 3 lanes inbound + 3 lanes outbound (six running lanes) only where the source geometry/available corridor supports it. Retain the measured carriageway separation and build the median in the gap.
- Other major roads: 2 + 2 lanes where the source road supports four running lanes.
- Secondary/branch roads: normally 1 + 1 or 2 + 2 according to source evidence and available width.
- Preserve one-way ramps, service roads, slip roads, roundabouts, and shared two-way streets as their own legal graph edges.
- Nominal lane design width: 3.5 m for main roads; 3.25 m for constrained urban sections; 3.0 m only for low-speed access roads. Every override must be stored on the generated section manifest.
- Add asphalt shoulders where the physical cross-section has room. Never consume a pedestrian path, median, or adjacent building footprint to create a shoulder.
- Road surfaces must be continuous asphalt meshes with UVs/material variation, clean joins, edge transitions, curves, and slope-following geometry. Do not render the carriageway as a flat extruded geometric ribbon.

## 2. Median family

Use the actual gap between opposing carriageways or an explicit OSM median/divider feature. Do not create a median across a junction opening, legal turning gap, or unpaired road.

Supported median treatments, selected per section:
1. Raised tiled median: modular paving slabs with visible joints, curb faces, and end transitions.
2. Guarded median: metallic crash barrier/guardrail with posts and continuous rail.
3. Mesh-block median: modular metal mesh security panels between robust posts, with block/concrete plinths; use only where a divided-road barrier is appropriate.
4. Landscaped median: low planting beds and flowers, contained by tiled/concrete edges; keep plants below sightline-critical heights near junctions.
5. Plain raised concrete median for narrow gaps.

All median pieces follow the road's horizontal curvature and vertical profile. Provide safe openings only at mapped or deliberately authored legal turn movements. Never block an OSM junction or turn connection.

## 3. Bus-stop lay-bys and pickup bays

Bus stops and pickup/drop-off facilities must be actual road geometry, not pavement tiles or decorative roadside pads.

For each mapped or authored stop:
- Create a deceleration/entry taper branching from the correct carriageway.
- Create a dedicated asphalt stopping bay sized for the selected vehicle envelope.
- Continue with an exit taper that rejoins the same-direction carriageway.
- Add a parallel stop platform, shelter, sign/pole and pedestrian connection to the walkway.
- Keep the bay and its entry/exit paths in the road graph with stable IDs and legal directed connections.
- Prevent the player and AI from treating the sidewalk/platform as drivable road.

For pickup areas, use a separate pull-off bay with entry and exit tapers. Do not reuse the bus platform as the vehicle path. Where there is insufficient physical room, use a short kerbside stopping pocket with a clearly marked safe pull-in/out path rather than inventing a large interchange.

## 4. Walkways and pedestrian infrastructure

- Provide continuous, visibly wide walkways along both sides where the road environment allows; target 2.5–3.0 m on major urban sections and 1.8–2.0 m on constrained streets.
- Walkways follow road curves and grades, have kerbs/ramps at crossings, and remain outside the vehicle carriageway.
- Add pedestrian barriers only where needed; do not obstruct access to stops, properties, or crossing points.
- Pedestrian bridges span the full road cross-section at their location: all carriageways, medians, shoulders and slip lanes that physically pass beneath the bridge. Their deck width is derived from the complete road width, not one carriageway.
- Mapped overhead gantries must measure nearby parallel carriageways and span the complete divided-road width, not only the nearest carriageway.
- Include ramps/stairs, supports outside the running lanes where possible, parapets and safe deck clearance. Do not draw a bridge that terminates over a median or halfway across the road.

## 5. Crossings and signals

- Zebra crossings are clipped to the drivable asphalt footprint of the relevant carriageway/approach. No stripe may spill onto a walkway, verge, building or grass.
- Split multi-carriageway crossings into aligned crossing segments with median refuge where the median is physically walkable.
- Add pedestrian signal heads at controlled zebra crossings.
- Add vehicle traffic lights at mapped signalised junctions and authored signalised branch-road intersections. A branch road alone is not sufficient evidence for a signal: use junction class, road hierarchy, crossing demand, and a deterministic authored-signal rule.
- Signal poles, heads and stop lines must align with the correct approach and lane direction. Do not place signals on the wrong carriageway.
- Preserve stop lines, turning arrows and lane-direction arrows without overlapping junction patches.

## 6. Terrain, slopes and asphalt appearance

- Current OSM import supplies horizontal geometry but does not supply surveyed metric elevation. Do not pretend its zero-height coordinates represent real terrain.
- Sample a public DEM (30 m or better where available) along route centreline and roadside offsets, record source/resolution/date, convert elevation to the project's metre/Y coordinate convention, and apply a controlled vertical profile.
- Smooth DEM noise without flattening genuine hills; enforce plausible grade and vertical-curve limits while preserving route topology. Bridge/tunnel layers must remain separated and bridge decks must clear underlying roads.
- Report ascent, descent, maximum grade and elevation provenance per section.
- Asphalt should use a dark aggregate-like material with subtle roughness/normal variation, UVs aligned to travel direction, restrained patching, and road-edge transitions. No bright flat grey geometric-looking road strips.
- Shoulders, kerbs, drainage edges and sidewalks must follow the same profile.

## 7. Player start at Abeka–Lapaz Junction

- Place the player on the approved main Lapaz→Madina route at OSM node `osm-node-5.6057850_-0.2514423` (5.605785, -0.2514423), the mapped connection between Mampon Okai Avenue and George Walker Bush Highway near Abeka–Lapaz Junction. This is approximately 68 m from the published Abeka-Lapaz locality coordinate; it is a route-node snap, not a surveyed junction centroid.
- The route manifest now starts at this node and removes the preceding 425 m approach segment from the playable start. The return route ends at the same node.
- Spawn heading must equal the sampled outbound route tangent. The vehicle's nose must point along the forward route direction.
- Spawn lane must be a legal outbound lane, away from junction conflict areas and not on a median, shoulder, bus bay or pedestrian path.
- Validate the exact OSM node/edge and offset against the route manifest before acceptance. If the junction is not an unambiguous route start, use the nearest safe mainline point after the junction and document its coordinates.
- Reset must return to this same valid forward-facing spawn.

## 8. Data model and generation

Generate one versioned section manifest from the approved corridor manifest and source road graph. Each section records:
- source edge/way IDs, name/class, start/end node IDs, route order and source provenance;
- lane count/direction/width, shoulder width, median type/width, walkway widths;
- measured alignment, DEM elevations and grade metrics;
- junctions, legal turns, bus-stop bays, pickup bays, crossings, signals and pedestrian bridges;
- generated asset IDs and deterministic generation seed.

Every generated drivable bay/connector must be a graph edge with explicit legal connections. Visual objects must never imply a drivable connection.

## 9. Required audits and acceptance

Automated tests must cover:
- continuous route surface and no geometry gaps/folds at every section boundary;
- lane counts and directionality by section; no accidental 6-lane expansion on narrow roads;
- median width and openings; mesh/guardrail/tile pieces remain inside the measured median footprint;
- bus-stop and pickup entry/exit paths connect to the correct direction and rejoin the main road;
- walkway continuity and separation from drivable lanes;
- bridge deck spans the full local road width;
- zebra stripes are fully clipped to road surfaces;
- signals face the correct approaches and crossing controls;
- terrain elevation provenance, non-zero slopes where DEM data confirms them, grade limits and bridge/tunnel clearance;
- player spawn on the main outbound route with forward heading;
- Android browser visual/gameplay smoke, traffic navigation, minimap and performance.

Acceptance remains **FAIL / not accepted** until route build, automated tests, independent road/infrastructure audits, and the user's Android-browser gameplay review pass. APK testing is not a substitute.
