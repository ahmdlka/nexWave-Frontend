# Cursor-Anchored Map Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make map zoom retain the point below the cursor and replace route arrows with Material UI icons.

**Architecture:** A pure viewport helper maps scroll offsets, viewport coordinates, and zoom ratios to corrected scroll offsets. `MapViewer` captures the wheel cursor position, applies the new canvas size, then restores the cursor-anchored map coordinate in a layout effect.

**Tech Stack:** React 19, TypeScript, Material UI.

### Task 1: Cursor-preserving viewport calculation

**Files:**
- Modify: `lib/map-viewport.test.ts`
- Modify: `lib/map-viewport.ts`

- [ ] Add a failing test for the corrected scroll offset after zooming at an off-center cursor position.
- [ ] Implement and test `getCursorAnchoredScrollOffset`.

### Task 2: Map and route arrow UI

**Files:**
- Modify: `components/MapViewer.tsx`
- Modify: `app/page.tsx`

- [ ] Apply cursor-anchored scroll restoration for wheel zoom and centered restoration for button zoom.
- [ ] Render `ArrowForward` icons in the route information views.

### Task 3: Verification

- [ ] Run viewport and route tests, lint, TypeScript, webpack build, and diff check.
