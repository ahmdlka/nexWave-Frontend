'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import MapViewer from '@/components/MapViewer';
import mapData from '@/data/master_map_data.json';
import { buildRouteLegs } from '@/lib/route-legs';
import { supabase } from '@/lib/supabase';
import { generateDummyOrders, getActiveWaves, getShiftSummary } from '@/lib/supabase-queries';

type RouteStep = { location_id: string; product_ref: string; qty: number; floor: number; status: string };
type WaveLocation = Omit<RouteStep, 'floor'> & { z: number };
type Wave = { wave_id: string; status: string; picker_name: string; total_items: number; total_distance: number; route: RouteStep[] };
type ShiftSummary = { n_waves: number; waves_done: number; waves_active: number; total_items: number; items_picked: number };
type ManagerProfile = { full_name: string | null; email: string | null; role: string };

function toWave(data: { wave_id: string; status: string; picker_name: string; total_items: number; total_distance: number; locations: WaveLocation[] }): Wave {
  return { ...data, route: data.locations.map(({ z, ...location }) => ({ ...location, floor: z })) };
}

export default function ManagerPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ManagerProfile | null>(null);
  const [waves, setWaves] = useState<Wave[]>([]);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [activeWaveId, setActiveWaveId] = useState('');
  const [activeLevel, setActiveLevel] = useState(1);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activeWaves, shiftSummary] = await Promise.all([getActiveWaves(), getShiftSummary()]);
      const nextWaves = activeWaves.map(toWave) as Wave[];
      setWaves(nextWaves);
      setSummary(shiftSummary as ShiftSummary);
      setActiveWaveId((current) => nextWaves.some((wave) => wave.wave_id === current) ? current : (nextWaves[0]?.wave_id || ''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Tidak dapat memuat dashboard manager.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function initialise() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return router.replace('/login');

        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('full_name, email, role')
          .eq('id', session.user.id)
          .maybeSingle();
        if (profileError) throw new Error(`Gagal mengambil profil manager: ${profileError.message}`);
        if (!userProfile || userProfile.role !== 'manager') return router.replace('/');

        setProfile(userProfile);
        await loadDashboard();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Gagal memverifikasi akses manager.');
        setLoading(false);
      }
    }
    void initialise();
  }, [loadDashboard, router]);

  const activeWave = useMemo(() => waves.find((wave) => wave.wave_id === activeWaveId) || waves[0], [activeWaveId, waves]);
  const routeLegs = useMemo(() => activeWave ? buildRouteLegs(activeWave.route, mapData.racks, false) : [], [activeWave]);
  const activeStep = activeWave?.route.find((step) => step.status === 'active' || step.status === 'pending');
  const activeLegIndex = activeStep ? routeLegs.findIndex((leg) => leg.toLocationId === activeStep.location_id) : -1;

  async function generateOrders() {
    setGenerating(true);
    try {
      const { generated } = await generateDummyOrders();
      window.alert(`${generated} order dibuat. Wave baru akan muncul beberapa menit lagi (diproses otomatis tiap 10 menit) — bukan instan seperti sebelumnya.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal membuat order demo.');
    } finally {
      setGenerating(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) return <Box sx={{ display: 'flex', height: '100dvh', alignItems: 'center', justifyContent: 'center', bgcolor: '#0a1a4b' }}><CircularProgress sx={{ color: 'white' }} /></Box>;

  return <main className="flex h-dvh flex-col gap-3 overflow-hidden bg-[#0a1a4b] p-3 text-[#202938] sm:p-5">
    <header className="mx-auto flex w-full max-w-[1600px] shrink-0 items-center justify-between rounded-md border border-white/15 px-4 py-2 text-white">
      <Image src="/logo-nexwave.svg" alt="nexWAVE Operations Control" width={210} height={54} priority />
      <div className="flex items-center gap-3"><Typography variant="body2" sx={{ opacity: .8 }}>{profile?.full_name || profile?.email}</Typography><Button size="small" variant="outlined" onClick={loadDashboard} sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>Muat ulang</Button><Button size="small" variant="outlined" startIcon={<LogoutIcon />} onClick={logout} sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>Keluar</Button></div>
    </header>
    {error ? <Box className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col items-center justify-center rounded-md bg-red-500/10 p-6 text-center text-white"><Typography variant="h6">Dashboard tidak tersedia</Typography><Typography sx={{ mt: 1, opacity: .8 }}>{error}</Typography><Button variant="contained" sx={{ mt: 2 }} onClick={loadDashboard}>Coba lagi</Button></Box> : <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-y-auto rounded-md bg-[#f4f6fa] p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[#0056d6]">Manager dashboard</p><h1 className="mt-1 text-xl font-semibold">Wave aktif</h1>
        <div className="mt-4 grid grid-cols-2 gap-2">{[['Wave', summary?.n_waves], ['Aktif', summary?.waves_active], ['Selesai', summary?.waves_done], ['Item dipick', `${summary?.items_picked ?? 0}/${summary?.total_items ?? 0}`]].map(([label, value]) => <div key={String(label)} className="rounded border bg-white p-3"><p className="text-xs text-[#687386]">{label}</p><p className="mt-1 font-bold">{value}</p></div>)}</div>
        <Button fullWidth variant="contained" disabled={generating} onClick={generateOrders} sx={{ mt: 3, bgcolor: '#0056d6' }}>{generating ? 'Membuat order…' : 'Generate order demo'}</Button>
        <div className="mt-4 space-y-2">{waves.map((wave) => <button key={wave.wave_id} onClick={() => setActiveWaveId(wave.wave_id)} className={`w-full rounded border p-3 text-left ${wave.wave_id === activeWave?.wave_id ? 'border-[#0056d6] bg-[#eaf2ff]' : 'border-[#d8dee8] bg-white'}`}><p className="font-semibold">{wave.wave_id}</p><p className="mt-1 text-xs text-[#687386]">{wave.picker_name} · {wave.total_items} item · {wave.status}</p></button>)}</div>
      </aside>
      <section className="flex min-h-0 flex-col overflow-hidden rounded-md bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><p className="text-xs font-bold uppercase tracking-wider text-[#0056d6]">Peta seluruh wave</p><h2 className="text-lg font-semibold">{activeWave ? `${activeWave.wave_id} · ${activeWave.picker_name}` : 'Tidak ada wave aktif'}</h2></div><div className="flex rounded border p-1">{[1, 2, 3, 4].map((level) => <button key={level} onClick={() => setActiveLevel(level)} className={`rounded px-3 py-1 text-xs ${activeLevel === level ? 'bg-[#ff6600] text-white' : ''}`}>L{level}</button>)}</div></div>
        {activeWave ? <><div className="border-b bg-[#f7f9fc] p-3 text-sm">Lokasi aktif: <strong>{activeStep?.location_id || 'Tidak ada'}</strong> · {activeStep?.product_ref || '-'}</div><div className="min-h-0 flex-1"><MapViewer activeLevel={activeLevel} route={activeWave.route} routeLegs={routeLegs} activeLegIndex={activeLegIndex} /></div></> : <div className="flex flex-1 items-center justify-center text-[#687386]">Belum ada wave yang sedang berjalan.</div>}
      </section>
    </div>}
  </main>;
}
