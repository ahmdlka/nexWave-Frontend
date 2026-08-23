# Map Zoom and Rack Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the warehouse map directly readable and user-controllable without route-drawing animation.

**Architecture:** Extend each route leg with its source rack code, so presentation components never expose graph waypoint IDs. `MapViewer` owns bounded zoom state and renders static route geometry inside a transformed SVG viewport.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, native SVG.

## Global Constraints

- Keep the sequential I/O-to-rack route model intact.
- Use rack codes in all route labels; graph `WP_*` IDs remain internal only.
- Route strokes render immediately and respect the existing color states.
- Map zoom must support button, wheel, and touch/pinch interaction with reset.
- Preserve Deep Navy, Primary Blue, Bright Orange, and Inter.
- Do not commit unrelated local work.

---

### Task 1: Rack-name route metadata

**Files:**
- Modify: `lib/route-legs.test.ts`
- Modify: `lib/route-legs.ts`

**Interfaces:**
- Produces `RouteLeg.fromLocationId?: string` for pick legs and return legs.

- [ ] Add a failing assertion that the second pick leg starts at `A-01` and the return leg starts at `C-03`.
- [ ] Run the targeted compiled Node test and confirm the missing fields fail.
- [ ] Track the previous valid location ID while building legs and return it as `fromLocationId`.
- [ ] Re-run the targeted test and confirm it passes.

### Task 2: Static, zoomable map and rounded surfaces

**Files:**
- Modify: `components/MapViewer.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes `RouteLeg.fromLocationId` to display rack labels.
- Owns a zoom multiplier constrained between 0.65 and 2.4.

- [ ] Remove dash drawing and moving marker animation; render all route strokes immediately.
- [ ] Add zoom-in, zoom-out, reset, wheel, and pinch controls to `MapViewer`.
- [ ] Replace the active-leg labels with `I/O` or rack codes and show rack code beside each map pin.
- [ ] Apply 12–20px border radius to operational surfaces and controls.

### Task 3: Verification

**Files:**
- Modify only files in Tasks 1–2.

- [ ] Run the route-leg test, `npm run lint`, `tsc --noEmit`, and `npx next build --webpack`.
- [ ] Run `git diff --check` and inspect the intended diff.
