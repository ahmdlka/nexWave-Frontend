'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import MapViewer from '@/components/MapViewer';
import mapData from '@/data/master_map_data.json';
import { API_BASE_URL, apiHeaders, getApiError } from '@/lib/api';
import { getActiveStep, isChecklistComplete, updateActiveStepStatus } from '@/lib/operator-checklist';
import { buildRouteLegs } from '@/lib/route-legs';
import { supabase } from '@/lib/supabase';
import { getPickerRoute } from '@/lib/supabase-queries';

type RouteStep = { route_item_id: number; step: number; location_id: string; product_ref: string; qty: number; floor: number; status: 'pending' | 'active' | 'picked' | 'problem'; instruction: string };
type PickerWave = { wave_id: string; status: string; total_items: number; total_distance: number; route: RouteStep[] };
type OperatorProfile = { id: string; role: string; full_name: string | null; email: string | null; avatar_url: string | null };

export default function OperatorPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [pickerId, setPickerId] = useState<number | null>(null);
  const [profile, setProfile] = useState<OperatorProfile | null>(null);
  const [wave, setWave] = useState<PickerWave | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeLevel, setActiveLevel] = useState(1);

  const loadWave = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPickerRoute(id) as PickerWave & { message?: string };
      if (!data.wave_id || data.status === 'no_wave') {
        setWave(null);
        setMessage(data.message || 'Tidak ada wave tersedia.');
      } else {
        setWave(data);
        setMessage('');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Tidak dapat memuat rute operator.');
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
          .select('id, role, full_name, email, avatar_url')
          .eq('id', session.user.id)
          .maybeSingle();
        if (profileError) throw new Error(`Gagal mengambil profil operator: ${profileError.message}`);
        if (!userProfile || userProfile.role !== 'operator') return router.replace('/');

        const { data: picker, error: pickerError } = await supabase
          .from('pickers')
          .select('picker_id, name, auth_user_id')
          .eq('auth_user_id', session.user.id)
          .maybeSingle();
        if (pickerError) throw new Error(`Gagal mengambil profil picker: ${pickerError.message}`);
        if (!picker) throw new Error('Profil picker belum terhubung ke akun operator ini. Hubungkan pickers.auth_user_id dengan ID user Supabase.');

        setToken(session.access_token);
        setProfile(userProfile);
        setPickerId(picker.picker_id);
        await loadWave(picker.picker_id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Gagal memverifikasi akses operator.');
        setLoading(false);
      }
    }
    void initialise();
  }, [loadWave, router]);

  const completed = useMemo(() => wave?.route.filter((step) => step.status === 'picked' || step.status === 'problem').length || 0, [wave]);
  const activeStep = useMemo(() => wave ? getActiveStep(wave.route) : undefined, [wave]);
  const routeLegs = useMemo(() => wave ? buildRouteLegs(wave.route, mapData.racks, isChecklistComplete(wave.route)) : [], [wave]);
  const activeLegIndex = activeStep ? routeLegs.findIndex((leg) => leg.toLocationId === activeStep.location_id) : routeLegs.findIndex((leg) => leg.kind === 'return');
  const canFinish = Boolean(wave && isChecklistComplete(wave.route));

  async function submit(path: string, body: object) {
    if (!token || !pickerId) return false;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers: apiHeaders(token, true), body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await getApiError(response));
      await loadWave(pickerId);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Aksi tidak dapat diproses.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmPick() {
    if (!wave || !activeStep) return;
    setWave((current) => current ? { ...current, route: updateActiveStepStatus(current.route, 'picked') } : current);
  }

  async function finishWave() {
    if (!wave || !canFinish) return;
    await submit('/api/wave/done', { wave_id: wave.wave_id });
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) return <Box sx={{ display: 'flex', height: '100dvh', alignItems: 'center', justifyContent: 'center', bgcolor: '#0a1a4b' }}><CircularProgress sx={{ color: 'white' }} /></Box>;

  return <main className="flex h-dvh flex-col gap-3 overflow-hidden bg-[#0a1a4b] p-3 text-[#202938] sm:p-5">
    <header className="mx-auto flex w-full max-w-[1300px] shrink-0 items-center justify-between rounded-md border border-white/15 px-4 py-2 text-white"><Image src="/logo-nexwave.svg" alt="nexWAVE Operations" width={190} height={48} priority /><div className="flex items-center gap-3"><Typography variant="body2" sx={{ opacity: .8 }}>{profile?.full_name || profile?.email}</Typography><Button size="small" variant="outlined" startIcon={<LogoutIcon />} onClick={logout} sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>Keluar</Button></div></header>
    {error ? <Box className="mx-auto flex w-full max-w-[1300px] flex-1 flex-col items-center justify-center rounded-md bg-red-500/10 p-6 text-center text-white"><Typography variant="h6">Rute tidak tersedia</Typography><Typography sx={{ mt: 1, opacity: .8 }}>{error}</Typography><Button variant="contained" sx={{ mt: 2 }} onClick={() => pickerId && loadWave(pickerId)}>Coba lagi</Button></Box> : !wave ? <Box className="mx-auto flex w-full max-w-[1300px] flex-1 flex-col items-center justify-center rounded-md bg-white p-6 text-center"><Typography variant="h6">Belum ada wave</Typography><Typography className="mt-1 text-[#687386]">{message}</Typography><Button sx={{ mt: 2 }} onClick={() => pickerId && loadWave(pickerId)}>Periksa lagi</Button></Box> : <div className="mx-auto grid min-h-0 w-full max-w-[1300px] flex-1 gap-3 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col rounded-md bg-[#f4f6fa] p-4"><p className="text-xs font-bold uppercase tracking-wider text-[#0056d6]">Rute saya · Picker {pickerId}</p><h1 className="mt-1 text-xl font-semibold">{wave.wave_id}</h1><p className="mt-1 text-sm text-[#687386]">{completed}/{wave.route.length} lokasi selesai · {wave.total_items} item</p><div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">{wave.route.map((step, index) => <div key={`${step.route_item_id ?? step.location_id}-${index}`} className={`rounded border p-3 ${step.location_id === activeStep?.location_id ? 'border-[#ff6600] bg-white' : step.status === 'picked' ? 'border-[#b6cced] bg-[#eaf2ff]' : 'border-[#d8dee8] bg-[#eef1f5]'}`}><p className="font-semibold">{step.step}. {step.location_id}</p><p className="text-xs text-[#687386]">{step.product_ref} · {step.qty} unit · Lantai {step.floor}</p><p className="mt-1 text-xs font-medium uppercase text-[#526176]">{step.status}</p>{step.location_id === activeStep?.location_id && <Button fullWidth variant="contained" disabled={submitting} onClick={confirmPick} sx={{ mt: 2, bgcolor: '#0056d6' }}>Checklist</Button>}</div>)}</div><div className="mt-4 border-t pt-4"><Button fullWidth variant="contained" disabled={!canFinish || submitting} onClick={finishWave} sx={{ bgcolor: '#0056d6' }}>Selesaikan wave</Button></div></aside>
      <section className="flex min-h-0 flex-col overflow-hidden rounded-md bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><p className="text-xs font-bold uppercase tracking-wider text-[#0056d6]">Tugas saat ini</p><h2 className="text-lg font-semibold">{activeStep ? activeStep.instruction : 'Semua lokasi sudah diproses'}</h2></div><div className="flex rounded border p-1">{[1, 2, 3, 4].map((level) => <button key={level} onClick={() => setActiveLevel(level)} className={`rounded px-3 py-1 text-xs ${activeLevel === level ? 'bg-[#ff6600] text-white' : ''}`}>L{level}</button>)}</div></div><div className="min-h-0 flex-1"><MapViewer activeLevel={activeLevel} route={wave.route} routeLegs={routeLegs} activeLegIndex={activeLegIndex} /></div></section>
    </div>}
  </main>;
}
