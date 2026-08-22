'use client';

import React, { useState } from 'react';
import MapViewer from '@/components/MapViewer';
import mapData from '@/data/master_map_data.json';
import { findShortestPath } from '@/lib/astar';

export default function Home() {
  const [activeLevel, setActiveLevel] = useState<number>(1);
  const [selectedRack, setSelectedRack] = useState<string>('');
  const [startNode, setStartNode] = useState<string>('WP_1');
  const [pathWaypoints, setPathWaypoints] = useState<string[]>([]);

  const handleSearchRoute = () => {
    if (!selectedRack) return;

    const rack = (mapData.racks as Record<string, { access_node: string }>)[selectedRack];
    if (!rack) {
      alert('Kode rak tidak ditemukan!');
      return;
    }

    const path = findShortestPath(startNode, rack.access_node);
    setPathWaypoints(path);
  };

  return (
    <main className="p-6 max-w-7xl mx-auto space-y-6 bg-slate-50 min-h-screen">
      <header className="flex flex-wrap justify-between items-center bg-white p-4 rounded-xl shadow-sm border gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Nexwave Map & Route Viewer</h1>
          <p className="text-sm text-gray-500">Navigasi Peta Terintegrasi A*</p>
        </div>

        {/* Pemilih Level 1 - 4 */}
        <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
          {[1, 2, 3, 4].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setActiveLevel(lvl)}
              className={`px-4 py-2 text-sm font-semibold rounded-md transition ${
                activeLevel === lvl
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Level {lvl}
            </button>
          ))}
        </div>
      </header>

      {/* Control Panel */}
      <section className="bg-white p-4 rounded-xl shadow-sm border flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Start Node</label>
          <select
            value={startNode}
            onChange={(e) => setStartNode(e.target.value)}
            className="w-full p-2 border rounded-lg text-sm bg-gray-50 text-gray-800"
          >
            {Object.keys(mapData.graph).map((wpId) => (
              <option key={wpId} value={wpId}>
                {wpId}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-gray-500 mb-1">Cari Kode Rak</label>
          <input
            type="text"
            placeholder="Contoh: R-01-01"
            value={selectedRack}
            onChange={(e) => setSelectedRack(e.target.value.toUpperCase())}
            className="w-full p-2 border rounded-lg text-sm uppercase text-gray-800"
          />
        </div>

        <button
          onClick={handleSearchRoute}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition self-end"
        >
          Cari Rute
        </button>
      </section>

      {/* Visualizer Canvas */}
      <MapViewer
        activeLevel={activeLevel}
        selectedRackId={selectedRack}
        pathWaypoints={pathWaypoints}
      />
    </main>
  );
}