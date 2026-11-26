# AccraRush — Master Product and Technical Foundation

**Status:** Updated master roadmap — modular Accra areas and player vehicle selection included  
**Engine:** Three.js / WebGL  
**Target:** Android phones, landscape-first  
**Budget constraint:** Free tools and services; no mandatory paid backend  
**Production protection:** Keep `accra-ride/3d-prototype.html` unchanged until replacement gameplay passes Android acceptance.

## 1. Product vision

AccraRush is a polished, competitive 3D driving game set in a recognisable Accra. It must feel like a finished mobile driving game, not a collection of test screens.

Players choose a playable area of Accra, choose a vehicle from a multi-car garage, select its available colour and configure supported vehicle/display options before entering a match. Accra is divided into independently loadable playable areas so one match does not need to render the entire city.

The core competition is a passenger pickup-and-delivery race. Competitors receive equivalent, independently owned passenger instances, share the road and traffic, and race to complete the same valid delivery. The first valid drop-off wins.

Planned competition:
- Solo driving and AI passenger races.
- Friend multiplayer races.
- Optional Action Passenger Rush rules with fictional tactical abilities: EMP pulse, homing impact projectile, shield, road trap/oil slick, nitro, steering disruption and repair. No conventional firearms. Every ability needs warning, limited inventory/cooldown and counterplay.

## 2. Non-negotiable product and UX rules

### Orientation and screen composition
- Gameplay is landscape-only. Portrait gameplay is not an acceptable fallback or prototype layout.
- Design for phone landscape aspect ratios and safe areas, including notches and system gesture insets.
- The 3D world and road visibility occupy the majority of the screen.
- HUD controls stay near screen edges and must not obscure the driving path.
- Layouts must adapt to different landscape screen sizes without collapsing into portrait-style vertical stacks.

### Visual direction
The user-provided taxi-driving screenshot is the primary visual reference for the entire game interface. Use its visual principles, not its branding or exact artwork:
- Premium, realistic driving-game presentation.
- Compact dark translucent panels with clear contrast and restrained highlights.
- Polished icon buttons with consistent shape, depth, border and pressed/active states.
- Realistic touch steering wheel, metallic accelerator/brake pedals and an understandable gear selector.
- Digital speedometer, GPS/minimap, mission progress and compact vehicle-status meters.
- Strong visual hierarchy; use icons, numbers and meters instead of explanatory paragraphs.
- Restrained animation and feedback; avoid clutter and visual noise.

### Text policy
- No developer/debug text in player-facing screens.
- No long instruction paragraphs over gameplay.
- Prefer recognisable icons, short labels and visual feedback.
- Do not show duplicate navigation or action buttons on consecutive screens.
- Toasts and notices must be brief, contextual and must not interrupt active driving.

### Interaction policy
- Controls must be functional, not decorative.
- Steering responds continuously to touch/drag and has predictable centring/return behaviour.
- Accelerator and brake are press-and-hold controls with immediate visual feedback.
- Gear changes update actual transmission/movement state and obey safe switching rules.
- Buttons have distinct idle, pressed, active, disabled and focus states as appropriate.
- Prevent text selection, browser callouts, accidental page scrolling and double activation during play.

### Game-wide consistency
The same visual system applies to:
- Main menu and mode selection.
- Accra area selection and area details.
- Garage, vehicle selection and colour customisation.
- Mission/route selection.
- Gameplay HUD and pause screen.
- Multiplayer lobby, room creation/joining and race status.
- Results, rewards, rankings and settings.

Do not make each screen a separate visual experiment.

## 3. Visual system specification

### Design tokens
Use a restrained AccraRush palette:
- Deep navy/charcoal: primary HUD surfaces and overlays.
- Warm amber/yellow: primary action, taxi identity and key highlights.
- Road/metal neutrals: secondary surfaces, pedal metal and inactive controls.
- Green: positive/ready/accelerator states.
- Red: brake, danger, damage and destructive actions.
- White/cool grey: text and icon contrast.

Use a compact sans-serif type family. Numeric readouts (speed, timer, coins, distance) should use tabular/monospaced numerals where practical. Avoid multiple unrelated type styles.

### Component standards
Define reusable styles/components for:
- Icon button (idle/pressed/active/disabled).
- Compact HUD chip and numeric readout.
- Progress/fuel/damage meter.
- Primary and secondary menu action.
- Modal/overlay and pause panel.
- Mission card/route selector.
- Accra area tile, area map preview and area status.
- Vehicle tile, large vehicle preview and specification row.
- Colour swatch/paint selector and vehicle option control.
- Touch steering wheel, pedals and gear control.
- Minimap frame and player/route markers.

Every component must share radius, border, shadow, spacing and icon-weight rules. Avoid one-off CSS treatments when a reusable component is suitable.

### Gameplay HUD layout
- Top-left: circular minimap/GPS.
- Upper area: compact mission timer and progress.
- Top-right: pause and only essential game actions.
- Left edge: camera and utility icons where needed.
- Bottom-left: detailed circular steering wheel.
- Bottom-centre: digital speedometer and direction/gear feedback.
- Bottom-right: separate metallic brake and accelerator pedals.
- Right edge: compact fuel and vehicle-condition indicators where useful.

Do not force every possible icon onto the screen. Show only controls and indicators relevant to the current mode. Gear selection must be clear and must operate the vehicle; the final visual treatment is guided by the supplied reference and usability, not by copying another game's exact controls.

### Screen standards
- Main menu: strong 3D vehicle/world backdrop, prominent Play action, concise access to modes, garage and settings.
- Mode selection: clear visual choices with short labels; no explanatory walls of text.
- Area selection: grouped Accra areas, visual map/thumbnail, concise area identity and availability; select one playable area before a match.
- Garage: large vehicle preview, selectable model, colour/customisation, compact performance/specification display and unlock state.
- Vehicle setup: confirm selected model, paint and supported performance/display options before driving.
- Mission/route selection: visual route/map contained within the selected area, destination, reward and difficulty.
- Multiplayer: clear create/join separation, room status, player readiness and concise controls.
- Pause/results: focused actions, clear race state, no duplicate gameplay controls.

## 4. Engineering constraints

- Stay on Three.js for this development cycle; do not migrate to Unity.
- Keep the phone-only, zero-monthly-budget workflow viable.
- Do not add a dependency or physics engine until an audit proves a specific need.
- Prefer small, reversible changes and existing repository structure.
- Keep the production driving page recoverable until replacement passes Android acceptance.
- Deployment/build success is not gameplay verification.
- Use one active implementation branch/PR at a time.

## 5. Canonical architecture contracts

### World units and coordinates
- World distances are metres; internal speed is metres/second; HUD converts to km/h.
- Three.js axes: X lateral, Y vertical, Z longitudinal.
- Stable string IDs identify roads, lanes, vehicles, routes, passengers, matches, areas, vehicle models and items.
- No gameplay system relies on array position or rendered mesh names as identity.

### Road data
- Road graph is authoritative; road meshes, lane paths, traffic, route guidance and pickup/drop-off access derive from the same data.
- Each road edge has stable ID, start/end node IDs, ordered centreline, length, road class, speed limit and allowed directions.
- Support straight and curved centrelines.
- Each lane has stable ID, parent edge, direction, width and lane type.
- Connections explicitly list legal incoming-to-outgoing movements. Visual overlap never implies connectivity.
- A route is a continuous ordered list of directed edges/lane movements. Reject disconnected routes.

### Modular Accra area/world data
- Accra is divided into selectable playable areas/regions; do not load or render the whole city for every match.
- Each area is a separately addressable world package with a stable area ID, display name, boundary, map preview, road-graph subset, environment assets, landmarks, traffic configuration, spawn points and eligible mission/pickup/drop-off locations.
- The area selection screen groups areas into recognisable parts of Accra. Initial examples for planning include Accra Central, Osu/Cantonments, Airport/Labone, Kaneshie/Abossey Okai, Achimota/Atomic, and Madina/Legon. These are candidate content groups, not a claim that their road data is already built or verified.
- A match loads the selected area's required road graph and assets, not all Accra assets.
- Keep area packages within a shared coordinate and ID convention so adjacent areas can later connect.
- Load shared systems once; load area-specific road geometry, buildings, roadside details and traffic only when needed.
- Use explicit area boundaries and route validation. Do not offer a cross-area route unless the required adjacent area packages and connecting road edges are available.
- Prefer staged asset loading, level-of-detail, culling and disposal of unused area assets. Avoid retaining every area's meshes and textures in memory.
- The first release can treat each area as a separate selectable gameplay map. Seamless travel between areas is a later extension, not a prerequisite for the first playable area.

### Vehicle catalogue, garage and customisation
- Support multiple independently modelled vehicle types; the Toyota Corolla yellow Ghana taxi is the first target vehicle, not the only vehicle.
- Each vehicle model has a stable vehicle-model ID and a model manifest describing GLB asset, scale, dimensions, wheel positions, collision bounds, mass/handling parameters, performance limits, supported paint/material slots, preview camera and availability/unlock state.
- Vehicle visuals are separate from the shared vehicle simulation/controller. A new compatible model must not require a new driving system.
- Players can preview and select an available vehicle model in the garage.
- Players can select supported body colours using material/paint configuration; do not create a separate GLB for every colour.
- Vehicle selection and colour selection are saved as versioned player configuration when persistence is introduced.
- Display comparable vehicle specifications such as acceleration, handling, braking, durability and top speed. Do not invent or display unsupported performance claims.
- If vehicle upgrades or performance tuning are enabled, define caps and balancing rules. Competitive modes must prevent a paid/unlocked/high-speed setup from creating an unfair race; use mode-specific caps or equivalent balancing where needed.
- Dashboard/display preferences are distinct from the 3D vehicle model. Provide a clear speed readout in km/h by default and allow supported display preferences without changing authoritative physics.
- AI and networked vehicles use the same catalogue/manifest and vehicle-state contract.

### Vehicle and physics state
- Player, AI and networked vehicles share one vehicle-state contract: ID, model ID, type, position, heading, speed, acceleration, dimensions, current edge/lane, route cursor, gear, damage and control intent.
- Separate simulation state from the 3D visual model.
- Inputs express steering, throttle, brake and gear; movement owns position and velocity.
- Collision changes state/velocity through defined events. Vehicles must not clip through each other, vanish instantly or teleport during recovery.
- Vehicle model dimensions and collision bounds use the same metre scale.

### Match and passenger state
- A match has stable ID, seed, start time, status, selected area ID, shared traffic state and ordered competitors.
- Every competitor gets an equivalent but individually owned passenger instance.
- Competitors share pickup/destination coordinates and rules, not passenger object identity.
- Match states: waiting, countdown, racing, completed, cancelled.
- Competitor states: toPickup, passengerOnboard, delivered, disqualified.
- Pickup/drop-off require valid proximity, speed/stop rules and one authoritative state transition.
- Winner is the first valid delivery recorded by match authority. Prevent duplicate rewards or multiple winners.
- AI and friend multiplayer use the same match rules and event contracts.
- Match setup records the selected area, vehicle model, paint configuration and permitted vehicle options so all clients load a consistent race configuration.

### Tactical abilities
- Multiplayer abilities require host/server-authoritative validation.
- Define inventory, cooldown, range, targeting, hit validation, duration, damage, counterplay and recovery before visuals.
- Damage progression is readable and recoverable: performance impairment, steering impairment, severe slowdown/immobilisation, then respawn with a defined penalty.
- One attack must not permanently destroy passenger progress.
- Effects represent authoritative gameplay events.

### Persistence and online readiness
- Save versioned plain data; never serialize Three.js objects.
- Keep local/offline AI matches playable without a backend.
- Design match IDs, competitor IDs, event payloads and deterministic rules so friend multiplayer can be added without rewriting local gameplay.
- Do not introduce login, database or paid backend before online play is ready.

## 6. Revised development roadmap and acceptance gates

| Order | Phase | Deliverable | Gate |
|---|---|---|---|
| 0 | Foundation | Preserve master baseline, contracts, build/test process and one active branch | Repository/build checks pass; baseline remains recoverable |
| 1 | Visual system | This specification, reusable design tokens and UI component standards | Design system reviewed; no gameplay logic changed |
| 2 | Main menu/navigation | Landscape menu, mode selection, Accra area selection, garage/vehicle/colour setup, mission and multiplayer navigation | All navigation works; selected area and vehicle configuration carry correctly into setup; no duplicated controls or text-heavy screens |
| 3 | Gameplay HUD/controls | Reference-led HUD, steering wheel, pedals, gear, speedometer, minimap and status meters | User Android approval of appearance and touch behaviour |
| 4 | Road network | Straight/curved road kit, explicit connections and area-compatible road graph/streaming contracts | Forward/reverse, curve, junction and route tests pass on Android; selected area loads without unrelated city assets |
| 5 | Player vehicle/handling | Multi-model vehicle catalogue foundation, detailed Corolla GLB, model manifests, garage preview, colour configuration, scale, controls, braking, camera and collision bounds | At least the first vehicle drives correctly; model/paint selection persists through setup; controls and handling pass Android tests |
| 6 | Traffic | Two-way traffic, lane following, speed variation, safe overtaking and motorbikes | No clipping, bizarre speeds or unverified traffic behaviour |
| 7 | Collision/damage | Collision response, damage progression, repair and recovery | Repeatable collision/recovery tests pass |
| 8 | Accra world/navigation | Independently loadable Accra areas, major connectors within each area, landmarks, signs, buildings, roadside details and area map/route navigation | Player can select and load a named area; its roads and landmarks are recognisable; only required area assets load; stable Android performance |
| 9 | Passenger competition | Pickup, destination, deadline, route, fare and first-valid-delivery winner, scoped to selected area | Full AI-independent match flow passes within a valid area route |
| 10 | AI competitors | Route-aware AI with fair passenger objectives and difficulty | AI completes equivalent objectives under same rules and selected area graph |
| 11 | Friend multiplayer | Rooms, readiness, shared race state, selected-area/vehicle configuration sync, disconnect/reconnect and winner sync | Multiple phones complete a fair race with matching area and valid vehicle configurations |
| 12 | Tactical abilities | EMP, homing impact, shield, trap, nitro, disruption and repair | Every ability has warning, cooldown and counterplay |
| 13 | Economy/progression | Coins, vehicle unlocks/upgrades, rankings, achievements and stats | Rewards are tied to valid gameplay and cannot be easily exploited |
| 14 | Monetisation | Ads integrated into appropriate breaks; rewarded ads where useful; sensible ad frequency | Ads do not undermine the gameplay experience; no intrusive ads during active driving or critical multiplayer gameplay |
| 15 | Optimisation/release | Android performance, loading and asset optimisation, memory management, network reliability, landscape and screen-size checks, crash/regression testing and final release preparation | Stable, polished Android release |

## 7. Immediate implementation sequence

The next work is deliberately split into reviewable stages:

1. **Phase 1A — Visual specification:** establish and maintain this canonical design standard. Do not modify the live driving page.
2. **Phase 1B — Reusable UI foundation:** implement only shared visual tokens and reusable UI primitives in the existing app structure, after inspecting its actual entry points and styles.
3. **Phase 2 — Main menu/navigation:** apply the system to the main navigation screens, including area selection and the garage/vehicle setup flow.
4. **Phase 3 — Driving HUD/controls:** implement the complete reference-led driving interface and connect controls to existing driving state.

Do not combine these into one oversized change. After each implementation stage, run automated checks, open one PR, and request Android acceptance before proceeding.

## 8. First playable vertical slice

Do not expand the city before this slice is reliable:
1. One detailed yellow Corolla taxi, with the vehicle system structured to accept more models.
2. One selectable, self-contained Accra area with its own valid road graph and environment assets.
3. One straight road and one curved road with a valid connection.
4. Player steering, accelerator, brake, D/R and reset.
5. A few AI vehicles travelling in both directions.
6. Reliable collision and recovery.
7. One AI competitor with its own equivalent passenger.
8. Shared pickup and destination; first valid drop-off wins.
9. One offensive tactical ability and one defensive shield.
10. Approved, minimal, polished landscape HUD and Android performance check.

## 9. Acceptance and reporting rules

- Every test is **PASS** or **FAIL**. “Not confirmed” means **FAIL / not accepted**.
- Never claim a feature works based only on code presence, HTTP 200, successful deployment or a screenshot.
- Run relevant regression checks after each change: startup, orientation, navigation, area selection/loading, vehicle selection/paint, controls, forward/reverse, steering, braking, camera, traffic, collisions, reset and mobile layout.
- For the current web-first build, the user performs actual browser gameplay testing in Chrome on an Android phone. This is browser validation, not native Android validation; APK/native acceptance applies only when explicitly in scope. Automated checks do not replace this.
- Keep each implementation change small, reversible and scoped to named files.
- Do not merge experimental road/camera/vehicle changes into production until Android acceptance passes.
- Keep one active development branch at a time. Preserve unique commits/assets before deleting obsolete branches.
- Update the roadmap status tracker whenever a phase starts, passes testing, fails testing or is accepted. A phase is not complete until its exit condition has evidence.

## 10. Known risks and unresolved verification

- Earlier road/branch prototypes had failed or unconfirmed Android checks, including incorrect forward/reverse direction and unstable AI movement. They remain unaccepted.
- The attempted cockpit camera was reported as a high-angle view, not a true cockpit.
- The master 3D prototype is a recoverable reference, not proof that the competitive passenger-race vision is implemented.
- The Corolla GLB and road experiments require asset-loading and Android verification before acceptance.
- Real Accra road accuracy requires verified centreline data and attribution; hand-authored test curves must not be described as surveyed roads.
- The current master `index.html` is a separate 2D canvas prototype; the master `3d-prototype.html` is the Three.js driving reference. The intended production entry/deployment route must be confirmed before wiring new screens into it.
- The city must not be implemented as one oversized scene. Area package boundaries, asset budgets and loading/disposal behaviour must be tested on target Android devices.
- Vehicle model variety must not duplicate physics/controller code or create inconsistent collision dimensions.
- Performance upgrades and vehicle classes must be balanced for fair AI and friend multiplayer races.

## 11. Current change boundary

For roadmap/specification updates:
- Update this document and its status tracker only.
- Do not modify `accra-ride/3d-prototype.html`, `accra-ride/index.html`, road geometry, vehicle physics, traffic, networking or gameplay logic.
- No external GLB or paid asset is required for the specification.
- The Phase 1C integration is implemented on a separate game entry; keep the original `3d-prototype.html` as the untouched fallback until Android acceptance.

## 12. Roadmap status tracker

This tracker is the project reference for current progress. Update it with dated evidence; do not infer completion from plans, commits or successful deployment alone.

| Phase | Current status | Evidence / next acceptance action |
|---|---|---|
| 0 — Foundation | In progress — web-first acceptance revalidation | PR #62 adds static web-entry build validation; Chromium landscape gameplay smoke passes; regression checks are being reconciled; user Chrome-on-Android acceptance pending |
| 1 — Visual system | Phase 1A specification and Phase 1B shared primitives completed; Phase 1C game entry/HUD integration implemented in PR #14; Android acceptance pending | Pass UI integration tests; review actual game entry on Android landscape; confirm all controls and gameplay remain unchanged |
| 2 — Main menu/navigation | Implemented in PR under review; automated/device acceptance pending | Verify menu navigation, Accra Central selection, Corolla taxi garage, paint application/persistence and Android landscape layout. Area selection is configuration only; actual area-world loading remains Phase 8 |
| 3 — Gameplay HUD/controls | Planned / not accepted | Implement and Android-test all functional landscape controls and HUD |
| 4 — Road network | Experimental work not accepted | Pass forward/reverse, curves, connected junctions and selected-area loading tests |
| 5 — Player vehicle/handling | Placeholder vehicle remains; final vehicle acceptance pending | Complete Corolla GLB and test scale, wheel alignment, handling, collision and colour selection |
| 6 — Traffic | Not accepted until current Android tests pass | Verify both directions, lanes, speed, overtaking and collision avoidance |
| 7 — Collision/damage | Not accepted until repeatable tests pass | Verify impact response, damage, repair and recovery |
| 8 — Accra world/navigation | Planned / not accepted | Build and verify the first selectable area package before adding more areas |
| 9 — Passenger competition | Planned / not accepted | Verify pickup, delivery and first-valid-winner rules |
| 10 — AI competitors | Planned / not accepted | Verify fair route-aware AI in the selected area |
| 11 — Friend multiplayer | Planned / not accepted | Verify room lifecycle, synchronisation and race completion across phones |
| 12 — Tactical abilities | Planned / not accepted | Verify authority, warning, cooldown, counterplay and recovery |
| 13 — Economy/progression | Planned / not accepted | Verify rewards only follow valid gameplay and resist exploitation |
| 14 — Monetisation | Planned / not accepted | Verify placement, frequency and rewarded-ad rules |
| 15 — Optimisation/release | Planned / not accepted | Complete Android performance, memory, network, screen-size and regression acceptance |



### 12.1 Latest verified development activity — 2026-11-16

- Merged PR #12: `accra-ride/index.html` is now the AccraRush landing/entry page and links to `3d-prototype.html`. The 3D driving prototype was not modified by that merge. Android/deployment behaviour still requires a real device check.
- Phase 1B implementation is isolated in PR #13: shared design tokens, reusable CSS primitives, an interactive area/garage/paint/HUD preview and Node contract tests. This is a UI foundation sample, not yet integrated into production screens.
- Current PR acceptance still requires CI success and user visual review, including a landscape Android viewport.
- Phase 0 is not marked fully accepted: repository structure and protected 3D reference were inspected, but a fresh full gameplay regression run on Android has not been supplied.

### Progress update format

For every roadmap update, record:
- Date and phase.
- Files/commit/PR involved.
- What changed.
- Tests performed and device/browser used.
- PASS/FAIL for each acceptance item.
- Outstanding failures and the next bounded task.
- Whether the user has accepted the Android gameplay result.

The roadmap is the source of truth for scope and sequence; the status tracker is the source of truth for verified progress.


### 12.2 Phase 1C implementation — 2026-11-16

- Added `accra-ride/accrarush.html` as the integrated game entry, copied from the protected 3D reference.
- Loaded the shared design tokens/components and added `src/ui/game-integration.css` for the actual entry overlay, HUD chips, utility buttons, pedals and gear selector.
- Changed the landing page Play action to open `accrarush.html`.
- Kept `3d-prototype.html` unchanged. The inline Three.js gameplay script in the new entry is byte-for-byte identical to the protected reference; an automated regression test enforces this.
- No area selection, garage, vehicle model or road-system functionality is claimed by this UI integration. Those remain later implementation/acceptance work.
- Automated tests and Android landscape gameplay review are required before this phase is accepted. The original prototype remains the fallback.
