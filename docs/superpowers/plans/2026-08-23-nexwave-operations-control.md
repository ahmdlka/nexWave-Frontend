# nexWAVE Operations Control Implementation Plan

> **For agentic workers:** Execute this plan task-by-task in the current local workspace. Do not commit; the user explicitly requested local-only changes.

**Goal:** Redesign the nexWAVE warehouse route workspace and render its route as sequential I/O-to-stop legs.

**Architecture:** Extract route construction into a pure route-leg module, so UI state only chooses the active leg. `MapViewer` receives ordered legs and renders each leg as a separate SVG group with a controlled draw delay. The page owns wave/checklist state and presents the new operations-control layout.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, native SVG/CSS animation, `next/font`.

## Global Constraints

- Use Inter with `next/font`; do not add a remote font link.
- Use Deep Navy `#0A1A4B`, Primary Blue `#0056D6`, and Bright Orange `#FF6600` consistently.
- Keep all work local and do not commit.
- Retain sequential checklist restrictions.
- Respect `prefers-reduced-motion`.

---

### Task 1: Route-leg domain model

**Files:**
- Create: `lib/route-legs.ts`
- Create: `lib/route-legs.test.ts`

**Interfaces:**
- Produces `buildRouteLegs(route, racks, isComplete): RouteLeg[]`.
- `RouteLeg` contains `id`, `fromNode`, `toNode`, and `waypoints`.

- [ ] Write failing tests asserting a three-stop route returns `DEPOT→A`, `A→B`, and `B→C`, and returns `C→DEPOT` only when complete.
- [ ] Run the targeted test and confirm it fails because the module does not exist.
- [ ] Implement the minimal pure builder using `findShortestPath` for each consecutive pair and safe handling for missing racks/unreachable legs.
- [ ] Rerun the targeted test and confirm it passes.

### Task 2: Theme and application metadata

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] Replace Geist configuration with Inter loaded through `next/font/google`; update language and meaningful nexWAVE metadata.
- [ ] Define the brand CSS custom properties, type scale, background treatment, focus states, and reduced-motion fallback.
- [ ] Run lint to validate layout and stylesheet imports.

### Task 3: Sequential route playback map

**Files:**
- Modify: `components/MapViewer.tsx`

**Interfaces:**
- Consumes `RouteLeg[]`, active leg index, selected level, and route item state.
- Renders completed, active, and future legs separately.

- [ ] Replace the flat `pathWaypoints` prop with `routeLegs` and `activeLegIndex`.
- [ ] Generate SVG segments per leg and apply ordered CSS draw delays, where each leg delay follows all prior segment durations.
- [ ] Render blue completed paths, orange active-path animation, quiet future path, minimal 2px logistics-style markers, legend, and accessible state text.
- [ ] Confirm reduced-motion exposes the full path without animation.

### Task 4: Operations-control page and checklist integration

**Files:**
- Modify: `app/page.tsx`

- [ ] Derive `routeLegs` from the current wave and choose the active leg from the number of completed stops.
- [ ] Preserve the strict sequential toggle guard, including reverse-order undo.
- [ ] Replace generic cards with the navy-header, manifest, dominant map, concise progress status, and responsive operational layout.
- [ ] Use text labels with color states for clarity and keep level controls keyboard-accessible.

### Task 5: Full validation

**Files:**
- Modify only files required by preceding tasks.

- [ ] Run the targeted route-leg tests.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Inspect `git diff --check` and `git diff` for only intended local changes.
