'use client';

import React from 'react';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import MapViewer from '@/components/MapViewer';
import mapData from '@/data/master_map_data.json';
import dummyWavesData from '@/data/dummy_waves.json';
import { buildRouteLegs, IO_NODE } from '@/lib/route-legs';

type IconName = 'route' | 'warehouse' | 'package' | 'scan' | 'pin';

function LogisticsIcon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const paths = {
    route: <><path d="M4 18h5V6h7v12h4" /><path d="m5 15-3 3 3 3M19 3l3 3-3 3" /></>,
    warehouse: <><path d="M3 21V8l9-5 9 5v13" /><path d="M7 21v-7h10v7M3 9h18" /></>,
    package: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="M4 7v10l8 4 8-4V7M12 11v10" /></>,
    scan: <><path d="M5 4H3v4M19 4h2v4M5 20H3v-4M19 20h2v-4" /><path d="M8 9v6M11 9v6M14 9v6M17 9v6" /></>,
    pin: <><path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></>,
  };

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{paths[name]}</svg>;
}

export default function Home() {
  const [activeLevel, setActiveLevel] = React.useState(1);
  const [activeWaveId, setActiveWaveId] = React.useState(dummyWavesData[0].wave_id);
  const [waves, setWaves] = React.useState(dummyWavesData);

  const currentWave = waves.find((wave) => wave.wave_id === activeWaveId) ?? waves[0];
  const pickedCount = currentWave.route.filter((step) => step.status === 'picked').length;
  const isWaveComplete = currentWave.route.length > 0 && pickedCount === currentWave.route.length;
  const completion = currentWave.route.length ? Math.round((pickedCount / currentWave.route.length) * 100) : 0;

  const routeLegs = React.useMemo(
    () => buildRouteLegs(currentWave.route, mapData.racks, isWaveComplete),
    [currentWave.route, isWaveComplete],
  );

  const activeLegIndex = React.useMemo(() => {
    const nextStep = currentWave.route.find((step) => step.status !== 'picked');
    if (nextStep) return routeLegs.findIndex((leg) => leg.toLocationId === nextStep.location_id);
    return routeLegs.findIndex((leg) => leg.kind === 'return');
  }, [currentWave.route, routeLegs]);

  const activeLeg = activeLegIndex >= 0 ? routeLegs[activeLegIndex] : undefined;
  const activeRouteEndpoints = activeLeg
    ? {
      from: activeLeg.fromLocationId ?? (activeLeg.fromNode === IO_NODE ? 'I/O' : activeLeg.fromNode),
      to: activeLeg.toLocationId ?? (activeLeg.toNode === IO_NODE ? 'I/O' : activeLeg.toNode),
    }
    : undefined;
  const unmappedLocations = currentWave.route.filter((step) => !(step.location_id in mapData.racks));

  const handleToggleLocation = (waveId: string, index: number) => {
    setWaves((previousWaves) => previousWaves.map((wave) => {
      if (wave.wave_id !== waveId) return wave;

      const isCurrentlyPicked = wave.route[index].status === 'picked';
      if (!isCurrentlyPicked && !wave.route.slice(0, index).every((step) => step.status === 'picked')) {
        window.alert('Selesaikan lokasi sebelumnya terlebih dahulu.');
        return wave;
      }
      if (isCurrentlyPicked && !wave.route.slice(index + 1).every((step) => step.status === 'pending')) {
        window.alert('Batalkan lokasi setelahnya terlebih dahulu.');
        return wave;
      }

      const route = wave.route.map((step, stepIndex) => (
        stepIndex === index ? { ...step, status: step.status === 'pending' ? 'picked' : 'pending' } : step
      ));
      const complete = route.every((step) => step.status === 'picked');
      return { ...wave, route, status: complete ? 'done' : 'in_progress' };
    }));
  };

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#0a1a4b] p-3 text-[#202938] sm:p-5">
      <header className="mx-auto flex w-full max-w-[1600px] shrink-0 flex-col gap-5 rounded-2xl border border-white/15 bg-[#0a1a4b] px-5 py-5 text-white lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-[#ff6600] text-[#ff6600]"><LogisticsIcon name="route" /></div>
          <div>
            <p className="text-lg font-semibold tracking-[-0.03em]">nex<span className="text-[#ff6600]">WAVE</span></p>
            <p className="text-xs font-light tracking-[0.08em] text-[#c5d1ec]">OPERATIONS CONTROL</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <div className="border-l border-white/20 pl-4"><p className="text-xs text-[#c5d1ec]">WAVE AKTIF</p><p className="font-medium">{currentWave.wave_id}</p></div>
          <div className="border-l border-white/20 pl-4"><p className="text-xs text-[#c5d1ec]">PROGRES</p><p className="font-medium">{pickedCount}/{currentWave.route.length} lokasi</p></div>
          <div className="border-l border-white/20 pl-4"><p className="text-xs text-[#c5d1ec]">POSISI</p><p className="font-medium">{activeLeg ? activeLeg.fromLocationId ?? (activeLeg.fromNode === IO_NODE ? 'I/O' : activeLeg.fromNode) : 'I/O'}</p></div>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-white/20 p-1" aria-label="Pilih level gudang">
          {[1, 2, 3, 4].map((level) => (
            <button key={level} onClick={() => setActiveLevel(level)} aria-pressed={activeLevel === level} className={`min-w-10 rounded-lg px-3 py-2 text-xs font-medium transition ${activeLevel === level ? 'bg-[#ff6600] text-white' : 'text-[#dce6fa] hover:bg-white/10'}`}>
              L{level}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 gap-3 pt-3 lg:grid-cols-[370px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#cbd5e1] bg-[#f4f6fa]">
          <div className="shrink-0 border-b border-[#d8dee8] bg-white px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#0056d6]"><LogisticsIcon name="warehouse" className="h-4 w-4" />Manifest pengambilan</p>
                <h1 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#202938]">Urutan kerja wave</h1>
              </div>
              <span className="rounded-lg border border-[#cbd5e1] px-2 py-1 text-[11px] font-medium text-[#526176]">I/O: {IO_NODE}</span>
            </div>
            <div className="mt-5 h-1.5 bg-[#dce3ee]" aria-label={`${completion}% lokasi telah dipilih`}><div className="h-full bg-[#ff6600] transition-all" style={{ width: `${completion}%` }} /></div>
            <p className="mt-2 text-xs text-[#687386]">{completion}% selesai · lokasi harus diproses berurutan</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-2">
              {waves.map((wave) => {
                const selected = wave.wave_id === activeWaveId;
                const complete = wave.status === 'done';
                return (
                  <button key={wave.wave_id} onClick={() => setActiveWaveId(wave.wave_id)} className={`w-full rounded-xl border p-4 text-left transition ${selected ? 'border-[#0056d6] bg-[#eaf2ff]' : 'border-[#d8dee8] bg-white hover:border-[#8fb3ee]'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="font-semibold text-[#202938]">{wave.wave_id}</p><p className="mt-1 text-xs text-[#687386]">{wave.route.length} lokasi · {wave.total_items} item</p></div>
                      <span className={`rounded-lg border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] ${complete ? 'border-[#8ab5f2] bg-[#eaf2ff] text-[#0056d6]' : 'border-[#f5b78d] bg-[#fff1e8] text-[#c64d00]'}`}>{complete ? 'Selesai' : 'Berjalan'}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 border-t border-[#d8dee8] pt-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#0056d6]"><LogisticsIcon name="scan" className="h-4 w-4" />Daftar pick</p>
              <ol className="space-y-2">
                {currentWave.route.map((step, index) => {
                  const isPicked = step.status === 'picked';
                  const isNext = !isPicked && (index === 0 || currentWave.route[index - 1].status === 'picked');
                  return (
                    <li key={`${step.location_id}-${index}`}>
                      <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${isPicked ? 'border-[#b6cced] bg-[#eaf2ff]' : isNext ? 'border-[#ff6600] bg-white' : 'border-[#d8dee8] bg-[#eef1f5] opacity-65'}`}>
                        <input type="checkbox" checked={isPicked} disabled={!isPicked && !isNext} onChange={() => handleToggleLocation(currentWave.wave_id, index)} className="h-4 w-4 accent-[#0056d6]" />
                        <span className="min-w-0 flex-1"><span className={`flex items-center gap-1.5 text-sm font-medium ${isPicked ? 'text-[#0056d6] line-through' : 'text-[#202938]'}`}><LogisticsIcon name="pin" className="h-4 w-4 shrink-0" />{index + 1}. {step.location_id}</span><span className="mt-0.5 block text-xs text-[#687386]">{step.product_ref} · {step.qty} unit · Lantai {step.floor}</span></span>
                      </label>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#cbd5e1] bg-white">
          <div className="shrink-0 flex flex-col gap-4 border-b border-[#d8dee8] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#0056d6]">Navigasi berantai</p><h2 className="mt-1 flex items-center gap-2 text-2xl font-medium tracking-[-0.035em] text-[#0056d6]">{activeRouteEndpoints ? <><span>{activeRouteEndpoints.from}</span><ArrowForwardIcon fontSize="small" /><span>{activeRouteEndpoints.to}</span></> : (isWaveComplete ? 'Kembali ke I/O' : 'Rute belum tersedia')}</h2></div>
            <div className="flex items-center gap-2 text-sm text-[#526176]"><LogisticsIcon name="package" className="text-[#ff6600]" />{activeLeg?.kind === 'return' ? 'Semua lokasi dipilih — kembali ke I/O' : 'Selesaikan lokasi aktif untuk lanjut'}</div>
          </div>
          {unmappedLocations.length > 0 && <p className="shrink-0 border-b border-[#f5b78d] bg-[#fff1e8] px-5 py-3 text-sm text-[#9b3c00]">Lokasi tidak ditemukan di peta: {unmappedLocations.map((step) => step.location_id).join(', ')}.</p>}
          <div className="min-h-0 flex-1"><MapViewer activeLevel={activeLevel} route={currentWave.route} routeLegs={routeLegs} activeLegIndex={activeLegIndex} /></div>
        </section>
      </div>
    </main>
  );
}
