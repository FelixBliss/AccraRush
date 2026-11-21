# RD-02 — Physical Road Classification and Lane Architecture

**Status:** IN PROGRESS — first implementation and dataset regeneration completed; physical-road grouping and final acceptance remain open.  
**Branch:** `feature/rd-02-lane-architecture`  
**Base:** PR #28 branch `fix/road-lanes-surface-and-map-previews`  
**Source:** Geofabrik Ghana OSM PBF, snapshot SHA-256 `fad4e9cd47a0e73ba978131994378229aeefb353cdd142e2d5438e8b6ff7e816`

## 1. Problem corrected

The previous importer assigned four lanes to every motorway/trunk/primary/secondary edge and two lanes to every other supported class, regardless of OSM lane tags. It ignored `lanes`, `lanes:forward`, `lanes:backward`, and most road-width and road-structure tags. That made inferred gameplay defaults indistinguishable from actual OSM facts.

RD-02 now interprets explicit OSM lane data first and labels every fallback as inferred.

## 2. Lane interpretation rules

1. Explicit `lanes:forward` and `lanes:backward` values take precedence.
2. Explicit `lanes` total is honoured. If it does not specify directional allocation, the split is marked mixed/inferred rather than presented as a source fact.
3. A one-lane, two-way road is represented as one shared physical lane (`direction: both`); navigation exposes a legal arc in each direction without duplicating the physical lane.
4. `oneway=yes/1/true`, `oneway=-1`, and roundabout semantics preserve the legal direction and never create an opposing lane.
5. When lane tags are absent, the existing game fallback remains: on two-way major roads, four total lanes (two each way); on two-way branch roads, two total lanes (one each way). For one-way roads, the corresponding class fallback is placed only in the legal direction. These values are marked `inferred:highway-class`.
6. Tagged `width` values are converted to metres and divided by the classified physical lane count. Missing widths use an explicitly inferred 3.5m lane width.
7. Contradictory tags are retained as classification warnings rather than silently discarded.

## 3. Runtime road model

Each imported edge now carries a `roadModel` record containing:
- forward, reverse, shared and total physical lane counts;
- one-way flag and one-way direction;
- lane-layout source and confidence (`tagged`, `mixed`, `inferred`);
- width source, tagged carriageway width and calculated lane width;
- classification warnings.

Lane records keep stable IDs, direction and width. Each edge now has stable `physicalRoadId` and `carriagewayId` values derived from its OSM way ID, so segments split from the same source way remain grouped. Separate OSM ways remain separate carriageways; the importer deliberately does not guess a shared corridor ID for parallel ways until their relationship is verified. The importer also retains source tags required by later stages: lane totals/directional counts, width, bridge, tunnel, layer, junction, access, vehicle, motor-vehicle, sidewalk and cycleway.

Navigation understands shared bidirectional lanes. The renderer still uses its existing class-based minimum surface widths; applying the physical cross-section widths to constructed geometry belongs to RD-03/RD-04.

## 4. Regenerated OSM dataset evidence

The full source graphs were regenerated from the same Geofabrik Ghana PBF. The committed runtime datasets are the connected reduced graphs (40% retained by the existing reducer).

### Accra Central
- Runtime edges: 5,005
- Tagged lane layout: 1,109 edges
- Mixed/tagged-total with inferred directional allocation: 336 edges
- Highway-class fallback: 3,560 edges
- Tagged width: 9 edges; inferred default width: 4,996 edges
- Directional physical lanes: 7,967 forward; 3,427 reverse; 0 shared

### Lapaz
- Runtime edges: 5,719
- Tagged lane layout: 424 edges
- Mixed/tagged-total with inferred directional allocation: 155 edges
- Highway-class fallback: 5,140 edges
- Tagged width: 7 edges; inferred default width: 5,712 edges
- Directional physical lanes: 6,895 forward; 5,435 reverse; 0 shared

The independently generated report is `data/osm/lane-architecture-report.json`.

**Interpretation:** OSM lane data is sparse, especially in Lapaz. Most lane layouts and almost all widths are still inferred. These values must not be described as measured road dimensions. The fallback gives the current game a consistent starting lane layout, but should be refined with better source data or verified road-specific overrides where visual/geographic evidence requires it.

## 5. Automated verification

The import workflow runs:
- OSM import unit tests;
- lane-classification fixtures;
- directed-navigation and runtime integration tests;
- the existing independent whole-network audit;
- a separate independent RD-02 lane audit.

The independent lane audit checks lane IDs, positive widths, count reconciliation, lane provenance, one-way legality, shared-lane semantics and tagged-width reconciliation for both areas.

Fixture coverage includes explicit directional lanes, total lane counts, odd totals, reverse-only roads, roundabouts, metric/imperial width, contradictory tags, inferred fallback and a shared one-lane two-way road.

## 6. Remaining RD-02 work

- Add evidence-based corridor grouping for paired OSM ways representing opposite carriageways of the same divided road; do not group solely by shared name.
- Verify separate carriageways are never collapsed or counted twice.
- Complete representative road-type review for divided highway, undivided two-way road, one-way street, residential street, service road, ramp and junction.
- Decide and document how ambiguous OSM lane/width records are reviewed or overridden without fabricating source facts.
- Confirm the renderer, navigation and AI consumers use the same physical-road/lane identities.
- Complete independent review and acceptance before marking RD-02 PASSED.

## 7. Boundary

RD-02 does not implement RD-03 alignment/elevation reconstruction or RD-04 continuous road-surface geometry. It does not change vehicle assets, player controls or gameplay UI. `MASTER-FOUNDATION.md` remains untouched.
