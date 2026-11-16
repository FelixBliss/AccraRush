# Accra Rush

Accra Rush is a mobile-first, competitive 3D driving game set in Accra, built with Three.js and WebGL.

## Project status

The current `master` branch preserves the existing driving prototype as a recoverable reference. Experimental road-network work is not production-approved until it passes Android gameplay tests.

## Development principles

- Android landscape-first; performance-conscious 3D.
- Straight and curved road segments first, with explicit road connectivity.
- One shared road model for rendering, traffic and navigation.
- AI and player vehicles use the same state contracts.
- Competitive passenger pickup-and-delivery races are the core match mode.
- Optional tactical abilities are planned as a separate action ruleset.
- “Not confirmed” is treated as FAIL; code presence or deployment success is not gameplay proof.
- Three.js remains the engine for this development cycle; no paid infrastructure is required.

## Technical plan

Read [the Master Technical Foundation](accra-ride/MASTER-FOUNDATION.md) for the product definition, architecture contracts, development phases, acceptance gates and current risks.

## Current playable reference

- `accra-ride/3d-prototype.html` — current master driving reference.
- `accra-ride/index.html` — existing project entry page.

Road graph and curved-road experiments remain isolated until their Android tests pass.
