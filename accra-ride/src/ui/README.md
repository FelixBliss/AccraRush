# AccraRush UI foundation

Phase 1B reusable visual primitives. Framework-independent CSS; no runtime or build dependency.

## Load order

```html
<link rel="stylesheet" href="./src/ui/tokens.css">
<link rel="stylesheet" href="./src/ui/components.css">
```

## Included primitives

- Design tokens: palette, typography, spacing, radii, shadows, safe-area insets and motion.
- Layout: screen, shell, stack, row, grid and section.
- Surfaces: panel, card and selectable card.
- Actions: primary/secondary/danger/success buttons and icon buttons.
- Status: chips, numeric readouts and meters.
- Selection: area cards, vehicle cards, paint swatches and segmented controls.
- Driving display: HUD frame, speed readout, steering-wheel, pedals and gear styles.

## Rules

- Use the `ar-` prefix to avoid collisions with game-engine and third-party styles.
- Keep presentation separate from simulation/game state.
- Do not put gameplay logic or vehicle physics in these styles.
- Use stable IDs in application data; CSS classes are presentation only.
- Keep player-facing screens concise and landscape-first.
- Do not treat the preview page as production gameplay. The active 3D prototype remains unchanged until a separate approved integration phase.

Open `../../prototypes/ui-foundation-preview.html` to review the primitives in a standalone interactive visual sample.
