import assert from 'node:assert/strict';
import test from 'node:test';

import { getCursorAnchoredScrollOffset, getMapCanvasSize } from './map-viewport';

test('scales the scrollable map canvas from the selected zoom level', () => {
  assert.deepEqual(getMapCanvasSize(1.5), { width: 1713, height: 1994 });
});

test('prevents a map canvas from shrinking below the visible viewport', () => {
  assert.deepEqual(
    getMapCanvasSize(0.65, { width: 900, height: 1000 }),
    { width: 900, height: 1000 },
  );
});

test('keeps the map coordinate beneath the cursor when zoom changes', () => {
  assert.deepEqual(
    getCursorAnchoredScrollOffset({
      scrollLeft: 120,
      scrollTop: 50,
      cursorX: 300,
      cursorY: 100,
      previousZoom: 1,
      nextZoom: 1.5,
      viewportWidth: 700,
      viewportHeight: 800,
    }),
    { left: 330, top: 125 },
  );
});
