# AccraRush — Master Product and Technical Foundation

**Status:** Revised master plan — Phase 1 visual system  
**Engine:** Three.js / WebGL  
**Target:** Android phones, landscape-first  
**Budget constraint:** Free tools and services; no mandatory paid backend  
**Production protection:** Keep `accra-ride/3d-prototype.html` unchanged until replacement gameplay passes Android acceptance.

## 1. Product vision

AccraRush is a polished, competitive 3D driving game set in a recognisable Accra. It must feel like a finished mobile driving game, not a collection of test screens.

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
- Garage and vehicle selection.
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
- Vehicle tile and specification row.
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
- Garage: large vehicle preview, compact stats, colour/customisation and unlock state.
- Mission/route selection: visual route/map, destination, reward and difficulty.
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
- Stable string IDs identify roads, lanes, vehicles, routes, passengers, matches and items.
- No gameplay system relies on array position or rendered mesh names as identity.

### Road data
- Road graph is authoritative; road meshes, lane paths, traffic, route guidance and pickup/drop-off access derive from the same data.
- Each road edge has stable ID, start/end node IDs, ordered centreline, length, road class, speed limit and allowed directions.
- Support straight and curved centrelines.
- Each lane has stable ID, parent edge, direction, width and lane type.
- Connections explicitly list legal incoming-to-outgoing movements. Visual overlap never implies connectivity.
- A route is a continuous ordered list of directed edges/lane movements. Reject disconnected routes.

### Vehicle and physics state
- Player, AI and networked vehicles share one vehicle-state contract: ID, type, position, heading, speed, acceleration, dimensions, current edge/lane, route cursor, gear, damage and control intent.
- Separate simulation state from the 3D visual model.
- Inputs express steering, throttle, brake and gear; movement owns position and velocity.
- Collision changes state/velocity through defined events. Vehicles must not clip through each other, vanish instantly or teleport during recovery.
- Vehicle model dimensions and collision bounds use the same metre scale.

### Match and passenger state
- A match has stable ID, seed, start time, status, shared traffic state and ordered competitors.
- Every competitor gets an equivalent but individually owned passenger instance.
- Competitors share pickup/destination coordinates and rules, not passenger object identity.
- Match states: waiting, countdown, racing, completed, cancelled.
- Competitor states: toPickup, passengerOnboard, delivered, disqualified.
- Pickup/drop-off require valid proximity, speed/stop rules and one authoritative state transition.
- Winner is the first valid delivery recorded by match authority. Prevent duplicate rewards or multiple winners.
- AI and friend multiplayer use the same match rules and event contracts.

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
| 2 | Main menu/navigation | Landscape menu, mode selection, garage/mission/multiplayer navigation shells | All navigation works; no duplicated controls or text-heavy screens |
| 3 | Gameplay HUD/controls | Reference-led HUD, steering wheel, pedals, gear, speedometer, minimap and status meters | User Android approval of appearance and touch behaviour |
| 4 | Road network | Straight/curved road kit and explicit connections from road graph | Forward/reverse, curve, junction and route tests pass on Android |
| 5 | Player vehicle/handling | Detailed taxi GLB, scale, controls, braking, camera and collision bounds | Driving controls and handling pass Android tests |
| 6 | Traffic | Two-way traffic, lane following, speed variation, safe overtaking and motorbikes | No clipping, bizarre speeds or unverified traffic behaviour |
| 7 | Collision/damage | Collision response, damage progression, repair and recovery | Repeatable collision/recovery tests pass |
| 8 | Accra world/navigation | Major Accra connectors, landmarks, signs, buildings and roadside details | Recognisable world and stable Android performance |
| 9 | Passenger competition | Pickup, destination, deadline, route, fare and first-valid-delivery winner | Full AI-independent match flow passes |
| 10 | AI competitors | Route-aware AI with fair passenger objectives and difficulty | AI completes equivalent objectives under same rules |
| 11 | Friend multiplayer | Rooms, readiness, shared race state, disconnect/reconnect and winner sync | Multiple phones complete a fair race |
| 12 | Tactical abilities | EMP, homing impact, shield, trap, nitro, disruption and repair | Every ability has warning, cooldown and counterplay |
| 13 | Economy/progression | Coins, vehicle unlocks/upgrades, rankings, achievements and stats | Rewards are tied to validated game events |
| 14 | Monetisation | Carefully placed ads and optional rewarded ads | No intrusive active-driving or critical multiplayer ads |
| 15 | Optimisation/release | Android performance, memory, network, regression and store readiness | Release candidate passes full regression |

## 7. Immediate implementation sequence

The next work is deliberately split into reviewable stages:

1. **Phase 1A — Visual specification:** establish and maintain this canonical design standard. Do not modify the live driving page.
2. **Phase 1B — Reusable UI foundation:** implement only shared visual tokens and reusable UI primitives in the existing app structure, after inspecting its actual entry points and styles.
3. **Phase 2 — Main menu/navigation:** apply the system to the main navigation screens.
4. **Phase 3 — Driving HUD/controls:** implement the complete reference-led driving interface and connect controls to existing driving state.

Do not combine these into one oversized change. After each implementation stage, run automated checks, open one PR, and request Android acceptance before proceeding.

## 8. First playable vertical slice

Do not expand the city before this slice is reliable:
1. One detailed yellow Corolla taxi.
2. One straight road and one curved road with a valid connection.
3. Player steering, accelerator, brake, D/R and reset.
4. A few AI vehicles travelling in both directions.
5. Reliable collision and recovery.
6. One AI competitor with its own equivalent passenger.
7. Shared pickup and destination; first valid drop-off wins.
8. One offensive tactical ability and one defensive shield.
9. Approved, minimal, polished landscape HUD and Android performance check.

## 9. Acceptance and reporting rules

- Every test is **PASS** or **FAIL**. “Not confirmed” means **FAIL / not accepted**.
- Never claim a feature works based only on code presence, HTTP 200, successful deployment or a screenshot.
- Run relevant regression checks after each change: startup, orientation, navigation, controls, forward/reverse, steering, braking, camera, traffic, collisions, reset and mobile layout.
- User performs actual Android gameplay testing. Automated checks do not replace this.
- Keep each implementation change small, reversible and scoped to named files.
- Do not merge experimental road/camera/vehicle changes into production until Android acceptance passes.
- Keep one active development branch at a time. Preserve unique commits/assets before deleting obsolete branches.

## 10. Known risks and unresolved verification

- Earlier road/branch prototypes had failed or unconfirmed Android checks, including incorrect forward/reverse direction and unstable AI movement. They remain unaccepted.
- The attempted cockpit camera was reported as a high-angle view, not a true cockpit.
- The master 3D prototype is a recoverable reference, not proof that the competitive passenger-race vision is implemented.
- The Corolla GLB and road experiments require asset-loading and Android verification before acceptance.
- Real Accra road accuracy requires verified centreline data and attribution; hand-authored test curves must not be described as surveyed roads.
- The current master `index.html` is a separate 2D canvas prototype; the master `3d-prototype.html` is the Three.js driving reference. The intended production entry/deployment route must be confirmed before wiring new screens into it.

## 11. Current change boundary

For the current Phase 1 visual-system specification change:
- Update this document only.
- Do not modify `accra-ride/3d-prototype.html`, `accra-ride/index.html`, road geometry, vehicle physics, traffic, networking or gameplay logic.
- No external GLB or paid asset is required for the specification.
- The next implementation PR must be based on a fresh audit of the actual entry point and reusable UI structure.
