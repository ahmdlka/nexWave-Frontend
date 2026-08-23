'use client';

import React from 'react';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RemoveIcon from '@mui/icons-material/Remove';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { Box, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import mapData from '@/data/master_map_data.json';
import { getCursorAnchoredScrollOffset, getMapCanvasSize } from '@/lib/map-viewport';
import { IO_NODE, type RouteLeg } from '@/lib/route-legs';

type RouteStep = { location_id: string; status: string };

interface MapViewerProps {
  activeLevel: number;
  route: RouteStep[];
  routeLegs: RouteLeg[];
  activeLegIndex: number;
}

type Segment = { x1: number; y1: number; x2: number; y2: number };

const MIN_ZOOM = 0.65;
const MAX_ZOOM = 2.4;
const ZOOM_STEP = 0.15;
const VIEWBOX_WIDTH = 1142;
const VIEWBOX_HEIGHT = 1329;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

function legEndpoints(leg: RouteLeg) {
  return {
    from: leg.fromLocationId ?? (leg.fromNode === IO_NODE ? 'I/O' : leg.fromNode),
    to: leg.toLocationId ?? (leg.toNode === IO_NODE ? 'I/O' : leg.toNode),
  };
}

export default function MapViewer({ activeLevel, route, routeLegs, activeLegIndex }: MapViewerProps) {
  const { graph, racks } = mapData;
  const [zoom, setZoom] = React.useState(1);
  const [dragging, setDragging] = React.useState(false);
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);
  const dragStart = React.useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const zoomAnchor = React.useRef<{ scrollLeft: number; scrollTop: number; cursorX: number; cursorY: number; previousZoom: number; nextZoom: number; viewportWidth: number; viewportHeight: number } | null>(null);
  const layoutFileName = activeLevel <= 2 ? 'Layout_1-2.svg' : 'Layout_3-4.svg';
  const activeLeg = activeLegIndex >= 0 ? routeLegs[activeLegIndex] : undefined;
  const canvasSize = getMapCanvasSize(zoom);

  const legSegments = React.useMemo(() => routeLegs.map((leg) => {
    const segments: Segment[] = [];
    for (let index = 0; index < leg.waypoints.length - 1; index += 1) {
      const fromNode = graph[leg.waypoints[index] as keyof typeof graph];
      const toNode = graph[leg.waypoints[index + 1] as keyof typeof graph];
      if (fromNode && toNode) segments.push({ x1: fromNode.x, y1: fromNode.y, x2: toNode.x, y2: toNode.y });
    }
    return segments;
  }), [graph, routeLegs]);

  const setBoundedZoom = (nextZoom: number, cursor?: { x: number; y: number }) => {
    const area = scrollAreaRef.current;
    const boundedZoom = clampZoom(nextZoom);
    if (!area || boundedZoom === zoom) return;
    zoomAnchor.current = {
      scrollLeft: area.scrollLeft,
      scrollTop: area.scrollTop,
      cursorX: cursor?.x ?? area.clientWidth / 2,
      cursorY: cursor?.y ?? area.clientHeight / 2,
      previousZoom: zoom,
      nextZoom: boundedZoom,
      viewportWidth: area.clientWidth,
      viewportHeight: area.clientHeight,
    };
    setZoom(boundedZoom);
  };

  React.useLayoutEffect(() => {
    const area = scrollAreaRef.current;
    const anchor = zoomAnchor.current;
    if (!area || !anchor || anchor.nextZoom !== zoom) return;
    const offset = getCursorAnchoredScrollOffset(anchor);
    area.scrollLeft = offset.left;
    area.scrollTop = offset.top;
    zoomAnchor.current = null;
  }, [zoom]);

  return (
    <Box className="relative h-full min-h-0 w-full overflow-hidden rounded-b-2xl bg-[#eef2f8]">
      <Box
        ref={scrollAreaRef}
        className="map-scroll-area h-full w-full overflow-scroll"
        sx={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onWheel={(event) => {
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          setBoundedZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          });
        }}
        onPointerDown={(event) => {
          const area = scrollAreaRef.current;
          if (!area || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollLeft: area.scrollLeft, scrollTop: area.scrollTop };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const area = scrollAreaRef.current;
          const start = dragStart.current;
          if (!area || !start || start.pointerId !== event.pointerId) return;
          area.scrollLeft = start.scrollLeft - (event.clientX - start.x);
          area.scrollTop = start.scrollTop - (event.clientY - start.y);
        }}
        onPointerUp={(event) => {
          if (dragStart.current?.pointerId === event.pointerId) dragStart.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => { dragStart.current = null; setDragging(false); }}
      >
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          width={canvasSize.width}
          height={canvasSize.height}
          className="block max-w-none select-none"
          role="img"
          aria-label={`Peta gudang level ${activeLevel} dengan rute pengambilan berurutan`}
        >
          <image href={`/maps/${layoutFileName}`} x="0" y="0" width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} />
          <image href="/maps/Jalur_map.svg" x="0" y="0" width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} />

          {legSegments.map((segments, legIndex) => (
            <g key={routeLegs[legIndex].id}>
              {segments.map((segment, segmentIndex) => {
                const routeState = legIndex < activeLegIndex ? 'completed' : legIndex === activeLegIndex ? 'active' : 'future';
                return <line key={`${routeLegs[legIndex].id}-${segmentIndex}`} x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} strokeWidth={routeState === 'active' ? 6 : 4} className={`route-line route-line--${routeState}`} />;
              })}
            </g>
          ))}

          {route.map((step) => {
            const rack = racks[step.location_id as keyof typeof racks];
            if (!rack) return null;
            const pinColor = step.status === 'picked' ? '#0056d6' : '#ff6600';
            return (
              <g key={step.location_id} transform={`translate(${rack.actual_x - 12}, ${rack.actual_y - 24})`}>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Zm0 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" fill={pinColor} stroke="#ffffff" strokeWidth="2" />
                <text x="12" y="-7" fontSize="13" fill="#202938" textAnchor="middle" fontWeight="700" paintOrder="stroke" stroke="#ffffff" strokeWidth="3">{step.location_id}</text>
              </g>
            );
          })}
        </svg>
      </Box>

      <Paper elevation={3} className="pointer-events-none absolute left-4 top-4 z-10 max-w-[282px] rounded-xl px-4 py-3">
        <Typography variant="overline" color="primary" sx={{ fontWeight: 700, letterSpacing: '0.12em' }}>LEG RUTE AKTIF</Typography>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {activeLeg ? <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>{legEndpoints(activeLeg).from}<ArrowForwardIcon fontSize="small" />{legEndpoints(activeLeg).to}</Box> : 'Tidak ada leg yang aktif'}
        </Typography>
        <Typography variant="caption" color="text.secondary">Drag untuk menggeser peta. Scroll untuk zoom.</Typography>
      </Paper>

      <Paper elevation={3} className="absolute right-5 top-4 z-10 flex items-center rounded-xl" aria-label="Kontrol zoom peta">
        <Tooltip title="Perkecil"><span><IconButton color="primary" onClick={() => setBoundedZoom(zoom - ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label="Perkecil peta"><RemoveIcon /></IconButton></span></Tooltip>
        <Tooltip title="Atur ulang zoom"><IconButton color="primary" onClick={() => setBoundedZoom(1)} aria-label="Atur ulang zoom peta"><Typography variant="caption" sx={{ fontWeight: 800 }}>{Math.round(zoom * 100)}%</Typography></IconButton></Tooltip>
        <Tooltip title="Perbesar"><span><IconButton color="primary" onClick={() => setBoundedZoom(zoom + ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label="Perbesar peta"><AddIcon /></IconButton></span></Tooltip>
        <Tooltip title="Kembali ke ukuran awal"><IconButton color="primary" onClick={() => setBoundedZoom(1)} aria-label="Kembali ke ukuran awal"><RestartAltIcon /></IconButton></Tooltip>
      </Paper>
    </Box>
  );
}
