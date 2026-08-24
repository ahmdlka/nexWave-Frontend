'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Image from 'next/image';
import MapViewer from '@/components/MapViewer';
import mapData from '@/data/master_map_data.json';
import { buildRouteLegs, IO_NODE } from '@/lib/route-legs';
import { supabase } from '@/lib/supabase';
import { Box, CircularProgress, Typography, Button } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import type { Session } from '@supabase/supabase-js';

type IconName = 'route' | 'warehouse' | 'package' | 'scan' | 'pin';

interface RouteStep {
  location_id: string;
  product_ref: string;
  qty: number;
  status: 'picked' | 'pending';
  floor: number;
}

interface Wave {
  wave_id: string;
  status: string;
  picker_id: number;
  picker_name: string;
  total_items: number;
  total_distance: number;
  route: RouteStep[];
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

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
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [activeLevel, setActiveLevel] = React.useState(1);
  const [activeWaveId, setActiveWaveId] = React.useState('');
  const [waves, setWaves] = React.useState<Wave[]>([]);

  const fetchData = useCallback(async (token: string) => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetch(`${API_BASE_URL}/api/wave/active`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const transformedWaves = data.map((wave: any): Wave => ({
          wave_id: wave.wave_id,
          status: wave.status,
          picker_id: wave.picker_id,
          picker_name: wave.picker_name,
          total_items: wave.total_items,
          total_distance: wave.total_distance,
          route: wave.locations.map((loc: any): RouteStep => ({
            location_id: loc.location_id,
            product_ref: loc.product_ref,
            qty: loc.qty,
            status: loc.status === 'picked' ? 'picked' : 'pending',
            floor: loc.z,
          }))
        }));

        setWaves(transformedWaves);
        if (transformedWaves.length > 0 && !activeWaveId) {
          setActiveWaveId(transformedWaves[0].wave_id);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error(`Error ${response.status}:`, errorData);

        if (response.status === 403) {
          setErrorMessage('Akses Ditolak (403): Endpoint ini khusus role Manager. Gunakan akun Manager untuk melihat seluruh wave.');
        } else if (response.status === 401) {
          setErrorMessage('Sesi telah berakhir (401). Silakan login kembali.');
        } else {
          setErrorMessage(`Gagal mengambil data wave (${response.status}: ${errorData.detail || 'Server error'}).`);
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setErrorMessage('Tidak dapat terhubung ke server backend. Periksa koneksi atau CORS.');
    } finally {
      setLoading(false);
    }
  }, [activeWaveId]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        router.push('/login');
      } else {
        setSession(currentSession);
        fetchData(currentSession.access_token);
      }
    };

    checkAuth();
  }, [router, fetchData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const currentWave = React.useMemo(
    () => waves.find((wave) => wave.wave_id === activeWaveId) || waves[0] || { route: [] as RouteStep[] },
    [waves, activeWaveId]
  ) as Wave | { route: RouteStep[], wave_id?: string, status?: string, total_items?: number };

  const pickedCount = React.useMemo(
    () => ('route' in currentWave ? currentWave.route.filter((step) => step.status === 'picked').length : 0),
    [currentWave]
  );

  const pickedItemsCount = React.useMemo(
    () => ('route' in currentWave ? currentWave.route.filter((step) => step.status === 'picked').reduce((sum, step) => sum + (step.qty || 0), 0) : 0),
    [currentWave]
  );

  const isWaveComplete = 'route' in currentWave && currentWave.route.length > 0 && pickedCount === currentWave.route.length;
  const completion = 'route' in currentWave && currentWave.route.length ? Math.round((pickedCount / currentWave.route.length) * 100) : 0;

  const routeLegs = React.useMemo(
    () => ('route' in currentWave ? buildRouteLegs(currentWave.route, mapData.racks, isWaveComplete) : []),
    [currentWave, isWaveComplete],
  );

  const activeStep = React.useMemo(
    () => ('route' in currentWave ? currentWave.route.find((step) => step.status !== 'picked') : undefined),
    [currentWave]
  );

  const activeLegIndex = React.useMemo(() => {
    if (activeStep) return routeLegs.findIndex((leg) => leg.toLocationId === activeStep.location_id);
    return routeLegs.findIndex((leg) => leg.kind === 'return');
  }, [activeStep, routeLegs]);

  const activeLeg = activeLegIndex >= 0 ? routeLegs[activeLegIndex] : undefined;
  const activeRouteEndpoints = activeLeg
    ? {
      from: activeLeg.fromLocationId ?? (activeLeg.fromNode === IO_NODE ? 'I/O' : activeLeg.fromNode),
      to: activeLeg.toLocationId ?? (activeLeg.toNode === IO_NODE ? 'I/O' : activeLeg.toNode),
    }
    : undefined;
  const unmappedLocations = 'route' in currentWave ? currentWave.route.filter((step) => !(step.location_id in mapData.racks)) : [];

  const handleToggleLocation = async (waveId: string, index: number) => {
    if (!('route' in currentWave) || !session) return;
    const step = currentWave.route[index];
    const isCurrentlyPicked = step.status === 'picked';

    if (!isCurrentlyPicked && !currentWave.route.slice(0, index).every((s) => s.status === 'picked')) {
      window.alert('Selesaikan lokasi sebelumnya terlebih dahulu.');
      return;
    }
    if (isCurrentlyPicked && !currentWave.route.slice(index + 1).every((s) => s.status === 'pending')) {
      window.alert('Batalkan lokasi setelahnya terlebih dahulu.');
      return;
    }

    const snapshotWaves = waves;

    setWaves((previousWaves) => previousWaves.map((wave) => {
      if (wave.wave_id !== waveId) return wave;

      const route = wave.route.map((s, i) => (
        i === index ? { ...s, status: isCurrentlyPicked ? ('pending' as const) : ('picked' as const) } : s
      ));
      const complete = route.every((s) => s.status === 'picked');
      return { ...wave, route, status: complete ? 'done' : wave.status };
    }));

    try {
      if (!isCurrentlyPicked) {
        const response = await fetch(`${API_BASE_URL}/api/pick/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            wave_id: waveId,
            location_id: step.location_id,
            qty_actual: step.qty,
          }),
        });

        if (!response.ok) {
          throw new Error('Gagal mengonfirmasi pick di server.');
        }
      }
    } catch (err) {
      console.error('Error updating location:', err);
      window.alert('Gagal memperbarui status pick. Mengembalikan tampilan...');
      setWaves(snapshotWaves);
    }
  };

  if (loading && waves.length === 0 && !errorMessage) {
    return (
      <Box sx={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', bgcolor: '#0a1a4b' }}>
        <CircularProgress sx={{ color: 'white' }} />
      </Box>
    );
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[#0a1a4b] p-3 text-[#202938] sm:p-5">
      <header className="mx-auto flex w-full max-w-[1600px] shrink-0 flex-col gap-2 rounded-md border border-white/15 bg-[#0a1a4b] px-4 py-2 text-white lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center">
          <Image src="/logo-nexwave.svg" alt="nexWAVE Operations Control" width={210} height={54} className="h-auto w-[156px] sm:w-[198px]" priority />
        </div>
        <div className="flex items-center gap-4">
          {session?.user?.email && (
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              {session.user.email}
            </Typography>
          )}
          <Button 
            variant="outlined" 
            size="small" 
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
            sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', '&:hover': { borderColor: 'white', bgcolor: 'rgba(255,255,255,0.1)' } }}
          >
            Keluar
          </Button>
        </div>
      </header>

      <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 gap-3 pt-3 lg:grid-cols-[370px_minmax(0,1fr)]">
        {errorMessage ? (
          <Box className="col-span-2 flex flex-col items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 p-6 text-white text-center">
            <Typography variant="h6" className="text-red-400 font-bold mb-1">Gagal Memuat Data</Typography>
            <Typography variant="body2" sx={{ opacity: 0.8 }} className="max-w-md">{errorMessage}</Typography>
            <Button variant="contained" size="small" sx={{ mt: 2, bgcolor: '#0056d6' }} onClick={() => session && fetchData(session.access_token)}>
              Coba Lagi
            </Button>
          </Box>
        ) : waves.length === 0 ? (
          <Box className="col-span-2 flex flex-col items-center justify-center rounded-md border border-white/15 bg-white/5 text-white">
            <Typography variant="h6">Tidak ada wave aktif</Typography>
            <Typography variant="body2" sx={{ opacity: 0.6 }}>Silahkan tunggu order baru atau hubungi admin.</Typography>
          </Box>
        ) : (
          <>
            <aside className="flex min-h-0 flex-col overflow-hidden rounded-md border border-[#cbd5e1] bg-[#f4f6fa]">
              <div className="shrink-0 border-b border-[#d8dee8] bg-white px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#0056d6]"><LogisticsIcon name="warehouse" className="h-4 w-4" />Manifest pengambilan</p>
                    <h1 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#202938]">Urutan kerja wave</h1>
                  </div>
                  <span className="rounded-md border border-[#cbd5e1] px-2 py-1 text-[11px] font-medium text-[#526176]">I/O: {IO_NODE}</span>
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
                      <button key={wave.wave_id} onClick={() => setActiveWaveId(wave.wave_id)} className={`w-full rounded-md border p-4 text-left transition ${selected ? 'border-[#0056d6] bg-[#eaf2ff]' : 'border-[#d8dee8] bg-white hover:border-[#8fb3ee]'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div><p className="font-semibold text-[#202938]">{wave.wave_id}</p><p className="mt-1 text-xs text-[#687386]">{wave.route.length} lokasi · {wave.total_items} item</p></div>
                          <span className={`rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] ${complete ? 'border-[#8ab5f2] bg-[#eaf2ff] text-[#0056d6]' : 'border-[#f5b78d] bg-[#fff1e8] text-[#c64d00]'}`}>{complete ? 'Selesai' : 'Berjalan'}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 border-t border-[#d8dee8] pt-4">
                  <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#0056d6]"><LogisticsIcon name="scan" className="h-4 w-4" />Daftar pick</p>
                  <ol className="space-y-2">
                    {('route' in currentWave) && currentWave.route.map((step, index) => {
                      const isPicked = step.status === 'picked';
                      const isNext = !isPicked && (index === 0 || currentWave.route[index - 1].status === 'picked');
                      return (
                        <li key={`${step.location_id}-${index}`}>
                          <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition ${isPicked ? 'border-[#b6cced] bg-[#eaf2ff]' : isNext ? 'border-[#ff6600] bg-white' : 'border-[#d8dee8] bg-[#eef1f5] opacity-65'}`}>
                            <input type="checkbox" checked={isPicked} disabled={!isPicked && !isNext} onChange={() => handleToggleLocation(currentWave.wave_id!, index)} className="h-4 w-4 accent-[#0056d6]" />
                            <span className="min-w-0 flex-1"><span className={`flex items-center gap-1.5 text-sm font-medium ${isPicked ? 'text-[#0056d6] line-through' : 'text-[#202938]'}`}><LogisticsIcon name="pin" className="h-4 w-4 shrink-0" />{index + 1}. {step.location_id}</span><span className="mt-0.5 block text-xs text-[#687386]">{step.product_ref} · {step.qty} unit · Lantai {step.floor}</span></span>
                          </label>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            </aside>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-md border border-[#cbd5e1] bg-white">
              <div className="shrink-0 flex flex-col gap-4 border-b border-[#d8dee8] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-lg border border-[#d8dee8] bg-white px-4 py-2 shadow-sm min-w-[130px]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#687386]">Wave Aktif</p>
                    <p className="mt-0.5 text-lg font-bold text-[#202938]">{('wave_id' in currentWave) ? currentWave.wave_id : '-'}</p>
                  </div>

                  <div className="rounded-lg border border-[#d8dee8] bg-white px-4 py-2 shadow-sm min-w-[140px]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#687386]">Progres</p>
                    <p className="mt-0.5 text-lg font-bold text-[#202938]">
                      {pickedCount} <span className="text-xs font-normal text-[#687386]">/ {('route' in currentWave) ? currentWave.route.length : 0} lokasi</span>
                    </p>
                  </div>

                  <div className="rounded-lg border border-[#0056d6]/20 bg-[#eaf2ff]/50 px-4 py-2 shadow-sm min-w-[140px]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#0056d6]">Jumlah</p>
                    <p className="mt-0.5 text-lg font-bold text-[#0056d6]">
                      {pickedItemsCount} <span className="text-xs font-normal text-[#526176]">/ {('total_items' in currentWave) ? currentWave.total_items : 0} items</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 rounded-md border border-[#cbd5e1]/50 p-0.5 self-start sm:self-auto" aria-label="Pilih level gudang">
                  {[1, 2, 3, 4].map((level) => (
                    <button
                      key={level}
                      onClick={() => setActiveLevel(level)}
                      aria-pressed={activeLevel === level}
                      className={`min-w-9 rounded-md px-2 py-1 text-[10px] font-medium transition ${
                        activeLevel === level ? 'bg-[#ff6600] text-white' : 'text-[#202938] hover:bg-[#cbd5e1]/28'
                      }`}
                    >
                      L{level}
                    </button>
                  ))}
                </div>
              </div>
              <div className="shrink-0 border-b border-[#d8dee8] bg-[#f7f9fc] px-5 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0056d6]">Leg Rute Aktif</p>
                    <h2 className="mt-0.5 flex items-center gap-2 text-xl font-medium tracking-[-0.035em] text-[#202938]">
                      {activeRouteEndpoints ? (
                        <>
                          <span>{activeRouteEndpoints.from}</span>
                          <ArrowForwardIcon fontSize="small" />
                          <span>{activeRouteEndpoints.to}</span>
                        </>
                      ) : (
                        'Tidak ada leg aktif'
                      )}
                    </h2>
                  </div>

                  {activeStep && (
                    <div className="flex items-center gap-6 mr-10">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#687386]">Ref Produk</p>
                        <p className="mt-0.5 text-sm font-semibold text-[#526176]">{activeStep.product_ref}</p>
                      </div>

                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#687386]">Jumlah Pick</p>
                        <p className="mt-0.5 text-sm font-semibold text-[#526176]">{activeStep.qty} unit</p>
                      </div>

                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#687386]">Lantai</p>
                        <p className="mt-0.5 text-sm font-semibold text-[#526176]">Lantai {activeStep.floor}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {unmappedLocations.length > 0 && <p className="shrink-0 border-b border-[#f5b78d] bg-[#fff1e8] px-5 py-3 text-sm text-[#9b3c00]">Lokasi tidak ditemukan di peta: {unmappedLocations.map((step) => step.location_id).join(', ')}.</p>}
              <div className="min-h-0 flex-1"><MapViewer activeLevel={activeLevel} route={('route' in currentWave) ? currentWave.route : []} routeLegs={routeLegs} activeLegIndex={activeLegIndex} /></div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}