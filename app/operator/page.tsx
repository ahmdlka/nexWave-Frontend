'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Alert, Backdrop, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, TextField, Typography } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import MapViewer from '@/components/MapViewer';
import mapData from '@/data/master_map_data.json';
import { API_BASE_URL, apiHeaders, getApiError } from '@/lib/api';
import { getPickerRoute, confirmPickDirect, reportProblemDirect, closeOwnWave } from '@/lib/supabase-queries';
import { buildRouteLegs } from '@/lib/route-legs';
import { supabase } from '@/lib/supabase';
import { getPickerRoute } from '@/lib/supabase-queries';

type RouteStep = { id: number; step: number; location_id: string; product_ref: string; qty: number; floor: number; status: 'pending' | 'active' | 'picked' | 'problem'; instruction: string };
type PickerWave = { wave_id: string; status: string; total_items: number; total_distance: number; route: RouteStep[] };
type OperatorProfile = { id: string; role: string; full_name: string | null; email: string | null; avatar_url: string | null };
type Notice = { message: string; severity: 'success' | 'info' };

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
  const [finishingWave, setFinishingWave] = useState(false);
  const [assigningNext, setAssigningNext] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activeLevel, setActiveLevel] = useState(1);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');

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

  async function confirmPick() {
    if (!wave || !activeStep || !pickerId) return;
    setSubmitting(true);
    setError(null);
    try {
      await confirmPickDirect(activeStep.id);
      await loadWave(pickerId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Aksi tidak dapat diproses.');
    } finally {
      setSubmitting(false);
    }
  }

  function openReportDialog() {
    if (!wave || !activeStep) return;
    setReportReason('');
    setReportDialogOpen(true);
  }

  async function submitReportProblem() {
    if (!wave || !activeStep || !pickerId || !reportReason.trim()) return;
    setReportDialogOpen(false);
    setSubmitting(true);
    setError(null);
    try {
      await reportProblemDirect(activeStep.id, reportReason.trim());
      await loadWave(pickerId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Aksi tidak dapat diproses.');
    } finally {
      setSubmitting(false);
    }
  }

  async function finishWave() {
    if (!wave || !canFinish || !token || !pickerId) return;
    setFinishingWave(true);
    setError(null);
    try {
      await closeOwnWave(wave.wave_id); // fase 1: instant, langsung ke Supabase -- wave sudah 'done' begitu ini resolve
      setAssigningNext(true); // fase 2 mulai: Modal, bisa kena cold start
      const response = await fetch(`${API_BASE_URL}/api/wave/done`, { method: 'POST', headers: apiHeaders(token, true), body: JSON.stringify({ wave_id: wave.wave_id }) });
      if (!response.ok) throw new Error(await getApiError(response));
      const result = await response.json() as {
        wave_summary: { wave_id: string; total_items: number; total_distance: number };
        next_wave: { wave_id: string } | null;
      };
      await loadWave(pickerId);
      setNotice({
        message: result.next_wave
          ? `Wave ${result.wave_summary.wave_id} selesai — ${result.wave_summary.total_items} item. Wave berikutnya: ${result.next_wave.wave_id}.`
          : `Wave ${result.wave_summary.wave_id} selesai — ${result.wave_summary.total_items} item. Belum ada wave berikutnya.`,
        severity: 'success',
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menyelesaikan wave.');
    } finally {
      setFinishingWave(false);
      setAssigningNext(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) return <Box sx={{ display: 'flex', height: '100dvh', alignItems: 'center', justifyContent: 'center', bgcolor: '#0a1a4b' }}><CircularProgress sx={{ color: 'white' }} /></Box>;

  return <main className="flex h-dvh flex-col gap-3 overflow-hidden bg-[#0a1a4b] p-3 text-[#202938] sm:p-5">
    <Backdrop open={finishingWave} sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.modal + 1, flexDirection: 'column', gap: 2 }}>
      <CircularProgress color="inherit" />
      <Typography>{assigningNext ? 'Mencari wave berikutnya…' : 'Menutup wave…'}</Typography>
    </Backdrop>
    <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert onClose={() => setNotice(null)} severity={notice?.severity ?? 'success'} variant="filled" sx={{ width: '100%' }}>{notice?.message}</Alert>
    </Snackbar>
    <Dialog open={reportDialogOpen} onClose={() => setReportDialogOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>Laporkan Masalah</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: '#687386', mb: 2 }}>
          Lokasi <strong>{activeStep?.location_id}</strong> · {activeStep?.product_ref}
        </Typography>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {['stok_habis', 'barang_rusak', 'lokasi_salah'].map((preset) => (
            <Chip key={preset} label={preset} size="small" onClick={() => setReportReason(preset)} color={reportReason === preset ? 'warning' : 'default'} variant={reportReason === preset ? 'filled' : 'outlined'} />
          ))}
        </div>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          label="Jelaskan kendalanya"
          value={reportReason}
          onChange={(event) => setReportReason(event.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setReportDialogOpen(false)}>Batal</Button>
        <Button variant="contained" color="warning" disabled={!reportReason.trim()} onClick={submitReportProblem}>Laporkan</Button>
      </DialogActions>
    </Dialog>
    <header className="mx-auto flex w-full max-w-[1300px] shrink-0 items-center justify-between rounded-md border border-white/15 px-4 py-2 text-white"><Image src="/logo-nexwave.svg" alt="nexWAVE Operations" width={190} height={48} priority /><div className="flex items-center gap-3"><Typography variant="body2" sx={{ opacity: .8 }}>{profile?.full_name || profile?.email}</Typography><Button size="small" variant="outlined" startIcon={<LogoutIcon />} onClick={logout} sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>Keluar</Button></div></header>
    {error ? <Box className="mx-auto flex w-full max-w-[1300px] flex-1 flex-col items-center justify-center rounded-md bg-red-500/10 p-6 text-center text-white"><Typography variant="h6">Rute tidak tersedia</Typography><Typography sx={{ mt: 1, opacity: .8 }}>{error}</Typography><Button variant="contained" sx={{ mt: 2 }} onClick={() => pickerId && loadWave(pickerId)}>Coba lagi</Button></Box> : !wave ? <Box className="mx-auto flex w-full max-w-[1300px] flex-1 flex-col items-center justify-center rounded-md bg-white p-6 text-center"><Typography variant="h6">Belum ada wave</Typography><Typography className="mt-1 text-[#687386]">{message}</Typography><Button sx={{ mt: 2 }} onClick={() => pickerId && loadWave(pickerId)}>Periksa lagi</Button></Box> : <div className="mx-auto grid min-h-0 w-full max-w-[1300px] flex-1 gap-3 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-y-auto rounded-md bg-[#f4f6fa] p-4"><p className="text-xs font-bold uppercase tracking-wider text-[#0056d6]">Rute saya · Picker {pickerId}</p><h1 className="mt-1 text-xl font-semibold">{wave.wave_id}</h1><p className="mt-1 text-sm text-[#687386]">{completed}/{wave.route.length} lokasi selesai · {wave.total_items} item</p><div className="mt-4 space-y-2">{wave.route.map((step) => <div key={step.id} className={`rounded border p-3 ${step.location_id === activeStep?.location_id ? 'border-[#ff6600] bg-white' : step.status === 'picked' ? 'border-[#b6cced] bg-[#eaf2ff]' : 'border-[#d8dee8] bg-[#eef1f5]'}`}><p className="font-semibold">{step.step}. {step.location_id}</p><p className="text-xs text-[#687386]">{step.product_ref} · {step.qty} unit · Level Rak {step.floor}</p><p className="mt-1 text-xs font-medium uppercase text-[#526176]">{step.status}</p></div>)}</div></aside>
      <section className="flex min-h-0 flex-col overflow-hidden rounded-md bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><p className="text-xs font-bold uppercase tracking-wider text-[#0056d6]">Tugas saat ini</p><h2 className="text-lg font-semibold">{activeStep ? activeStep.instruction : 'Semua lokasi sudah diproses'}</h2></div><div className="flex rounded border p-1">{[1, 2, 3, 4].map((level) => <button key={level} onClick={() => setActiveLevel(level)} className={`rounded px-3 py-1 text-xs ${activeLevel === level ? 'bg-[#ff6600] text-white' : ''}`}>L{level}</button>)}</div></div><div className="flex flex-wrap gap-2 border-b p-3">{activeStep && <><Button variant="contained" disabled={submitting || finishingWave} onClick={confirmPick} sx={{ bgcolor: '#0056d6' }}>Konfirmasi pick</Button><Button variant="outlined" color="warning" disabled={submitting || finishingWave} onClick={openReportDialog}>Laporkan masalah</Button></>}<Button variant="outlined" disabled={!canFinish || submitting || finishingWave} onClick={finishWave}>{assigningNext ? 'Mencari wave berikutnya…' : 'Selesaikan wave'}</Button></div><div className="min-h-0 flex-1"><MapViewer activeLevel={activeLevel} route={wave.route} routeLegs={routeLegs} activeLegIndex={activeLegIndex} /></div></section>
    </div>}
  </main>;
}
