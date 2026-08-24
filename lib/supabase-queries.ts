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
    location_id: string; visit_order: number; status: string; problem_reason: string | null;
    orders: { product_ref: string; qty: number } | null;
    locations: { x: number; y: number; z: number } | null;
  }[];
};

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

  const rows = (data ?? []) as unknown as ActiveWaveRow[];
  return rows.map((w) => ({
    wave_id: w.wave_id, status: w.status, picker_id: w.picker_id,
    picker_name: w.pickers?.name ?? null,
    total_items: w.total_items, total_distance: w.total_distance,
    locations: [...w.wave_locations]
      .sort((a, b) => a.visit_order - b.visit_order)
      .map((l) => ({
        location_id: l.location_id, visit_order: l.visit_order, status: l.status,
        product_ref: l.orders?.product_ref ?? '', qty: l.orders?.qty ?? 0,
        x: l.locations?.x ?? 0, y: l.locations?.y ?? 0, z: l.locations?.z ?? 1,
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

// ── Manager: "generate-orders" (INSERT langsung, arrival_ts +5..20 menit) ──
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
  // (error.code 42501), beda dari SELECT yang gagal diam-diam.
  if (error) throw new Error(`Gagal generate order: ${error.message}`);
  return { generated: n, order_ids: rows.map((r) => r.order_id) };
}

type PickerRouteLocationRow = {
  visit_order: number; location_id: string; status: string;
  orders: { product_ref: string; qty: number } | null;
  locations: { x: number; y: number; z: number } | null;
};

// ── Operator: GET /api/picker/{id}/next ────────────────────────────────────
export async function getPickerRoute(pickerId: number) {
  const { data: wave } = await supabase
    .from('waves')
    .select('wave_id, status, total_items, total_distance')
    .eq('picker_id', pickerId)
    .in('status', ['assigned', 'in_progress'])
    .maybeSingle();

  if (!wave) return { wave_id: null, status: 'no_wave', message: 'Tidak ada wave tersedia.' };
  // ^ ini juga yang balik kalau pickerId bukan milik caller sendiri -- RLS
  // filter row-nya diam-diam, hasilnya identik "no_wave", bukan 403.

  const { data: locs } = await supabase
    .from('wave_locations')
    .select('visit_order, location_id, status, orders(product_ref, qty), locations(x,y,z)')
    .eq('wave_id', wave.wave_id)
    .order('visit_order');

  let prevFloor: number | null = null;
  const rows = (locs ?? []) as unknown as PickerRouteLocationRow[];
  const route = rows.map((l) => {
    const floor = l.locations?.z ?? 1;
    const productRef = l.orders?.product_ref ?? '';
    const qty = l.orders?.qty ?? 0;
    const note = prevFloor !== null && floor !== prevFloor ? `Naik ke Lantai ${floor} — ` : '';
    prevFloor = floor;
    return {
      step: l.visit_order, location_id: l.location_id,
      product_ref: productRef, qty,
      floor, x: l.locations?.x ?? 0, y: l.locations?.y ?? 0, status: l.status,
      instruction: `${note}Ambil ${qty} unit ${productRef} di ${l.location_id}`,
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
