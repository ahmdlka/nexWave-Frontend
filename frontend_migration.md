# Frontend Migration Service

Hasil review `app.zip` yang dikirim (isinya folder `app/`: `page.tsx`, `login/`, `auth/callback/`, `manager/`, `operator/`) terhadap kontrak baru di [api.md](api.md) & [frontend_auth.md](frontend_auth.md) (Opsi B). Bukan panduan generik — ini patch konkret ke kode yang Anda kirim.

`lib/api.ts` dan `lib/supabase.ts` TIDAK ikut ter-zip, jadi diasumsikan sudah sesuai pattern di [frontend_auth.md](frontend_auth.md#1-environment-variables) poin 1-2 (client Supabase standar + `apiHeaders`/`getApiError`/`API_BASE_URL` buat fetch ke Modal). `lib/route-legs.ts`, `components/MapViewer`, `data/master_map_data.json` di luar scope — nggak nyentuh endpoint yang berubah.

## Ringkasan

| File | Status | Kenapa |
|---|---|---|
| `app/page.tsx` | ✅ Sudah sesuai | Cuma routing berdasar role dari `users` table, nggak nyentuh endpoint yang berubah |
| `app/login/page.tsx` | ✅ Sudah sesuai | Google OAuth + email/password langsung ke Supabase Auth |
| `app/auth/callback/page.tsx` | ✅ Sudah sesuai | — |
| `app/manager/page.tsx` | 🚨 **Perlu diubah** — 1 bagian rusak sekarang | `wave/active` & `shift/summary` masih lewat Modal (boleh, tapi lambat); `generate-orders` manggil endpoint yang **SUDAH DIHAPUS** minggu ini → 404 |
| `app/operator/page.tsx` | ⚠️ Perlu diubah | `picker/next`, `pick/confirm`, `wave/problem` masih lewat Modal (boleh, tapi lambat); `wave/done` **TETAP** — jangan diubah |
| `lib/supabase-queries.ts` | 🆕 File baru | Isi semua query Supabase langsung buat gantiin 5 endpoint + `generate-orders` |

---

## 🚨 Prioritas #1 — ini yang bikin app Anda rusak SEKARANG

`generateOrders()` di `app/manager/page.tsx` manggil `POST /api/dev/generate-orders`. Endpoint itu **sudah dihapus total** dari backend (diganti arsitektur Opsi B — insert langsung ke Supabase, lihat [api.md](api.md#alur-data)). Tombol "Generate order demo" di dashboard manager bakal dapat `404` sampai bagian 2.5 di bawah di-terapkan.

## 0. Setup di luar kode frontend — kerjakan DULU

Kode di bagian 1 nggak akan jalan tanpa ini:
- [ ] `schema.sql` STEP 8 sudah di-apply ke Supabase (tabel `product_catalog` + RLS + index)
- [ ] `seed_product_catalog.py` sudah dijalankan (isi 198 `product_ref`)

Kalau belum, `generateDummyOrders()` di bagian 1 bakal langsung throw `"product_catalog / locations kosong"`.

---

## 1. File baru: `lib/supabase-queries.ts`

Semua query/insert Supabase langsung dikumpulkan di sini (satu tempat, sama seperti `lib/api.ts` mengumpulkan pemanggilan Modal) — dipakai oleh `manager/page.tsx` dan `operator/page.tsx` di bagian bawah.

```typescript
import { supabase } from '@/lib/supabase';

// ── Manager: GET /api/wave/active ──────────────────────────────────────────
export async function getActiveWaves() {
  const { data, error } = await supabase
    .from('waves')
    .select(`
      wave_id, status, picker_id, total_items, total_distance,
      pickers ( name ),
      wave_locations (
        location_id, visit_order, status, problem_reason,
        orders ( product_ref, qty ),
        locations ( x, y, z )
      )
    `)
    .in('status', ['forming', 'assigned', 'in_progress'])
    .order('created_at');
  if (error) throw new Error(`Gagal memuat wave aktif: ${error.message}`);

  return (data ?? []).map((w) => ({
    wave_id: w.wave_id, status: w.status, picker_id: w.picker_id,
    picker_name: w.pickers?.name ?? null,
    total_items: w.total_items, total_distance: w.total_distance,
    locations: (w.wave_locations ?? [])
      .sort((a, b) => a.visit_order - b.visit_order)
      .map((l) => ({
        location_id: l.location_id, visit_order: l.visit_order, status: l.status,
        product_ref: l.orders?.product_ref ?? null, qty: l.orders?.qty ?? null,
        x: l.locations?.x, y: l.locations?.y, z: l.locations?.z,
      })),
  }));
}

// ── Manager: GET /api/shift/summary ────────────────────────────────────────
export async function getShiftSummary() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);

  const { data: waves, error: wavesError } = await supabase.from('waves')
    .select('status, total_items, total_distance')
    .gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
  if (wavesError) throw new Error(`Gagal memuat ringkasan wave: ${wavesError.message}`);

  const { data: orders, error: ordersError } = await supabase.from('orders')
    .select('status')
    .gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
  if (ordersError) throw new Error(`Gagal memuat ringkasan order: ${ordersError.message}`);

  const totalItems = (waves ?? []).reduce((s, w) => s + (w.total_items ?? 0), 0);
  const totalDist = (waves ?? []).reduce((s, w) => s + (w.total_distance ?? 0), 0);
  return {
    n_waves: waves?.length ?? 0,
    waves_done: waves?.filter((w) => w.status === 'done').length ?? 0,
    waves_active: waves?.filter((w) => w.status === 'in_progress').length ?? 0,
    waves_forming: waves?.filter((w) => ['forming', 'assigned'].includes(w.status)).length ?? 0,
    total_items: totalItems,
    items_picked: orders?.filter((o) => o.status === 'picked').length ?? 0,
    total_distance: Math.round(totalDist * 10) / 10,
    dist_per_item: totalItems ? Math.round((totalDist / totalItems) * 10) / 10 : 0,
  };
}

// ── Manager: "generate-orders" (Opsi B — INSERT doang, arrival_ts +5..20 menit) ──
export async function generateDummyOrders() {
  const { data: products } = await supabase.from('product_catalog').select('product_ref');
  const { data: locations } = await supabase.from('locations').select('location_id');
  if (!products?.length || !locations?.length) {
    throw new Error('product_catalog / locations kosong — jalankan seed_product_catalog.py dulu.');
  }

  const n = 35 + Math.floor(Math.random() * 36); // 35-70
  const rows = Array.from({ length: n }, () => {
    const minutesAhead = 5 + Math.random() * 15; // 5-20 menit ke depan
    return {
      order_id: `ORD-GEN-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
      product_ref: products[Math.floor(Math.random() * products.length)].product_ref,
      qty: 1 + Math.floor(Math.random() * 6),
      location_id: locations[Math.floor(Math.random() * locations.length)].location_id,
      arrival_ts: new Date(Date.now() + minutesAhead * 60_000).toISOString(),
      status: 'pending',
    };
  });

  const { error } = await supabase.from('orders').insert(rows);
  // RLS "manager_insert_orders" -- kalau caller bukan manager, INSERT ditolak
  // (error.code 42501). Halaman ini sudah di-gate role==='manager' sebelum
  // render, jadi harusnya nggak pernah kejadian di jalur normal.
  if (error) throw new Error(`Gagal generate order: ${error.message}`);
  return { generated: n, order_ids: rows.map((r) => r.order_id) };
}

// ── Operator: GET /api/picker/{id}/next ────────────────────────────────────
export async function getPickerRoute(pickerId: number) {
  const { data: wave } = await supabase
    .from('waves')
    .select('wave_id, status, total_items, total_distance')
    .eq('picker_id', pickerId)
    .in('status', ['assigned', 'in_progress'])
    .maybeSingle();

  if (!wave) return { wave_id: null, status: 'no_wave', message: 'Tidak ada wave tersedia.' };

  const { data: locs } = await supabase
    .from('wave_locations')
    .select('visit_order, location_id, status, orders(product_ref, qty), locations(x,y,z)')
    .eq('wave_id', wave.wave_id)
    .order('visit_order');

  let prevFloor: number | null = null;
  const route = (locs ?? []).map((l) => {
    const floor = l.locations?.z ?? 1;
    const note = prevFloor !== null && floor !== prevFloor ? `Naik ke Lantai ${floor} — ` : '';
    prevFloor = floor;
    return {
      step: l.visit_order, location_id: l.location_id,
      product_ref: l.orders?.product_ref ?? null, qty: l.orders?.qty ?? null,
      floor, x: l.locations?.x, y: l.locations?.y, status: l.status,
      instruction: `${note}Ambil ${l.orders?.qty} unit ${l.orders?.product_ref} di ${l.location_id}`,
    };
  });

  return { wave_id: wave.wave_id, status: wave.status, total_items: wave.total_items,
           total_distance: wave.total_distance, route };
}

// ── Operator: POST /api/pick/confirm ───────────────────────────────────────
export async function confirmPickDirect(waveId: string, locationId: string) {
  const { error } = await supabase.from('wave_locations')
    .update({ status: 'picked', picked_ts: new Date().toISOString() })
    .eq('wave_id', waveId).eq('location_id', locationId);
  if (error) throw new Error(`Gagal konfirmasi pick: ${error.message}`);
}

// ── Operator: POST /api/wave/problem ───────────────────────────────────────
export async function reportProblemDirect(waveId: string, locationId: string, reason: string) {
  const { error } = await supabase.from('wave_locations')
    .update({ status: 'problem', problem_reason: reason })
    .eq('wave_id', waveId).eq('location_id', locationId);
  if (error) throw new Error(`Gagal melaporkan masalah: ${error.message}`);
}
```

---

## 2. `app/manager/page.tsx`

### 2.1 Import — ganti `lib/api` dengan `lib/supabase-queries`
Setelah migrasi ini, halaman manager **nggak manggil Modal sama sekali lagi** (`wave/active`, `shift/summary`, `generate-orders` semuanya jadi Supabase langsung).
```diff
- import { API_BASE_URL, apiHeaders, getApiError } from '@/lib/api';
+ import { getActiveWaves, getShiftSummary, generateDummyOrders } from '@/lib/supabase-queries';
```

### 2.2 Hapus state `token` — nggak dipakai lagi
```diff
- const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<ManagerProfile | null>(null);
```
(lihat juga 2.4, tempat `setToken(...)` dipanggil — itu juga dihapus)

### 2.3 `loadDashboard()`
```diff
- const loadDashboard = useCallback(async (accessToken: string) => {
+ const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
-     const [wavesResponse, summaryResponse] = await Promise.all([
-       fetch(`${API_BASE_URL}/api/wave/active`, { headers: apiHeaders(accessToken) }),
-       fetch(`${API_BASE_URL}/api/shift/summary`, { headers: apiHeaders(accessToken) }),
-     ]);
-     if (!wavesResponse.ok) throw new Error(await getApiError(wavesResponse));
-     if (!summaryResponse.ok) throw new Error(await getApiError(summaryResponse));
-
-     const nextWaves = (await wavesResponse.json()).map(toWave) as Wave[];
+     const [activeWaves, shiftSummary] = await Promise.all([getActiveWaves(), getShiftSummary()]);
+     const nextWaves = activeWaves.map(toWave) as Wave[];
      setWaves(nextWaves);
-     setSummary(await summaryResponse.json() as ShiftSummary);
+     setSummary(shiftSummary as ShiftSummary);
      setActiveWaveId((current) => nextWaves.some((wave) => wave.wave_id === current) ? current : (nextWaves[0]?.wave_id || ''));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Tidak dapat memuat dashboard manager.');
    } finally {
      setLoading(false);
    }
  }, []);
```
`toWave()` nggak perlu diubah — `getActiveWaves()` sengaja dibentuk return-nya biar field-nya (`locations[]` dengan `x,y,z`) sama persis kayak response Modal yang lama.

### 2.4 `initialise()` di dalam `useEffect`
```diff
        if (!userProfile || userProfile.role !== 'manager') return router.replace('/');

-       setToken(session.access_token);
        setProfile(userProfile);
-       await loadDashboard(session.access_token);
+       await loadDashboard();
```

### 2.5 `generateOrders()` — INI YANG FIX 404-nya
```diff
  async function generateOrders() {
-   if (!token) return;
    setGenerating(true);
    try {
-     const response = await fetch(`${API_BASE_URL}/api/dev/generate-orders`, { method: 'POST', headers: apiHeaders(token) });
-     if (!response.ok) throw new Error(await getApiError(response));
-     await loadDashboard(token);
+     const { generated } = await generateDummyOrders();
+     window.alert(`${generated} order dibuat. Wave baru akan muncul beberapa menit lagi (diproses otomatis tiap 10 menit) — bukan instan seperti sebelumnya.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal membuat order demo.');
    } finally {
      setGenerating(false);
    }
  }
```
**Penting, beda perilaku dari sebelumnya**: dulu abis generate langsung `loadDashboard()` dan wave baru langsung keliatan (karena Modal proses semuanya sinkron). Sekarang generate cuma `INSERT` — wave baru BELUM ada sampai `process_due_orders_cron` jalan (maks 10 menit lagi). `loadDashboard()` sengaja **dihapus** dari sini karena manggilnya sekarang nggak akan nunjukkin apa-apa yang baru. `window.alert` di sini placeholder secukupnya (konsisten sama `window.prompt` yang sudah dipakai di `operator/page.tsx`) — ganti ke MUI Snackbar kalau mau lebih rapi.

### 2.6 Tombol "Muat ulang" & "Coba lagi" — hapus dependency ke `token`
```diff
- <Button size="small" variant="outlined" onClick={() => token && loadDashboard(token)} sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>Muat ulang</Button>
+ <Button size="small" variant="outlined" onClick={() => loadDashboard()} sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>Muat ulang</Button>
```
```diff
- <Button variant="contained" sx={{ mt: 2 }} onClick={() => token && loadDashboard(token)}>Coba lagi</Button>
+ <Button variant="contained" sx={{ mt: 2 }} onClick={() => loadDashboard()}>Coba lagi</Button>
```

### 2.7 (Opsional) Tombol "Proses Sekarang" — buat demo, biar nggak nunggu 10 menit
Kalau mau ada cara manual trigger pas demo, **JANGAN hapus** `token` state (2.2) & import `lib/api` (2.1) — tambahkan lagi keduanya, lalu:
```typescript
async function processNow() {
  if (!token) return;
  setGenerating(true);
  try {
    const response = await fetch(`${API_BASE_URL}/api/dev/process-pending-orders`, { method: 'POST', headers: apiHeaders(token) });
    if (!response.ok) throw new Error(await getApiError(response));
    await loadDashboard();
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : 'Gagal memproses order.');
  } finally {
    setGenerating(false);
  }
}
```
Ini murni opsional/dev-only — bukan bagian wajib migrasi.

---

## 3. `app/operator/page.tsx`

`wave/done` **TETAP lewat Modal, TIDAK berubah** (butuh Attention Routing buat nentuin wave berikutnya) — `token`, `apiHeaders`, `API_BASE_URL`, `getApiError` semua tetap dipakai, jangan dihapus.

### 3.1 Import — tambahan, bukan pengganti
```diff
  import { API_BASE_URL, apiHeaders, getApiError } from '@/lib/api';
+ import { getPickerRoute, confirmPickDirect, reportProblemDirect } from '@/lib/supabase-queries';
```

### 3.2 `loadWave()`
```diff
- const loadWave = useCallback(async (accessToken: string, id: number) => {
+ const loadWave = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
-     const response = await fetch(`${API_BASE_URL}/api/picker/${id}/next`, { headers: apiHeaders(accessToken) });
-     if (!response.ok) throw new Error(await getApiError(response));
-     const data = await response.json() as PickerWave & { message?: string };
+     const data = await getPickerRoute(id) as PickerWave & { message?: string };
      if (!data.wave_id || data.status === 'no_wave') {
```

### 3.3 `initialise()` di dalam `useEffect` — cuma ganti pemanggilan `loadWave`
```diff
        setToken(session.access_token);
        setProfile(userProfile);
        setPickerId(picker.picker_id);
-       await loadWave(session.access_token, picker.picker_id);
+       await loadWave(picker.picker_id);
```
`setToken(...)` di atasnya **tetap ada** (masih dipakai `finishWave`/`submit` di bawah).

### 3.4 `confirmPick()` & `reportProblem()` — lepas dari `submit()`, panggil Supabase langsung
`submit()` (generic POST-to-Modal helper) **tetap ada**, tapi mulai sekarang cuma dipakai `finishWave()` (lihat 3.5) — dua fungsi ini nggak lewat situ lagi:
```diff
  async function confirmPick() {
    if (!wave || !activeStep) return;
-   await submit('/api/pick/confirm', { wave_id: wave.wave_id, location_id: activeStep.location_id, qty_actual: activeStep.qty });
+   if (!pickerId) return;
+   setSubmitting(true);
+   setError(null);
+   try {
+     await confirmPickDirect(wave.wave_id, activeStep.location_id);
+     await loadWave(pickerId);
+   } catch (cause) {
+     setError(cause instanceof Error ? cause.message : 'Aksi tidak dapat diproses.');
+   } finally {
+     setSubmitting(false);
+   }
  }

  async function reportProblem() {
    if (!wave || !activeStep) return;
    const reason = window.prompt('Jelaskan kendala di lokasi ini:', 'stok_habis');
    if (!reason) return;
-   await submit('/api/wave/problem', { wave_id: wave.wave_id, location_id: activeStep.location_id, reason });
+   if (!pickerId) return;
+   setSubmitting(true);
+   setError(null);
+   try {
+     await reportProblemDirect(wave.wave_id, activeStep.location_id, reason);
+     await loadWave(pickerId);
+   } catch (cause) {
+     setError(cause instanceof Error ? cause.message : 'Aksi tidak dapat diproses.');
+   } finally {
+     setSubmitting(false);
+   }
  }
```
Catatan: dulu backend `pick/confirm` balikin `qty_actual` ke response, tapi komponen ini nggak pernah pakai response-nya (cuma `await submit(...)` lalu lanjut) — jadi nggak hilang fungsi apapun, `qty_actual` yang dikirim di request lama juga nggak pernah dipakai buat apa-apa di kolom manapun (lihat [api.md](api.md#post-apipickconfirm--supabase-langsung-bukan-modal), field `qty` di `wave_locations`/`orders` udah fixed dari awal, `qty_actual` cuma buat log). Kalau nanti mau nyimpen `qty_actual` yang beda dari `qty` rencana, itu perlu kolom baru — di luar scope migrasi ini.

### 3.5 `finishWave()` — TIDAK BERUBAH
```typescript
  async function finishWave() {
    if (!wave || !canFinish) return;
    await submit('/api/wave/done', { wave_id: wave.wave_id });
  }
```
Biarkan persis seperti ini.

### 3.6 Tombol "Coba lagi" / "Periksa lagi" — hapus dependency ke `token` (2 tempat, baris yang sama)
```diff
- <Button variant="contained" sx={{ mt: 2 }} onClick={() => token && pickerId && loadWave(token, pickerId)}>Coba lagi</Button>
+ <Button variant="contained" sx={{ mt: 2 }} onClick={() => pickerId && loadWave(pickerId)}>Coba lagi</Button>
```
```diff
- <Button sx={{ mt: 2 }} onClick={() => token && pickerId && loadWave(token, pickerId)}>Periksa lagi</Button>
+ <Button sx={{ mt: 2 }} onClick={() => pickerId && loadWave(pickerId)}>Periksa lagi</Button>
```

---

## 4. `app/page.tsx`, `app/login/page.tsx`, `app/auth/callback/page.tsx`

✅ **Nggak perlu diubah.** Sudah pakai `supabase.auth.getSession()` + query `users.role` langsung, sama persis pattern [frontend_auth.md](frontend_auth.md#4-tau-role--picker_id-sendiri--query-supabase-langsung-bukan-lewat-backend) poin 4 — nggak nyentuh salah satu dari 6 hal yang berubah.

(Opsional, di luar scope migrasi ini: ketiga halaman ini proteksi role-nya dari client (`useEffect` + `router.replace`), bukan server-side `getClaims()` kayak yang disaranin [frontend_auth.md](frontend_auth.md#6-proteksi-halaman-proxyserver-component--pakai-getclaims-bukan-getsession) poin 6 — kalau `proxy.ts`/middleware belum ada, itu independen dari migrasi Opsi B ini, bisa dikerjain terpisah.)

---

## 5. Testing checklist

- [ ] Login manager (Google) → dashboard `manager/page.tsx` load tanpa error
- [ ] Klik "Generate order demo" → muncul alert "N order dibuat...", **BUKAN** error 404
- [ ] Dashboard TIDAK langsung nunjukkin wave baru setelah generate (expected — bukan bug)
- [ ] Tunggu ≤10 menit (atau pakai tombol "Proses Sekarang" dari 2.7 kalau dipasang) → klik "Muat ulang" → wave baru muncul
- [ ] Login operator → rute muncul (`getPickerRoute`)
- [ ] "Konfirmasi pick" satu lokasi → lokasi itu jadi `picked`, lokasi berikutnya jadi aktif, TANPA error
- [ ] "Laporkan masalah" → lokasi jadi status `problem`
- [ ] "Selesaikan wave" (setelah semua lokasi `picked`/`problem`) → tetap lewat Modal, dapat `next_wave` kalau ada
- [ ] Login sebagai operator lain (`picker2`, dst) → cuma lihat wave miliknya sendiri (RLS)
