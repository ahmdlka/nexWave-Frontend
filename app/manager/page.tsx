'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemButton, ListItemText, Snackbar, Typography } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MapViewer from '@/components/MapViewer';
import mapData from '@/data/master_map_data.json';
import { getActiveWaves, getCompletedWaves, getShiftSummary, getDueOrders, generateDummyOrders, type DueOrder } from '@/lib/supabase-queries';
import { API_BASE_URL, apiHeaders, getApiError } from '@/lib/api';
import { buildRouteLegs } from '@/lib/route-legs';
import { supabase } from '@/lib/supabase';
import { generateDummyOrders, getActiveWaves, getShiftSummary } from '@/lib/supabase-queries';

type RouteStep = { id: number; location_id: string; product_ref: string; qty: number; floor: number; status: string; visit_order: number };
type Wave = { wave_id: string; status: string; picker_name: string | null; total_items: number; total_distance: number; route: RouteStep[] };
type ShiftSummary = { n_waves: number; waves_done: number; waves_active: number; total_items: number; items_picked: number };
type ManagerProfile = { full_name: string | null; email: string | null; role: string };
type Notice = { message: string; severity: 'success' | 'info' };

function toWave(data: { wave_id: string; status: string; picker_name: string | null; total_items: number; total_distance: number; locations: Array<Omit<RouteStep, 'floor'> & { z: number }> }): Wave {
  return { ...data, route: data.locations.map(({ z, ...location }) => ({ ...location, floor: z })) };
}

const STEP_STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  picked: { color: '#0056d6', bg: '#eaf2ff' },
  active: { color: '#ff6600', bg: '#fff1e6' },
  problem: { color: '#ef4444', bg: '#fef2f2' },
  pending: { color: '#94a3b8', bg: '#f1f5f9' },
};

function stepStatusStyle(status: string) {
  return STEP_STATUS_STYLE[status] ?? STEP_STATUS_STYLE.pending;
}

export default function ManagerPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ManagerProfile | null>(null);
  const [waves, setWaves] = useState<Wave[]>([]);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [dueOrders, setDueOrders] = useState<DueOrder[]>([]);
  const [dueOrdersOpen, setDueOrdersOpen] = useState(false);
  const [completedWaves, setCompletedWaves] = useState<Wave[]>([]);
  const [completedWavesOpen, setCompletedWavesOpen] = useState(false);
  const [selectedCompletedWaveId, setSelectedCompletedWaveId] = useState<string | null>(null);
  const [activeWaveId, setActiveWaveId] = useState('');
  const [detailWaveId, setDetailWaveId] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState(1);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activeWaves, shiftSummary, due, completed] = await Promise.all([getActiveWaves(), getShiftSummary(), getDueOrders(), getCompletedWaves()]);
      const nextWaves = activeWaves.map(toWave) as Wave[];
      setWaves(nextWaves);
      setSummary(shiftSummary as ShiftSummary);
      setDueOrders(due);
      setCompletedWaves(completed.map(toWave) as Wave[]);
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

  const selectedCompletedWave = useMemo(() => completedWaves.find((w) => w.wave_id === selectedCompletedWaveId) ?? null, [completedWaves, selectedCompletedWaveId]);
  const completedRouteLegs = useMemo(() => selectedCompletedWave ? buildRouteLegs(selectedCompletedWave.route, mapData.racks, true) : [], [selectedCompletedWave]);
  const completedActiveLegIndex = completedRouteLegs.findIndex((leg) => leg.kind === 'return');

  function openCompletedWaves() {
    setDetailWaveId(null);
    setSelectedCompletedWaveId(null);
    setCompletedWavesOpen(true);
  }

  function closeCompletedWaves() {
    setCompletedWavesOpen(false);
    setSelectedCompletedWaveId(null);
  }

  async function generateOrders() {
    setGenerating(true);
    try {
      const { generated } = await generateDummyOrders();
      setNotice({ message: `${generated} order dibuat. Wave baru akan muncul beberapa menit lagi (diproses otomatis tiap 10 menit) — bukan instan seperti sebelumnya.`, severity: 'success' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal membuat order demo.');
    } finally {
      setGenerating(false);
    }
  }

  async function processNow() {
    if (!token) return;
    setProcessing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/dev/process-pending-orders`, { method: 'POST', headers: apiHeaders(token) });
      if (!response.ok) throw new Error(await getApiError(response));
      const result = await response.json() as { processed: number };
      await loadDashboard();
      setNotice(result.processed > 0
        ? { message: `${result.processed} order diproses, wave diperbarui.`, severity: 'success' }
        : { message: 'Belum ada order yang jatuh tempo untuk diproses.', severity: 'info' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal memproses order.');
    } finally {
      setProcessing(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) return <Box sx={{ display: 'flex', height: '100dvh', alignItems: 'center', justifyContent: 'center', bgcolor: '#0a1a4b' }}><CircularProgress sx={{ color: 'white' }} /></Box>;

  return <main className="flex h-dvh flex-col gap-3 overflow-hidden bg-[#0a1a4b] p-3 text-[#202938] sm:p-5">
    <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert onClose={() => setNotice(null)} severity={notice?.severity ?? 'success'} variant="filled" sx={{ width: '100%' }}>{notice?.message}</Alert>
    </Snackbar>
    <Dialog open={dueOrdersOpen} onClose={() => setDueOrdersOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 0.5 }}>
        Antrian order ({dueOrders.length})
        <Typography variant="body2" sx={{ mt: 0.5, color: '#687386', fontWeight: 400 }}>Pending &amp; sudah jatuh tempo, belum masuk wave</Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {dueOrders.length === 0 ? <Typography sx={{ p: 3, color: '#687386' }}>Tidak ada order yang menunggu diproses.</Typography> : <List disablePadding>
          {dueOrders.map((order) => <ListItem key={order.order_id} divider sx={{ gap: 1.5, py: 1.25 }}>
            <ListItemText
              primary={<span><span className="font-semibold">{order.product_ref}</span><span className="text-[#687386]"> × {order.qty}</span><span className="ml-2 font-mono text-xs text-[#687386]">{order.location_id ?? 'tanpa lokasi'}</span></span>}
              secondary={<span className="font-mono text-[11px] text-[#94a3b8]">{order.order_id}</span>}
            />
            <div className="flex shrink-0 items-center gap-1 rounded-full border border-[#ffb020]/50 bg-[#fff8ec] px-2.5 py-1 text-xs font-bold text-[#a15c00]">
              <AccessTimeIcon sx={{ fontSize: 14 }} />
              {new Date(order.arrival_ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </ListItem>)}
        </List>}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDueOrdersOpen(false)}>Tutup</Button>
      </DialogActions>
    </Dialog>
    <header className="mx-auto flex w-full max-w-[1600px] shrink-0 items-center justify-between rounded-md border border-white/15 px-4 py-2 text-white">
      <Image src="/logo-nexwave.svg" alt="nexWAVE Operations Control" width={210} height={54} priority />
      <div className="flex items-center gap-3"><Typography variant="body2" sx={{ opacity: .8 }}>{profile?.full_name || profile?.email}</Typography><Button size="small" variant="outlined" onClick={() => loadDashboard()} sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>Muat ulang</Button><Button size="small" variant="outlined" startIcon={<LogoutIcon />} onClick={logout} sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>Keluar</Button></div>
    </header>
    {error ? <Box className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col items-center justify-center rounded-md bg-red-500/10 p-6 text-center text-white"><Typography variant="h6">Dashboard tidak tersedia</Typography><Typography sx={{ mt: 1, opacity: .8 }}>{error}</Typography><Button variant="contained" sx={{ mt: 2 }} onClick={() => loadDashboard()}>Coba lagi</Button></Box> : <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-y-auto rounded-md bg-[#f4f6fa] p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[#0056d6]">Manager dashboard</p><h1 className="mt-1 text-xl font-semibold">Wave aktif</h1>
        <div className="mt-4 grid grid-cols-2 gap-2">{[['Wave', summary?.n_waves], ['Aktif', summary?.waves_active], ['Selesai', summary?.waves_done], ['Item dipick', `${summary?.items_picked ?? 0}/${summary?.total_items ?? 0}`]].map(([label, value]) => <div key={String(label)} className="rounded border bg-white p-3"><p className="text-xs text-[#687386]">{label}</p><p className="mt-1 font-bold">{value}</p></div>)}</div>
        <Button fullWidth variant="contained" disabled={generating || processing} onClick={generateOrders} sx={{ mt: 3, bgcolor: '#0056d6' }}>{generating ? 'Membuat order…' : 'Generate order demo'}</Button>
        <Button fullWidth variant="outlined" disabled={generating || processing} onClick={processNow} sx={{ mt: 1 }}>{processing ? 'Memproses…' : 'Proses Sekarang'}</Button>
        <div className="mt-3 flex items-center justify-between rounded border border-[#ffb020]/50 bg-[#fff8ec] p-3">
          <div>
            <p className="text-xs text-[#687386]">Antrian order</p>
            <p className="mt-1 text-2xl font-bold text-[#a15c00]">{dueOrders.length}</p>
            <p className="text-xs text-[#687386]">Pending &amp; sudah jatuh tempo, belum masuk wave</p>
          </div>
          <Button size="small" variant="outlined" disabled={!dueOrders.length} onClick={() => setDueOrdersOpen(true)} sx={{ borderColor: '#a15c00', color: '#a15c00' }}>Detail</Button>
        </div>
        <div className="mt-3 flex items-center justify-between rounded border border-[#22c55e]/40 bg-[#f0fdf4] p-3">
          <div>
            <p className="text-xs text-[#687386]">Wave selesai</p>
            <p className="mt-1 text-2xl font-bold text-[#16a34a]">{completedWaves.length}</p>
            <p className="text-xs text-[#687386]">Rampung hari ini</p>
          </div>
          <Button size="small" variant="outlined" disabled={!completedWaves.length} onClick={openCompletedWaves} sx={{ borderColor: '#16a34a', color: '#16a34a' }}>Detail</Button>
        </div>
        <div className="mt-4 space-y-2">{waves.map((wave) => <div key={wave.wave_id} onClick={() => { setActiveWaveId(wave.wave_id); setCompletedWavesOpen(false); }} className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded border p-3 text-left ${wave.wave_id === activeWave?.wave_id && !completedWavesOpen ? 'border-[#0056d6] bg-[#eaf2ff]' : 'border-[#d8dee8] bg-white'}`}>
          <div className="min-w-0">
            <p className="font-semibold">{wave.wave_id}</p>
            <p className="mt-1 text-xs text-[#687386]">{wave.picker_name} · {wave.total_items} item · {wave.status}</p>
          </div>
          <Button size="small" variant="text" onClick={(event) => { event.stopPropagation(); setActiveWaveId(wave.wave_id); setCompletedWavesOpen(false); setDetailWaveId((current) => current === wave.wave_id ? null : wave.wave_id); }}>Detail</Button>
        </div>)}</div>
      </aside>
      <section className="flex min-h-0 flex-col overflow-hidden rounded-md bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><p className="text-xs font-bold uppercase tracking-wider text-[#0056d6]">{completedWavesOpen ? 'Riwayat wave selesai' : 'Peta seluruh wave'}</p><h2 className="text-lg font-semibold">{completedWavesOpen ? (selectedCompletedWave ? `${selectedCompletedWave.wave_id} · ${selectedCompletedWave.picker_name ?? '-'}` : `${completedWaves.length} wave selesai hari ini`) : (activeWave ? `${activeWave.wave_id} · ${activeWave.picker_name}` : 'Tidak ada wave aktif')}</h2></div><div className="flex rounded border p-1">{[1, 2, 3, 4].map((level) => <button key={level} onClick={() => setActiveLevel(level)} className={`rounded px-3 py-1 text-xs ${activeLevel === level ? 'bg-[#ff6600] text-white' : ''}`}>L{level}</button>)}</div></div>
        {completedWavesOpen ? (
          selectedCompletedWave ? <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-[#f0fdf4] p-3 text-sm">
              <div className="flex items-center gap-3">
                <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => setSelectedCompletedWaveId(null)}>Daftar</Button>
                <span>{selectedCompletedWave.total_items} item · <strong>{selectedCompletedWave.total_distance.toFixed(0)} m</strong> total jarak</span>
              </div>
              <Button size="small" onClick={closeCompletedWaves}>Tutup</Button>
            </div>
            <div className="min-h-0 flex-1"><MapViewer activeLevel={activeLevel} route={selectedCompletedWave.route} routeLegs={completedRouteLegs} activeLegIndex={completedActiveLegIndex} /></div>
          </> : <div className="min-h-0 flex-1 overflow-y-auto bg-white">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-[#f0fdf4] px-4 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#16a34a]">Wave selesai · {completedWaves.length}</p>
              <Button size="small" onClick={closeCompletedWaves}>Tutup</Button>
            </div>
            {completedWaves.length === 0 ? <div className="p-6 text-center text-sm text-[#687386]">Belum ada wave yang selesai hari ini.</div> : <List disablePadding>
              {completedWaves.map((w) => <ListItem key={w.wave_id} divider disablePadding>
                <ListItemButton onClick={() => setSelectedCompletedWaveId(w.wave_id)} sx={{ py: 1.25, px: 2 }}>
                  <ListItemText
                    primary={<span className="font-semibold">{w.wave_id}</span>}
                    secondary={`${w.picker_name ?? '-'} · ${w.total_items} item · ${w.total_distance.toFixed(0)} m`}
                  />
                </ListItemButton>
              </ListItem>)}
            </List>}
          </div>
        ) : activeWave ? (
          detailWaveId === activeWave.wave_id ? <div className="min-h-0 flex-1 overflow-y-auto bg-white">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-[#f7f9fc] px-4 py-2.5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#0056d6]">Detail order · {activeWave.route.length} lokasi</p>
                <p className="mt-0.5 text-xs text-[#687386]">
                  {activeWave.route.filter((s) => s.status === 'picked').length} dipick · {activeWave.route.filter((s) => s.status === 'problem').length} bermasalah · {activeWave.route.filter((s) => s.status === 'pending' || s.status === 'active').length} menunggu
                </p>
              </div>
              <Button size="small" onClick={() => setDetailWaveId(null)}>Tutup</Button>
            </div>
            <List dense disablePadding>
              {activeWave.route.map((step, index) => {
                const { color, bg } = stepStatusStyle(step.status);
                return <ListItem key={step.id} divider sx={{ gap: 1.5, py: 1.25 }}>
                  <Box sx={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', bgcolor: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                    {index + 1}
                  </Box>
                  <ListItemText
                    primary={<span><span className="font-semibold">{step.product_ref}</span><span className="text-[#687386]"> × {step.qty}</span></span>}
                    secondary={<span className="font-mono text-xs">{step.location_id}</span>}
                  />
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-full border border-[#d8dee8] px-2 py-0.5 text-[10px] font-bold text-[#687386]">L{step.floor}</span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ color, backgroundColor: bg }}>{step.status}</span>
                  </div>
                </ListItem>;
              })}
            </List>
          </div> : <>
            <div className="border-b bg-[#f7f9fc] p-3 text-sm">Lokasi aktif: <strong>{activeStep?.location_id || 'Tidak ada'}</strong> · {activeStep?.product_ref || '-'}</div>
            <div className="min-h-0 flex-1"><MapViewer activeLevel={activeLevel} route={activeWave.route} routeLegs={routeLegs} activeLegIndex={activeLegIndex} /></div>
          </>
        ) : <div className="flex flex-1 items-center justify-center text-[#687386]">Belum ada wave yang sedang berjalan.</div>}
      </section>
    </div>}
  </main>;
}
