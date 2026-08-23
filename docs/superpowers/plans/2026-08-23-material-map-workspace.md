# Material Map Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make nexWAVE a fixed application shell with a Material UI-powered, independently scrollable and draggable map workspace.

**Architecture:** Material UI provides the application theme and controls while the map component owns its own viewport state: zoom, pan offsets, pointer-drag state, and a scrollable canvas. The page root remains viewport-locked; only the manifest and map viewport can overflow locally.

**Tech Stack:** Next.js 16, React 19, Material UI, Emotion, Plus Jakarta Sans via `next/font`, TypeScript.

## Global Constraints

- Preserve the sequential I/O-to-rack route model and rack-code labels.
- Use Plus Jakarta Sans globally.
- Use Material UI components and theme tokens for operational controls.
- A primary-page scroll must never occur on desktop; map scrolling remains local.
- Map supports click-drag pan, mouse-wheel zoom, and visible horizontal/vertical scrollbars.
- Do not commit unrelated local work.

---

### Task 1: Material theme and font

**Files:**
- Modify: `package.json`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Create: `components/MaterialThemeProvider.tsx`

- [ ] Install `@mui/material`, `@mui/icons-material`, `@emotion/react`, and `@emotion/styled`.
- [ ] Replace Inter with Plus Jakarta Sans using `next/font/google`.
- [ ] Add a Material theme matching nexWAVE colors and rounded component defaults.

### Task 2: Independent map viewport

**Files:**
- Modify: `components/MapViewer.tsx`

- [ ] Make the SVG canvas larger than its viewport and expose local horizontal and vertical scrollbars.
- [ ] Support pointer-down drag with document-level pointer capture and bounded pan offsets.
- [ ] Preserve wheel zoom and reset controls while preventing the page from scrolling.
- [ ] Replace map controls with Material `IconButton`, `Paper`, and tooltips.

### Task 3: Fixed app shell and validation

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

- [ ] Lock the main page to the viewport and assign independent overflow to the manifest and map viewport.
- [ ] Use Material surfaces where operational controls benefit from consistent accessibility behavior.
- [ ] Run lint, TypeScript, route tests, webpack production build, and diff checks.
