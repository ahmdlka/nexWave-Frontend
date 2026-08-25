import { supabase } from '@/lib/supabase';

// Supabase client di sini nggak di-generic-kan pakai tipe Database, jadi
// embedded relation (pickers/orders/locations) nggak kebawa tipenya otomatis
// dari `.select()` -- tipe row di bawah ini nyatat bentuk asli tiap embed
// to-one sebagai objek tunggal (bukan array), sesuai kontrak di api.md.
type ActiveWaveRow = {
  wave_id: string; status: string; picker_id: number | null;
  total_items: number; total_distance: number;
  pickers: { name: string } | null;
  wave_locations: {
    id: number; location_id: string; visit_order: number; status: string; problem_reason: string | null;
    orders: { product_ref: string; qty: number } | null;
    locations: { x: number; y: number; z: number } | null;
  }[];
};

async function fetchWavesByStatus(
  statuses: string[],
  order: { column: string; ascending: boolean },
  createdRange?: { gte: string; lt: string },
) {
  let query = supabase
    .from('waves')
    .select(`
      wave_id, status, picker_id, total_items, total_distance,
      pickers ( name ),
      wave_locations (
        id, location_id, visit_order, status, problem_reason,
        orders ( product_ref, qty ),
        locations ( x, y, z )
      )
    `)
    .in('status', statuses);
  if (createdRange) query = query.gte('created_at', createdRange.gte).lt('created_at', createdRange.lt);
  const { data, error } = await query.order(order.column, { ascending: order.ascending });
  if (error) throw new Error(`Gagal memuat wave: ${error.message}`);

  const rows = (data ?? []) as unknown as ActiveWaveRow[];
  return rows.map((w) => ({
    wave_id: w.wave_id, status: w.status, picker_id: w.picker_id,
    picker_name: w.pickers?.name ?? null,
    total_items: w.total_items, total_distance: w.total_distance,
    locations: [...w.wave_locations]
      .sort((a, b) => a.visit_order - b.visit_order)
      .map((l) => ({
        id: l.id, location_id: l.location_id, visit_order: l.visit_order, status: l.status,
        product_ref: l.orders?.product_ref ?? '', qty: l.orders?.qty ?? 0,
        x: l.locations?.x ?? 0, y: l.locations?.y ?? 0, z: l.locations?.z ?? 1,
      })),
  }));
}

// ── Manager: GET /api/wave/active ──────────────────────────────────────────
export async function getActiveWaves() {
  return fetchWavesByStatus(['forming', 'assigned', 'in_progress'], { column: 'created_at', ascending: true });
}

// ── Manager: wave `done` hari ini -- histori buat card "Wave selesai".
// Discope ke hari ini (sama kayak getShiftSummary()) -- tanpa batas tanggal,
// daftar ini cuma nambah terus seumur hidup project & bisa kena masalah
// row-cap yang sama kayak locations (lihat getAllLocationIds di atas).
export async function getCompletedWaves() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return fetchWavesByStatus(['done'], { column: 'created_at', ascending: false }, { gte: start.toISOString(), lt: end.toISOString() });
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

export type DueOrder = {
  order_id: string; product_ref: string; qty: number; location_id: string | null; arrival_ts: string;
};

// ── Manager: antrian order `pending` yang `arrival_ts`-nya sudah lewat --
// belum diproses `process_due_orders_cron`/masuk wave manapun. Kriteria sama
// persis dengan yang dipakai `run_due_orders_cycle()` di backend (juga match
// index `idx_orders_due` di schema.sql), cuma dibaca doang di sini.
export async function getDueOrders(): Promise<DueOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('order_id, product_ref, qty, location_id, arrival_ts')
    .eq('status', 'pending')
    .is('wave_id', null)
    .lte('arrival_ts', new Date().toISOString())
    .order('arrival_ts');
  if (error) throw new Error(`Gagal memuat antrian order: ${error.message}`);
  return data ?? [];
}

// Gudang ini 2000+ lokasi (lihat data/master_map_data.json) -- default page
// size Supabase/PostgREST cuma 1000 baris/request, jadi `.select()` polos
// diam-diam kepotong ke sebagian kecil lokasi (nggak acak, ikut urutan
// storage) tanpa error apapun. Tarik semua halaman biar random pick di bawah
// bener-bener nyebar ke seluruh gudang, bukan cuma ~1000 baris pertama.
async function getAllLocationIds(): Promise<string[]> {
  const PAGE_SIZE = 1000;
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from('locations')
      .select('location_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Gagal memuat lokasi: ${error.message}`);
    if (!page?.length) break;
    ids.push(...page.map((l) => l.location_id));
    if (page.length < PAGE_SIZE) break;
  }
  return ids;
}

// ── Manager: "generate-orders" (INSERT langsung, arrival_ts +1..15 menit) ──
export async function generateDummyOrders() {
  const { data: products } = await supabase.from('product_catalog').select('product_ref');
  const locations = await getAllLocationIds();
  if (!products?.length || !locations.length) {
    throw new Error('product_catalog / locations kosong — jalankan seed_product_catalog.py dulu.');
  }

  const n = 35 + Math.floor(Math.random() * 36); // 35-70
  const rows = Array.from({ length: n }, () => {
    const minutesAhead = 1 + Math.random() * 14; // 1-15 menit ke depan
    return {
      order_id: `ORD-GEN-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
      product_ref: products[Math.floor(Math.random() * products.length)].product_ref,
      qty: 1 + Math.floor(Math.random() * 6),
      location_id: locations[Math.floor(Math.random() * locations.length)],
      arrival_ts: new Date(Date.now() + minutesAhead * 60_000).toISOString(),
      status: 'pending',
    };
  });

  const { error } = await supabase.from('orders').insert(rows);
  // RLS "manager_insert_orders" -- kalau caller bukan manager, INSERT ditolak
  // (error.code 42501), beda dari SELECT yang gagal diam-diam.
  if (error) throw new Error(`Gagal generate order: ${error.message}`);
  return { generated: n, order_ids: rows.map((r) => r.order_id) };
}

type PickerRouteLocationRow = {
  id: number; visit_order: number; location_id: string; status: string;
  orders: { product_ref: string; qty: number } | null;
  locations: { x: number; y: number; z: number } | null;
};

// ── Operator: GET /api/picker/{id}/next ────────────────────────────────────
export async function getPickerRoute(pickerId: number) {
  const { data: activeWaves, error: waveError } = await supabase
    .from('waves')
    .select('wave_id, status, total_items, total_distance')
    .eq('picker_id', pickerId)
    .in('status', ['assigned', 'in_progress'])
    .order('created_at');
  if (waveError) throw new Error(`Gagal memuat wave picker: ${waveError.message}`);

  // Normalnya picker cuma punya SATU wave assigned/in_progress sekaligus --
  // `.maybeSingle()` dulu dipakai di sini dan diam-diam nelen error kalau lebih
  // dari satu baris balik (anomali data, mis. batching agent nge-assign wave
  // baru sebelum wave lama beneran `done`), keliatan sebagai "no_wave" padahal
  // datanya ADA. Kalau ternyata lebih dari satu: utamain yang udah
  // `in_progress` (udah mulai dipick), lalu yang paling lama (FIFO).
  const wave = activeWaves?.find((w) => w.status === 'in_progress') ?? activeWaves?.[0];

  if (!wave) return { wave_id: null, status: 'no_wave', message: 'Tidak ada wave tersedia.' };
  // ^ ini juga yang balik kalau pickerId bukan milik caller sendiri -- RLS
  // filter row-nya diam-diam, hasilnya identik "no_wave", bukan 403.

  const { data: locs } = await supabase
    .from('wave_locations')
    .select('id, visit_order, location_id, status, orders(product_ref, qty), locations(x,y,z)')
    .eq('wave_id', wave.wave_id)
    .order('visit_order');

  let prevFloor: number | null = null;
  const rows = (locs ?? []) as unknown as PickerRouteLocationRow[];
  // `step` di sini posisi baris SETELAH di-sort (index+1), BUKAN raw
  // `visit_order` -- visit_order itu nomor STOP fisik, jadi dua produk beda
  // yang kebetulan disimpan di lokasi sama (satu kali kunjungan) bakal punya
  // visit_order yang SAMA (mis. dua baris sama-sama 8), yang lain jadi
  // kelihatan "meloncat" (7 kelewat). index+1 selalu rapi 1,2,3,... sesuai
  // urutan tampil, nggak peduli visit_order aslinya kembar atau bolong.
  const route = rows.map((l, index) => {
    const floor = l.locations?.z ?? 1;
    const productRef = l.orders?.product_ref ?? '';
    const qty = l.orders?.qty ?? 0;
    const note = prevFloor !== null && floor !== prevFloor ? `Ambil di Rak Level ${floor} — ` : '';
    prevFloor = floor;
    return {
      id: l.id, step: index + 1, location_id: l.location_id,
      product_ref: productRef, qty,
      floor, x: l.locations?.x ?? 0, y: l.locations?.y ?? 0, status: l.status,
      instruction: `${note}Ambil ${qty} unit ${productRef} di ${l.location_id}`,
    };
  });

  return { wave_id: wave.wave_id, status: wave.status, total_items: wave.total_items,
           total_distance: wave.total_distance, route };
}

// ── Operator: POST /api/pick/confirm ───────────────────────────────────────
// Filter lewat `id` (PK asli wave_locations), BUKAN wave_id+location_id --
// satu lokasi fisik bisa muncul dua kali dalam satu wave (dua produk beda
// yang kebetulan disimpan di rak yang sama, dipick di kunjungan yang sama),
// jadi wave_id+location_id BISA cocok ke lebih dari satu baris sekaligus.
// RLS "operator_update_own_wave_locations" tetap jalan otomatis lewat id ini
// (row-level, bukan soal filter kolom apa yang dipakai di client).
export async function confirmPickDirect(id: number) {
  const { error } = await supabase.from('wave_locations')
    .update({ status: 'picked', picked_ts: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Gagal konfirmasi pick: ${error.message}`);
}

// ── Operator: POST /api/wave/problem ───────────────────────────────────────
export async function reportProblemDirect(id: number, reason: string) {
  const { error } = await supabase.from('wave_locations')
    .update({ status: 'problem', problem_reason: reason })
    .eq('id', id);
  if (error) throw new Error(`Gagal melaporkan masalah: ${error.message}`);
}

// ── Operator: fase 1 dari wave/done -- instant, Supabase langsung ─────────
// `close_own_wave` (Postgres function, SECURITY DEFINER) nutup wave + bebasin
// picker-nya sendiri. POST /api/wave/done (Modal) tetap dipanggil SETELAH ini
// buat fase 2 (cari wave forming berikutnya + Attention Routing) -- idempotent
// kalau nutup ulang wave yang sama, jadi aman dipanggil dua-duanya berurutan.
export async function closeOwnWave(waveId: string) {
  const { error } = await supabase.rpc('close_own_wave', { p_wave_id: waveId });
  if (error) throw new Error(`Gagal menutup wave: ${error.message}`);
}
