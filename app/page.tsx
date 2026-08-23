'use client';

import React, { useState, useMemo } from 'react';
import MapViewer from '@/components/MapViewer';
import mapData from '@/data/master_map_data.json';
import dummyWavesData from '@/data/dummy_waves.json';
import { findShortestPath } from '@/lib/astar';

const IO_NODE = 'DEPOT'; 

export default function Home() {
  const [activeLevel, setActiveLevel] = useState<number>(1);
  const [activeWaveId, setActiveWaveId] = useState<string>(dummyWavesData[0].wave_id);
  
  // Pindahkan dummy data ke dalam State agar bisa dimutasi (di-checklist)
  const [waves, setWaves] = useState(dummyWavesData);
  
  // Dapatkan data wave yang sedang aktif
  const currentWave = waves.find(w => w.wave_id === activeWaveId) || waves[0];

  // Kalkulasi rute jalan (path) secara dinamis menggunakan useMemo
  const pathWaypoints = useMemo(() => {
    if (!currentWave || currentWave.route.length === 0) return [];
    
    let fullPath: string[] = [];
    
    // Cari lokasi terakhir yang diselesaikan
    const lastPickedIndex = [...currentWave.route].reverse().findIndex(s => s.status === 'picked');
    const actualLastPickedIndex = lastPickedIndex === -1 ? -1 : currentWave.route.length - 1 - lastPickedIndex;
    
    // Tentukan titik mulai (IO_NODE jika belum ada yang selesai, atau lokasi terakhir selesai)
    let startNode = IO_NODE;
    if (actualLastPickedIndex !== -1) {
      const lastStep = currentWave.route[actualLastPickedIndex];
      const rackInfo = (mapData.racks as Record<string, { access_node: string }>)[lastStep.location_id];
      if (rackInfo) startNode = rackInfo.access_node;
    }

    // Daftar sisa lokasi yang harus dikunjungi (removed from active route if already picked)
    const remainingSteps = currentWave.route.filter(s => s.status !== 'picked');
    
    let currentNode = startNode;

    remainingSteps.forEach((step) => {
      const rackInfo = (mapData.racks as Record<string, { access_node: string }>)[step.location_id];
      if (rackInfo) {
        const pathToDest = findShortestPath(currentNode, rackInfo.access_node);
        // Gabungkan path, hindari duplikasi node di sambungan
        fullPath = [...fullPath, ...pathToDest.slice(fullPath.length > 0 ? 1 : 0)];
        currentNode = rackInfo.access_node;
      }
    });

    // Selalu akhiri kembali ke IO_NODE
    const pathToIO = findShortestPath(currentNode, IO_NODE);
    fullPath = [...fullPath, ...pathToIO.slice(fullPath.length > 0 ? 1 : 0)];

    return fullPath;
  }, [currentWave]); 

  // Fungsi untuk toggle status lokasi (pending <-> picked)
  // Menjamin urutan checklist yang ketat
  const handleToggleLocation = (waveId: string, locationId: string, index: number) => {
    setWaves(prevWaves => prevWaves.map(wave => {
      if (wave.wave_id === waveId) {
        const isCurrentlyPicked = wave.route[index].status === 'picked';
        
        // Aturan: Tidak bisa meloncati urutan
        if (!isCurrentlyPicked) {
          // Jika mau menandai selesai, pastikan semua sebelumnya sudah selesai
          const previousStepsDone = wave.route.slice(0, index).every(step => step.status === 'picked');
          if (!previousStepsDone) {
            alert('Harap selesaikan urutan lokasi sebelumnya terlebih dahulu!');
            return wave;
          }
        } else {
          // Jika mau membatalkan selesai, pastikan semua setelahnya masih pending
          const nextStepsPending = wave.route.slice(index + 1).every(step => step.status === 'pending');
          if (!nextStepsPending) {
            alert('Batalkan urutan lokasi setelahnya terlebih dahulu!');
            return wave;
          }
        }

        const updatedRoute = wave.route.map((step, idx) => {
          if (idx === index) {
            return { ...step, status: step.status === 'pending' ? 'picked' : 'pending' };
          }
          return step;
        });
        
        // Cek apakah semua lokasi di wave ini sudah selesai
        const allPicked = updatedRoute.every(s => s.status === 'picked');
        
        return {
          ...wave,
          route: updatedRoute,
          status: allPicked ? 'done' : 'in_progress'
        };
      }
      return wave;
    }));
  };

  return (
    <main className="p-4 w-full h-screen bg-slate-50 flex flex-col gap-4 overflow-hidden">
      <header className="bg-white p-4 rounded-xl shadow-sm border flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-800">nexWave Logistics</h1>
          <p className="text-sm text-gray-500">Route Optimization & Map Viewer</p>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
          {[1, 2, 3, 4].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setActiveLevel(lvl)}
              className={`px-4 py-2 text-sm font-semibold rounded-md transition ${
                activeLevel === lvl ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Level {lvl}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-4 flex-1 overflow-hidden">
        
        {/* SIDEBAR: Daftar Wave & Checklist */}
        <aside className="w-full lg:w-1/3 max-w-sm bg-white border rounded-xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <div>
              <h2 className="font-bold text-gray-800 text-lg">Daftar Wave</h2>
              <p className="text-xs text-gray-500">Pilih & selesaikan rute (IO: {IO_NODE})</p>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {waves.map((wave) => {
              const isActive = wave.wave_id === activeWaveId;
              const isWaveDone = wave.status === 'done';

              return (
                <div
                  key={wave.wave_id}
                  className={`p-4 rounded-lg border transition-all ${
                    isActive 
                      ? 'bg-blue-50 border-blue-400 shadow-sm ring-1 ring-blue-400' 
                      : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-gray-50 cursor-pointer'
                  }`}
                  onClick={() => !isActive && setActiveWaveId(wave.wave_id)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col">
                      <h3 className={`font-bold ${isActive ? 'text-blue-700' : 'text-gray-700'} ${isWaveDone ? 'line-through opacity-70' : ''}`}>
                        {wave.wave_id}
                      </h3>
                      <p className="text-[10px] text-gray-400 font-mono">
                        {wave.route.length} Locations • {wave.total_items} Items
                      </p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded ${
                      isWaveDone ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {wave.status}
                    </span>
                  </div>
                  
                  {/* CHECKLIST URUTAN KETAT */}
                  {isActive ? (
                    <div className="mt-3 space-y-2 border-t border-blue-200 pt-3">
                      <p className="text-xs font-bold text-blue-800 uppercase mb-2">Sequence Trip ({IO_NODE} → End):</p>
                      {wave.route.map((step, i) => {
                        const isPicked = step.status === 'picked';
                        const isNext = !isPicked && (i === 0 || wave.route[i-1].status === 'picked');
                        
                        return (
                          <label 
                            key={i} 
                            className={`flex items-center gap-3 text-sm cursor-pointer p-2.5 rounded-md border transition shadow-sm ${
                              isPicked ? 'bg-emerald-50 border-emerald-200 opacity-80' : 
                              isNext ? 'bg-white border-blue-300 ring-1 ring-blue-100' : 'bg-gray-50 border-gray-100 grayscale opacity-50 cursor-not-allowed'
                            }`}
                          >
                            <input 
                              type="checkbox" 
                              checked={isPicked}
                              onChange={() => handleToggleLocation(wave.wave_id, step.location_id, i)}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                            />
                            <div className="flex flex-col">
                              <span className={`font-bold ${isPicked ? 'line-through text-emerald-700' : 'text-gray-800'}`}>
                                {i + 1}. Rak {step.location_id}
                              </span>
                              <span className="text-[10px] text-gray-500">{step.product_ref} • {step.qty} Qty</span>
                            </div>
                          </label>
                        );
                      })}
                      {isWaveDone && (
                        <div className="bg-emerald-600 text-white p-2 rounded text-center text-xs font-bold">
                          Trip Selesai! Kembali ke {IO_NODE}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {wave.route.map((step, i) => (
                        <span key={i} className={`text-[10px] px-2 py-0.5 rounded-md ${step.status === 'picked' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                          {step.location_id}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* MAP VIEWER */}
        <section className="flex-1 relative border rounded-xl overflow-hidden shadow-sm bg-white">
          <MapViewer
            activeLevel={activeLevel}
            route={currentWave.route}
            pathWaypoints={pathWaypoints}
          />
        </section>
      </div>
    </main>
  );
}