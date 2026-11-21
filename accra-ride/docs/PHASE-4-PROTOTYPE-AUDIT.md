# Phase 4 prototype audit

The prototypes README states these pages are isolated sandboxes, not loaded by index.html or 3d-prototype.html, and not Android-certified. This is a source-level disposition, not a runtime pass.

| Prototype | Experiment | Candidate to reuse | Not production-ready |
|---|---|---|---|
| curved-road-graph.html | Curved road, road-relative steering and traffic sandbox with curve/player/traffic/collision/reset indicators | Curve tangent/normal and road-relative vehicle-following ideas after extracting pure functions and tests | Test curve is explicitly not surveyed Accra geography; traffic/collision not runtime certified |
| branch-road-network.html | Branch/junction sandbox with minimap and driving controls | Branch selection and map drawing concepts | No complete legal-turn, lane restriction, reachability or Android proof |
| combined-curved-driving.html | Combined curved driving experiment using synthetic Catmull-Rom geometry | Curve sampling and integrated steering experiments | Synthetic geometry; not connected to authoritative graph |
| curved-road-traffic-environment.html | Alternate curved-road/traffic environment with similar test indicators | Compare with curved-road-graph and retain only measurable improvements | Overlapping experiment; no evidence it is superior or certified |
| graph-integration-driving.html | Three.js graph-oriented driving experiment with embedded Central Accra node/road arrays | Study edge-following and scene construction | Embedded map explicitly gameplay-scaled, not survey-grade GIS; no source provenance |
| graph-integration-diagnostic.html | Graph diagnostic sandbox with HUD status and a separate minimap canvas | Diagnostic and same-graph minimap test concepts | Its graph/minimap are schematic preview data, not authoritative production graph |

## Reuse gate
Extract pure mechanics into core modules, add deterministic tests, compare positions to graph-derived expectations, profile on target Android, then port. Never copy a complete prototype HTML page into production. speed-recovery-overtaking.html is also listed in the README but was outside the six prototypes specifically requested.
