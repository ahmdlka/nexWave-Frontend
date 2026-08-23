# nexWAVE Operations Control — Design Specification

**Date:** 2026-08-23  
**Status:** Approved design direction; awaiting review of this written specification.

## Objective

Replace the current generic dashboard appearance with the nexWAVE operations-control interface and correct route playback so that it progresses through consecutive legs instead of redrawing every destination from I/O.

## Brand system

- **Canvas and structural background:** Deep Navy `#0A1A4B`.
- **Interactive and navigational color:** Primary Blue `#0056D6`.
- **Active route and operational attention:** Bright Orange `#FF6600`.
- **Supporting colors:** white, dark gray, light gray, and black only where required for readable content.
- **Typography:** Inter loaded with `next/font`. Headings use Inter with a compact, strong hierarchy; subtitles are Inter Medium at 24px in Primary Blue; labels are Inter Medium at 18px; body copy is Inter Regular at 16px with 1.5 line height in dark gray; captions are Inter Light at 14px.
- **Icon language:** 2px minimalist line-art logistics symbols. Icons communicate a physical operations state and are paired with text labels where status needs to be unambiguous.
- **Surfaces:** restrained 8–12px corners, 1px borders, and no decorative gradients or heavy shadows.

## Screen composition

The app is an operations-control workspace rather than a generic admin dashboard.

1. A compact navy header carries the nexWAVE identity, route context, progress summary, and level control.
2. The left manifest panel lists waves and presents the active wave as a sequential pick list. It emphasizes the next required stop and prevents skipping.
3. The map is the dominant working surface. It retains the source warehouse SVG and adds a compact legend, current-leg status, and ordered destination pins.
4. Responsive behavior stacks the manifest above the map below the desktop breakpoint while preserving the order and interaction model.

## Route model

For a selected wave with locations `[A, B, C]`, the route is constructed as separate legs:

`I/O → A`, then `A → B`, then `B → C`.

The return leg `C → I/O` is added only when every location in the wave is picked. The pathfinding algorithm receives the end of one leg as the start of the next leg; it does not reset the starting node to I/O while constructing a route.

The UI exposes both the complete planned path and the currently animated leg. Marking a location as picked advances the active leg. Unchecking only works in reverse sequence and restores the immediately preceding active leg.

## Animation behavior

- Each leg is represented as its own ordered SVG segment sequence.
- Leg N begins only after leg N−1 finishes drawing.
- Segments inside one leg draw in order to preserve the physical travel direction.
- Completed legs remain visible in a subdued blue. The active leg draws in Bright Orange. Future legs remain visible as a quiet planned route or are hidden when visual clarity requires it.
- The active position marker moves with the active leg.
- `prefers-reduced-motion` displays the route immediately with no drawing or movement animation.

## State and edge cases

- An empty route renders no route and a clear empty-state message.
- A missing rack or unavailable graph connection is excluded safely and surfaced in the UI as a contextual route warning rather than causing a crash.
- The selected floor changes only the background layout; route geometry remains calculated from the canonical map data.
- A completed wave shows the return-to-I/O leg and completion status.

## Validation

- Add focused tests for leg construction: first leg begins at I/O, every subsequent leg begins at the prior location, and return-to-I/O is appended only after completion.
- Run the targeted test, lint, TypeScript-aware production build, and inspect the resulting diff before handoff.
