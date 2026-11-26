# Qwen task — Garage and gameplay settings (AccraRush)

**Branch:** `feat/garage-settings-qwen`  
**Base:** current accepted `master` (not another PR branch).  
**Target:** create a separate PR to `master`. Do not merge it.

## Strict file ownership
You own:
- `accra-ride/src/ui/phase-2-navigation.js`
- `accra-ride/src/ui/phase-2-navigation.css`
- new focused tests under `accra-ride/tests/` for garage/settings behaviour
- optional new standalone UI module/CSS files only if needed.

Do **not** edit:
- `accra-ride/accrarush.html`
- `accra-ride/src/ui/standalone-game-hud.js`
- `accra-ride/src/ui/standalone-game-hud.css`
- `accra-ride/src/ui/modern-cockpit.css`
- road graph, renderer, route, traffic, physics or gameplay viewport files.

The parallel cockpit PR owns the gameplay page and HUD files. If you discover a required hook in `accrarush.html`, document the exact hook request instead of editing that file.

## Objective
Audit and complete the existing garage and settings so every visible selection/setting has a real effect in gameplay. Preserve the current master menu, route selection and navigation. Do not restore old menu or prototype code from stale PRs.

## Garage audit — GAR-01 to GAR-08
1. Inventory every currently selectable vehicle and its stable ID/model manifest.
2. Verify Corolla taxi selection and paint selection.
3. Verify SUV selection and paint selection.
4. Verify pickup selection and paint selection.
5. Confirm changing vehicle changes the actual vehicle loaded into gameplay, not only the preview or selected card.
6. Confirm selected vehicle and paint survive garage → setup → gameplay and return navigation (persist only using existing local persistence conventions).
7. Ensure the garage preview always matches the selected vehicle and paint.
8. Show locked/unavailable vehicles accurately; do not imply a vehicle is playable if its model/controller/manifest is missing.

Use existing geometry vehicles where a GLB is not available. Do not invent performance specs. Ensure vehicle dimensions, wheel positions, handling values and collision bounds are coherent with existing simulation contracts. Do not duplicate vehicle simulation logic.

## Settings audit — SET-01 to SET-08
1. Engine sound toggle actually mutes/unmutes engine audio during gameplay.
2. Mission hints toggle actually controls hints/toasts/mission guidance without disabling essential safety feedback.
3. Graphics quality choices affect renderer settings safely and persist.
4. Steering sensitivity setting changes steering response without changing vehicle physics contracts.
5. Master/music/SFX volume controls affect the corresponding audio channels; if only one channel exists, expose only what is supported.
6. Control configuration reflects supported control modes and does not show nonfunctional options. The cockpit PR is adding wheel/tilt steering; coordinate through documented interfaces rather than editing its files.
7. Settings persist across reloads using existing storage/versioning conventions.
8. Reset settings restores documented defaults and updates live gameplay immediately.

## Engineering rules
- First inspect current `master` implementation and tests. Report existing behaviour before changing it.
- Preserve all current navigation IDs, selected area, selected vehicle state, paint choices and route hand-off.
- No new backend, database, login or paid dependencies.
- No changes to road geometry, route baselines, traffic or physics.
- Add focused regression tests for every corrected setting and vehicle hand-off.
- Run the full existing test suite and production web build.
- Review your own diff for file ownership violations and unrelated changes.
- Open a separate PR titled **Garage vehicle selection and gameplay settings integration**.
- In the PR description list each GAR/SET item as PASS, FAIL or NOT IMPLEMENTED with test evidence. Do not claim Android acceptance; the user must test the integrated preview in Android Chrome landscape.

## Completion definition
A setting is not complete merely because a checkbox or slider changes visually. A vehicle is not playable merely because its garage preview appears. Each option must be shown to affect the actual running game, with tests and evidence.
