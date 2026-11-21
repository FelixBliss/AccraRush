# Corolla taxi model v2 — report (issue #30)

Branch `feature/production-corolla-taxi-model`. Vehicle asset only; no road, OSM, minimap or gameplay files touched.

## What this is

`accrarush_corolla_taxi.glb` was **improved in place**, not replaced. The v1 file that shipped on `master` is kept byte-for-byte as
`source/accrarush_corolla_taxi_v1_original.glb` and is the input to `source/build_corolla_taxi.py`, which loads it, edits it and writes v2.
Rebuild with `python3 accra-ride/assets/vehicles/source/build_corolla_taxi.py` (Python 3 + numpy + Pillow; no Blender, no network).

"Editable source" here means those scripts plus the v1 input. The original generator for v1 was never committed and there is no
`.blend`, so there is no DCC project to hand over.

## Changed files

| File | Change |
|---|---|
| `assets/vehicles/accrarush_corolla_taxi.glb` | v1 → v2 (below) |
| `assets/vehicles/source/accrarush_corolla_taxi_v1_original.glb` | new: untouched copy of v1 (build input, diff baseline) |
| `assets/vehicles/source/build_corolla_taxi.py`, `geom.py`, `glb_io.py` | new: build pipeline |
| `assets/vehicles/preview/*.png` | new: 12 screenshots |
| `prototypes/corolla-taxi-preview.html` | new: standalone preview (own WebGL GLB parser, no CDN) |
| `tests/corolla-taxi-glb.test.js` | new: 10 static GLB checks, runs under `npm test` |
| `assets/vehicles/README.md`, `MODEL_REPORT.md` | updated / new |

## Numbers

| | v1 | v2 |
|---|---|---|
| Triangles | 27,480 | 32,410 (+18%; ~7.1k are the new interior) |
| Mesh objects / nodes | 33 / 44 | 48 / 61 |
| Draw calls (primitives) | 54 | 69 |
| Materials | 22 | 27 |
| Textures | 4 (all ≤ 512×256) | 5 (new 256×128 instrument cluster) |
| File size | 633 KB | 981 KB |
| Overall size (m, X×Y×Z) | 2.076 × 1.467 × 4.576 | identical |

Scale, origin and orientation (+Y up, +Z forward, +X left, left-hand drive) are unchanged from v1.

## Added / fixed

Interior (all visible in the screenshots): dashboard with cowl pad, instrument-cluster texture (speedometer, fuel, temperature, warning lamps),
vents, centre stack, glove-box panel, tunnel/console, steering wheel (rim, 3 spokes, hub) with column cover, two front seats with headrests and bolsters,
rear bench with three headrests, door cards on all four doors (parented to the hinge nodes so they swing), inward-facing cabin tub, headliner, rear-view mirror.

Exterior fixes: roof sign text was mirrored ("IXAT") — fixed; windscreen and rear-window rubber seals; chrome grille surround, bars and centre blank;
inner wheel-arch liners plus underbody pan (you could see through the car under the arches); glass made double-sided (the cabin showed sky from inside).

Paint-picker bug found in v1: the garage colour picker (`applyPaint` in `src/ui/phase-2-navigation.js`) recolours every material whose name doesn't match
`glass|window|wheel|tyre|tire|rubber|chrome|light|lamp|interior`. In v1 that included plates, seats, grille, trim and the roof-sign body. Those
materials were renamed; only `Taxi_Body_Paint` and `Taxi_Wing_Yellow` are tinted now (asserted by a test).

## Animation contract

- Front wheels: `SteerPivot_FL/FR` (rotate Y) → `SpinPivot_FL/FR` (rotate X) → `Wheel_FL/FR`.
- Rear wheels: `SpinPivot_RL/RR` → `Wheel_RL/RR`. Each wheel mesh is centred on its pivot; axle height equals tyre radius (0.318 m).
- Steering wheel: `Interior/SteeringWheel_Tilt` (static placement and column tilt) → `SteeringWheel`. Rotate `SteeringWheel.rotation.z`; the node carries no baked rotation. `extras.steerAxis = [0,0,1]`.
- Doors: `Door_{FL,FR,RL,RR}_Hinge` (unchanged from v1).

## Evidence

`preview/01…09` — the seven required views (front ¾, rear ¾, side, front, driver's eye, cabin → rear seats, interior through the windows; plus rear and cabin → front seats).
`preview/10b–10d` — steering wheel turned, front wheels steered with wheels spun, front-left and rear-right doors opened. These drive the real pivot nodes.

## What was NOT verified — please read

- **Not loaded through the game's real loader.** The garage preview uses `<model-viewer>` from `ajax.googleapis.com`. The sandbox this was built in cannot reach
  that CDN (or jsDelivr, so no three.js `GLTFLoader` either). All screenshots come from `prototypes/corolla-taxi-preview.html`, which parses the GLB with its own code.
  It proves the file is valid glTF 2.0 and renders as shown, **not** that `<model-viewer>` renders it identically. Please open `accra-ride/accrarush.html` → Garage once to confirm.
- **The driving scene does not use this GLB.** In-game the car is built procedurally by `car()` in `accrarush.html`, and its steering wheel is a separate procedural group.
  `assets/vehicles/README.md` previously said to load it with `GLTFLoader`; no such code exists. I did not integrate the GLB into gameplay (out of scope: no camera/controls/HUD changes),
  so wheel/steering pivots are verified against the file, not against in-game animation.
- **No Android measurement.** Budget reasoning only: 32k triangles, 69 draw calls, 27 materials, 5 small textures, ~1 MB. That is modest for a single hero vehicle on mid-range Android,
  but I did not run it on a device. If the GLB later becomes the in-game car, expect ~70 draw calls for one car; merging static trim materials would be the first optimisation.
- Test results: `npm test` → 54/54 pass (includes 10 new GLB checks). These are static file checks, not rendering tests.

## Known weaknesses (honest assessment)

- The bonnet, boot, roofline, doors and bumpers are **v1 geometry, not re-sculpted**. I fixed defects around them but did not remodel the body shell, so
  "Corolla-style proportions" is only as good as v1's. This is the most likely thing for a reviewer to want improved.
- A-pillar edges of the v1 body shell are still jagged (visible in `01`, `09`), and headlamp / tail-lamp edges are ragged where lens meets bodywork.
- The exhaust tip floats slightly behind the rear bumper (v1).
- Interior is deliberately simple and a little pale/flat under the preview's lighting; materials are dark in the file (base colours 0.07–0.13).
