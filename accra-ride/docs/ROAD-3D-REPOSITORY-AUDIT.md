# 3D Repository Audit — Stage 2

**AccraRush branch:** `fix/road-3d-engineering`  
**Infrastructure foundation:** `feature/lapaz-madina-road-design`  
**Audit date:** 2026-11-25  
**Status:** Source review completed for four GitHub repositories; the GitLab project source was not accessible through the connected GitHub reader. No external package or model asset has been imported.

## Decisions at a glance

| Candidate | Revision inspected | Licence evidence | Relevant capability | AccraRush compatibility | Decision |
|---|---|---|---|---|---|
| [three-map-terrain](https://github.com/whidrubeld/three-map-terrain) | `5a1c57741d9b5148ccaf5f3ebe9157e5bffdbedb` | MIT `LICENSE` and `package.json` inspected | Triangle-aware road draping, elevation tiles, terrain mesh, bridge deck clearance, piers, batched geometry, polygon offset | Useful techniques, but its map/tile architecture is Z-up and tile-streamed; AccraRush is a fixed local OSM graph and Y-up | **ADAPT SELECTIVELY** |
| [osm_3d_model](https://gitlab.com/geophilo1/osm_3d_model) | GitLab source revision not inspected | QGIS Plugin Hub changelog says an MIT `LICENSE` was added in 0.4.0; current repository licence text not verified | QGIS OSM-to-3D city export and embedded Three.js presentation viewer; GLB export | QGIS plugin and presentation viewer, not an embeddable road-engine module; no source module was inspected | **REFERENCE ONLY — LICENCE UNVERIFIED AT REPOSITORY HEAD** |
| [mapforge](https://github.com/mapforge-org/mapforge) | `bbc5c0a032b2a8544bd62b681ac6eb723202fe12` | Repository `LICENSE` explicitly identifies AGPL-3.0; GitHub metadata says NOASSERTION | Collaborative GeoJSON editor using Rails and MapLibre | Not a Three.js renderer or game library; AGPL and architecture provide no integration benefit | **REJECT** |
| [kit-cidade-lowpoly](https://github.com/kayquer/kit-cidade-lowpoly) | `d9de7e25d476d8b8572971840b129c28a68e9cf7` | CC0 1.0 `LICENSE` inspected | 129 low-poly GLB city assets; street furniture and modular props | Y-up assets and low polygon counts are promising, but Brazilian visual language and fixed 2×2 modular road tiles do not match our OSM-aligned Accra corridor. Binary models were not downloaded/inspected | **ADAPT SELECTIVELY — PROPS ONLY IF NEEDED** |
| [codriver-3d-assets](https://github.com/codriver-io/codriver-3d-assets) | `e9619339dd3d74d81cb87302e4692082e0c3dbff` | `LICENSE` (MIT code/docs), `LICENSES.md` and `LICENSE-MODELS.txt` (CC BY 4.0 models) inspected; OSM-derived geometry remains ODbL | Landmark GLBs and authored bridge geometry/profile tools | Bridge examples are tied to named landmark alignments and creator-specific manifests; no Accra roadside asset benefit | **REFERENCE ONLY FOR BRIDGE/DATUM CONCEPTS; REJECT AS ASSET SOURCE FOR THIS CORRIDOR** |

## Source findings and application

### 1. three-map-terrain — selected technique reference

Inspected:
- `LICENSE`
- `package.json`
- `src/layers/drape.ts`
- `src/layers/geometry.ts`
- `src/layers/roads/Roads.class.ts`
- `src/layers/roads/osm.ts`
- `src/terrain/Tile.class.ts`
- `docs/src/content/docs/performance.md`

Relevant findings:
- `Roads.class.ts` cuts road ribbons along the actual terrain triangles, rather than assuming a road is a flat ribbon above the terrain.
- Its road material uses polygon offset factor `-1` and units `-4` to avoid z-fighting with the terrain.
- Its bridge implementation separates deck from terrain, uses a minimum 5 m clearance, ramps the deck at its ends, and places piers every 40 m where the deck is at least 3 m above ground.
- `drape.ts` clips polygons into pieces that each lie within a terrain triangle; `Tile.class.ts` samples and builds elevation grids.
- `geometry.ts` batches indexed surfaces and feature attributes.
- The package is MIT and peers on Three.js >=0.152. It also streams external map/elevation tiles and uses a Z-up tile frame; AccraRush is Y-up and uses an already-selected local road graph.

**Implemented in AccraRush Stage 2 (selective adaptation, not a package import):**
- Default terrain corridor cut reduced from 0.55 m to 0.05 m. The previous value placed the generated terrain roughly 0.585 m below the road surface, creating an obvious unsupported gap.
- Default road and junction asphalt materials now use polygon offset factor `-1`, units `-4`, following the verified Three.js depth-bias technique.
- Added a regression test asserting the road-centre terrain cut remains 5 cm rather than 55 cm.

Files changed:
- `accra-ride/src/map/road-terrain.js`
- `accra-ride/src/map/three-road-renderer.js`
- `accra-ride/tests/road-terrain.test.js`

Not yet implemented:
- Triangle-by-triangle clipping/draping of road polygons onto terrain.
- Bridge deck clearance and pier generation using terrain height beneath the deck.
- A true local DEM raster surface. Current `road-terrain.js` interpolates from DEM-sampled road nodes and road segments; it is not a full-resolution SRTM raster mesh.

No dependency on `three-map-terrain` was added. No external source file was copied verbatim.

### 2. osm_3d_model — reference only

The QGIS Plugin Hub describes a QGIS plugin that downloads OSM layers, opens a Three.js browser viewer and exports GLB. The plugin changelog records that an MIT licence was added in version 0.4.0. However, the GitLab source tree and current licence file were not opened in this audit. The QGIS workflow is not a reusable runtime road renderer for AccraRush. Do not import code or assets from it unless a later audit verifies the repository head, exact licence and relevant source files.

### 3. Mapforge — rejected

Inspected repository `LICENSE`, `README.md` and `package.json`. The actual `LICENSE` text says AGPL version 3. The GitHub repository metadata does not identify an SPDX licence, so the licence file is the evidence of record. Mapforge is a Rails/MapLibre collaborative GeoJSON editor, not a Three.js terrain or road library. No code was copied.

### 4. Kit Cidade Lowpoly — props only if needed

Inspected `LICENSE`, `README.md` and `models/catalogo.json`. The licence is CC0 1.0. The README describes 129 GLB models, at most 1,500 triangles and 150 KB each, Y-up and front-facing -Z, with simple base-colour materials. The catalog lists:
- `ponto_onibus`: 480 triangles, 38.2 KB; green-roof Brazilian bus shelter.
- `semaforo`: 480 triangles, 28.9 KB.
- `poste_luz`: 236 triangles, 15.7 KB.
- `placa_pare`: 136 triangles, 9.8 KB.

The assets may be technically light enough for Android, but their Brazilian style and exact model orientation/attachment points have not been checked in the binary GLBs. PR #53 already has procedural bus stops, signals and roadside infrastructure. Do not import duplicates. Reconsider individual props only if a visual comparison shows a real quality gap and the binary asset is inspected.

### 5. Codriver — bridge/datum reference only

Inspected `LICENSE`, `LICENSES.md`, `LICENSE-MODELS.txt`, `README.md`, `docs/adr/0001-open-landmark-pipeline.md`, `docs/adr/0002-cityscape-and-topography.md`, `docs/adr/0003-contributor-product-license.md`, `src/bridge-preview.js` and `src/peregrine/landmarks/bridge-profile.js`.

- Code and documentation: MIT.
- Original model assets: CC BY 4.0, requiring creator credit, licence link and change indication.
- Geographic alignments/footprints derived from OSM remain ODbL 1.0.
- The bridge profile is built around authored named-landmark centre-lines and local frames, not a drop-in generic road bridge renderer.
- ADR-0002 correctly separates asset geometry from host-owned geographic projection, terrain sampling and vertical placement. It warns against double elevation and draping a bridge deck onto a riverbed.

No Codriver asset or code was integrated. Its coordinate/datum guidance is retained as a design reference only.

## Validation and limitations

- Four GitHub repositories were inspected at the exact revisions listed above.
- The GitLab plugin source and current repository licence were not verified.
- Kit Cidade binary GLBs were not downloaded or visually inspected.
- No external package was added and no external model asset was copied.
- The AccraRush terrain-cut and polygon-offset changes are committed, but their Node tests have **NOT BEEN RUN** in this environment.
- Full Node suite: **NOT RUN**.
- Browser/WebGL visual verification: **NOT TESTED**.
- Samsung Android browser acceptance: **NOT TESTED**.

## Stage 2 decision

Stage 2 is **PARTIAL**, not complete. The compatible polygon-offset technique and a road/terrain separation correction are implemented. The remaining triangle-drape and true DEM-surface work belong in the next geometry stage, after the route-preserving branch is tested. No broad framework or external asset dependency is justified by this audit.
