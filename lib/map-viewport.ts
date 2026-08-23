export type MapCanvasSize = {
  width: number;
  height: number;
};

export type CursorAnchoredScrollInput = {
  scrollLeft: number;
  scrollTop: number;
  cursorX: number;
  cursorY: number;
  previousZoom: number;
  nextZoom: number;
  viewportWidth: number;
  viewportHeight: number;
};

const MAP_WIDTH = 1142;
const MAP_HEIGHT = 1329;

export function getMapCanvasSize(
  zoom: number,
  minimumSize: Partial<MapCanvasSize> = {},
): MapCanvasSize {
  return {
    width: Math.max(Math.round(MAP_WIDTH * zoom), minimumSize.width ?? 0),
    height: Math.max(Math.round(MAP_HEIGHT * zoom), minimumSize.height ?? 0),
  };
}

export function getCursorAnchoredScrollOffset({
  scrollLeft,
  scrollTop,
  cursorX,
  cursorY,
  previousZoom,
  nextZoom,
  viewportWidth,
  viewportHeight,
}: CursorAnchoredScrollInput) {
  const scale = nextZoom / previousZoom;
  const canvas = getMapCanvasSize(nextZoom);
  const maxLeft = Math.max(0, canvas.width - viewportWidth);
  const maxTop = Math.max(0, canvas.height - viewportHeight);

  return {
    left: Math.min(maxLeft, Math.max(0, Math.round((scrollLeft + cursorX) * scale - cursorX))),
    top: Math.min(maxTop, Math.max(0, Math.round((scrollTop + cursorY) * scale - cursorY))),
  };
}
