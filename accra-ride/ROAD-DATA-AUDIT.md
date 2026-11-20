# RD-01 — Road Data and Renderer Assessment

**Repository:** `FelixBliss/AccraRush`  
**Baseline:** `master` at the time of inspection  
**Scope:** Read-only assessment; no production runtime files changed  
**Status:** **IN PROGRESS — full dataset audit executed successfully; representative fixture rerun and Android browser baseline remain pending**

## Executive findings

1. The importer currently represents each OSM way segment as one graph edge and emits one lane record per legal direction. It does not create one lane record for every individual traffic lane.
2. For a bidirectional OSM way tagged with four total lanes, the importer calculates two lanes per direction but stores each direction as a single record whose `widthM` is the combined width of those two lanes. The renderer sees two wide directional records, not four discrete lane centre paths.
3. The renderer calculates physical road width by summing those directional record widths, then creates one simple ribbon around the edge centreline. It does not build separate carriageway surfaces or individual lane paths.
4. The renderer currently draws one continuous centreline marking on bidirectional edges. It does not generate the complete lane boundary marking layout for a four-lane divided road.
5. The importer projects every source point with `y: 0`. The committed road network therefore has no terrain elevation profile.
6. The importer discards most source OSM tags when creating `edge.osm`. Retained fields are `wayId`, `highway`, `name`, `ref`, `surface`, `maxspeed` and `oneway`. Tags such as `lanes:forward`, `lanes:backward`, `width`, `bridge`, `tunnel`, `layer`, `junction`, `sidewalk` and access metadata are not carried into the runtime edge object.
7. The renderer offsets each centreline vertex using a local perpendicular derived from its adjacent points. It has no explicit miter/bevel/round join construction, endpoint stitching or junction surface polygons. This is a likely structural source of gaps and overlaps at bends and intersections.
8. The current graph stores directed lane movement and centreline geometry, but no canonical physical-road/carriageway object, individual lane centreline geometry, or median geometry.

## Evidence from source inspection

| Area | Existing implementation | Consequence |
|---|---|---|
| OSM import | `laneCount()` reads total `lanes`; `directions()` returns forward/reverse; `lanesEach` aggregates lanes per direction | Individual lanes are collapsed into directional width records |
| Width | `widthFor()` divides explicit `width` by total lanes; otherwise assumes 3.5 m per lane | Defaults and inferred values are not distinguishable in the output |
| Metadata | `edge.osm` copies a small fixed list of tags | RD-02 cannot accurately classify all physical road forms from the current edge schema alone |
| Projection | `project()` always writes `y: 0` | No elevation/slope data in current imported geometry |
| Road mesh | `roadWidth()` sums all lane record widths; `createRoadMeshes()` builds one offset ribbon | One surface per directed edge, not a physical carriageway/lane-aware road assembly |
| Joins | `offsetPoint()` uses a local perpendicular | No robust curve joins or junction patch construction |
| Markings | One centreline LineSegments object for two-way edges | No individual lane separator/edge-line model |
| Navigation | `buildNavigationIndex()` creates one directed arc per lane record | The graph has directional movement, but not one independently addressable path per physical lane |

## Full dataset audit — GitHub Actions run 1\n\nThe new read-only audit completed successfully on both committed network JSON files in GitHub Actions (run 44831066032). It reported no missing centreline geometry, no missing core OSM edge metadata and no exact duplicate centreline geometries in either area.\n\n| Metric | Accra Central | Lapaz |\n|---|---:|---:|\n| Source OSM elements | 7,330 | 7,669 |\n| Unique OSM way IDs represented | 6,896 | 7,254 |\n| Nodes | 10,017 | 11,648 |\n| Edges | 12,511 | 14,296 |\n| Directional lane records | 22,680 | 27,713 |\n| Edges with one directional record | 2,342 | 879 |\n| Edges with forward + reverse records | 10,169 | 13,417 |\n| Exact duplicate centreline geometries | 0 | 0 |\n| Centreline Y range | 0 to 0 | 0 to 0 |\n\nThe source-element versus represented-way difference is 434 ways in Accra Central and 415 in Lapaz. The importer accepts only its explicit motor-road class allowlist; the source elements outside that allowlist are not represented in the generated network. Their precise highway classes are not available in the committed edge schema and must be counted from the original source PBF/GeoJSON if inclusion decisions are required.\n\n### Lane-width distribution findings\n\nThe most common summed directional width is 7.0 m (11,094 Accra Central edges; 13,669 Lapaz edges). The 14.0 m total-width bucket appears on only 9 Accra Central edges and 7 Lapaz edges. These values are not sufficient to identify a four-lane road reliably because the importer drops the source `lanes`, `lanes:forward` and `lanes:backward` tags and stores one aggregated width record per direction. Lapaz also contains 15 edges with summed directional width below 3 m (including values as low as 0.06 m); these are suspicious for motor-road geometry and must be traced to source tags before width fallback rules are designed.\n\n### What this means for the reported lane appearance\n\nThe committed data does not encode four individual lane centre paths for a two-way four-lane road. It encodes a forward directional record and a reverse directional record, each potentially carrying the combined width of multiple physical lanes. The renderer then creates one surface ribbon around the shared centreline and only a single continuous centre marking. Therefore, the existing pipeline cannot yet produce a semantically correct two-in/two-out lane layout with a median. RD-02 must repair the data model before RD-04 surface construction.\n\n## Existing dataset-level evidence

The committed independent OSM validation report records:

| Metric | Accra Central | Lapaz |
|---|---:|---:|
| Nodes | 10,017 | 11,648 |
| Edges | 12,511 | 14,296 |
| Lane records | 22,680 | 27,713 |
| Connected components | 32 | 42 |
| Junction nodes | 6,646 | 7,809 |
| Dead ends | 2,531 | 3,127 |
| Largest component ratio | 0.990 | 0.992 |
| Centreline geometry points | 43,040 | 51,603 |

Both network datasets passed the existing independent graph audit. That result validates graph/data properties, not physical lane layout, mesh continuity, renderer quality, elevation or Android gameplay.

## Data-audit execution

A read-only script, `scripts/audit-road-data.js`, and fixture tests are added for RD-01. GitHub Actions run 44831066032 completed successfully against both complete committed network JSON files and uploaded `road-data-audit.json` as an artifact. The script has since been extended to emit representative real-edge fixtures and flag suspiciously narrow aggregate widths; that extension requires a fresh CI run before its outputs are accepted.

The audit reports:
- per-area node, edge, source-way and geometry counts;
- road-class counts;
- lane-record counts per edge and directional record patterns;
- summed directional width distributions;
- retained OSM metadata field presence;
- duplicate centreline geometry (including reversed duplicates);
- centreline vertex count distributions; and
- world Y/elevation distribution.

The report deliberately does not claim to recover source tags already discarded by the importer. Those omissions are identified as schema gaps for RD-02.

## RD-01 exit-gate status

| Exit criterion | Status | Evidence / remaining work |
|---|---|---|
| Inspect both area datasets independently | Passed | Full per-edge audit ran for both complete committed JSON datasets in GitHub Actions |
| Document physical road vs directed-edge representation | Passed | Importer and navigation code inspected |
| Identify lane inflation/aggregation risk | Passed | One record per direction with aggregated width |
| Identify source-tag loss | Passed | Fixed `edge.osm` projection inspected |
| Inspect renderer and downstream consumers | Passed | Renderer, navigation, runtime and gameplay lane-offset logic inspected |
| Produce representative actual edge fixtures | In progress | Audit now emits real edge fixtures by highway class, lane-direction pattern and one-way tag; rerun added fixture fields and pin selected examples |
| Record current browser rendering/performance baseline | Pending | Automated smoke test exists; no current run evidence retrieved in this assessment |
| Confirm Android browser visual behaviour | Pending | Requires actual device session; cannot be established by source inspection |

**RD-01 is not marked PASSED.** It remains IN PROGRESS until the CI-generated full-data report is reviewed and representative real-road fixtures and baseline browser evidence are attached.

## Recommended RD-02 inputs

RD-02 should introduce a versioned physical-road model that distinguishes:
- source OSM way and way segment;
- physical road corridor;
- one or more carriageways;
- individual lane centre paths;
- legal lane direction;
- lane width and source/confidence;
- median/central reservation;
- junction connection and permitted movements.

Do not derive four visible lanes by duplicating lines in the renderer. The importer/schema must expose the four actual lane paths (two per direction) where source evidence supports them. Separate OSM carriageways must remain separate, and roads with unknown lane counts must remain explicitly unknown or flagged.

## Scope protection

This RD-01 work does not modify `MASTER-FOUNDATION.md`, the production HTML, the OSM network JSON files, or the existing renderer/navigation runtime. All findings are intended to guide RD-02 through RD-04 without prematurely changing production road behaviour.
