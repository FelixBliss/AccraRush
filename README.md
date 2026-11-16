# Accra Rush

AccraRush is a polished, landscape-first competitive 3D driving game set in a recognisable Accra, built with Three.js and WebGL.

## Project status

The current `master` branch preserves the existing driving prototype as a recoverable reference. Experimental road-network work is not production-approved until it passes Android gameplay tests.

The game is planned around selectable, independently loadable Accra areas and a multi-vehicle garage. Players will choose a playable area, vehicle model and supported colour/options before a match. The first target vehicle is a detailed Toyota Corolla yellow Ghana taxi; it is not the only planned vehicle.

## Development principles

- Android landscape-first; performance-conscious 3D.
- Accra is divided into selectable area packages; do not render the entire city for every match.
- Straight and curved road segments use explicit road connectivity.
- One shared road model for rendering, traffic and navigation.
- Multiple vehicle models share reusable vehicle physics/controller contracts.
- AI and player vehicles use the same state contracts.
- Competitive passenger pickup-and-delivery races are the core match mode.
- Optional tactical abilities are planned as a separate action ruleset.
- “Not confirmed” is treated as FAIL; code presence or deployment success is not gameplay proof.
- Three.js remains the engine for this development cycle; no paid infrastructure is required.

## Canonical roadmap and progress tracking

Read [the Master Product and Technical Foundation](accra-ride/MASTER-FOUNDATION.md) for the product definition, visual standards, architecture contracts, full Phase 0–15 roadmap, selectable Accra-area strategy, vehicle garage requirements, acceptance gates and live phase-status tracker.

Update the status tracker in that document whenever a phase starts, passes testing, fails testing or is accepted. Only verified Android gameplay evidence can mark gameplay acceptance.

## Current playable reference

- `accra-ride/3d-prototype.html` — current master 3D driving reference.
- `accra-ride/index.html` — current master project entry page.

Road graph and curved-road experiments remain isolated until their Android tests pass.
