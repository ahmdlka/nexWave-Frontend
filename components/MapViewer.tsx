'use client';

import React from 'react';
import mapData from '@/data/master_map_data.json';

interface MapViewerProps {
  activeLevel: number; // 1, 2, 3, atau 4
  selectedRackId: string | null;
  pathWaypoints: string[];
}

export default function MapViewer({ activeLevel, selectedRackId, pathWaypoints }: MapViewerProps) {
  const { graph, racks } = mapData;

  // Level 1 & 2 menggunakan Layout_1-2.svg, Level 3 & 4 menggunakan Layout_3-4.svg
  const layoutFileName = activeLevel <= 2 ? 'Layout_1-2.svg' : 'Layout_3-4.svg';

  const activePathSegments = React.useMemo(() => {
    const segments = [];
    for (let i = 0; i < pathWaypoints.length - 1; i++) {
      const fromNode = (graph as Record<string, { x: number; y: number }>)[pathWaypoints[i]];
      const toNode = (graph as Record<string, { x: number; y: number }>)[pathWaypoints[i + 1]];
      if (fromNode && toNode) {
        segments.push({ x1: fromNode.x, y1: fromNode.y, x2: toNode.x, y2: toNode.y });
      }
    }
    return segments;
  }, [pathWaypoints, graph]);

  const selectedRack = selectedRackId
    ? (racks as Record<string, { actual_x: number; actual_y: number }>)[selectedRackId]
    : null;

  return (
    <div className="relative w-full h-[80vh] bg-white border rounded-xl overflow-hidden flex justify-center items-center p-2 shadow-sm">
      <svg
        viewBox="0 0 1142 1329"
        className="w-full h-full object-contain bg-white"
      >
        {/* LAYER 1: Denah Layout (Level 1-2 atau Level 3-4) */}
        <image
          href={`/maps/${layoutFileName}`}
          x="0"
          y="0"
          width="1142"
          height="1329"
        />

        {/* LAYER 2: Gambar SVG Jalur Utama (Selalu Ditampilkan) */}
        <image
          href="/maps/Jalur_map.svg"
          x="0"
          y="0"
          width="1142"
          height="1329"
        />

        {/* LAYER 3: Rute Hasil Algoritma A* (Highlight Warna Hijau) */}
        {activePathSegments.map((seg, idx) => (
          <line
            key={`path-${idx}`}
            x1={seg.x1}
            y1={seg.y1}
            x2={seg.x2}
            y2={seg.y2}
            stroke="#10B981"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* LAYER 4: Marker Pin Rak Tujuan (Jika dicari) */}
        {selectedRack && (
          <g transform={`translate(${selectedRack.actual_x}, ${selectedRack.actual_y})`}>
            <circle cx="0" cy="0" r="8" fill="#EF4444" stroke="#FFFFFF" strokeWidth="2" />
          </g>
        )}
      </svg>
    </div>
  );
}