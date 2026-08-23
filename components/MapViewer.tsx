'use client';

import React from 'react';
import mapData from '@/data/master_map_data.json';

interface MapViewerProps {
  activeLevel: number;
  route: { location_id: string; status: string; x: number; y: number }[];
  pathWaypoints: string[];
}

export default function MapViewer({ activeLevel, route, pathWaypoints }: MapViewerProps) {
  const { graph, racks } = mapData;

  const layoutFileName = activeLevel <= 2 ? 'Layout_1-2.svg' : 'Layout_3-4.svg';

  // Rekonstruksi segmen garis rute berdasarkan waypoint
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

  return (
    <div className="relative w-full h-[80vh] bg-white border rounded-xl overflow-hidden flex justify-center items-center p-2 shadow-sm">
      <svg viewBox="0 0 1142 1329" className="w-full h-full object-contain bg-white">
        
        {/* LAYER 1: Background Layout */}
        <image href={`/maps/${layoutFileName}`} x="0" y="0" width="1142" height="1329" />

        {/* LAYER 2: Jalur Map Utama */}
        <image href="/maps/Jalur_map.svg" x="0" y="0" width="1142" height="1329" />

        {/* LAYER 3: Rute Animasi Biru */}
        {activePathSegments.map((seg, idx) => (
          <line
            key={`path-${idx}`}
            x1={seg.x1}
            y1={seg.y1}
            x2={seg.x2}
            y2={seg.y2}
            stroke="#3B82F6" // Warna Biru (Tailwind blue-500)
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-pulse" // Animasi sederhana untuk rute
          />
        ))}

        {/* LAYER 4: Icon Location Pin (Hanya untuk destinasi di rute) */}
        {route.map((step, idx) => {
          const rackData = (racks as Record<string, { actual_x: number; actual_y: number }>)[step.location_id];
          if (!rackData) return null;

          // Warna pin: Merah jika belum dikunjungi, Hijau jika sudah
          const pinColor = step.status === 'picked' ? '#10B981' : '#EF4444';

          return (
            <g 
              key={`pin-${step.location_id}-${idx}`} 
              // Translate menyesuaikan ujung bawah pin agar pas menunjuk titik actual koordinat
              transform={`translate(${rackData.actual_x - 12}, ${rackData.actual_y - 24})`}
            >
              {/* SVG Path Icon Pin Map */}
              <path
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"
                fill={pinColor}
                stroke="#FFFFFF"
                strokeWidth="1"
              />
              <text x="12" y="-5" fontSize="12" fill="#1F2937" textAnchor="middle" fontWeight="bold">
                {idx + 1}. {step.location_id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}