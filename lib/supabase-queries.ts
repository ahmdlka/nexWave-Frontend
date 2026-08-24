import { supabase } from '@/lib/supabase';

function getRelatedItem<T>(relation: T | T[] | null | undefined) {
  return Array.isArray(relation) ? relation[0] ?? null : relation ?? null;
}

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

  return (data ?? []).map((wave) => {
    const picker = getRelatedItem(wave.pickers);
    return {
      wave_id: wave.wave_id,
      status: wave.status,
      picker_id: wave.picker_id,
      picker_name: picker?.name ?? null,
      total_items: wave.total_items,
      total_distance: wave.total_distance,
      locations: (wave.wave_locations ?? [])
        .sort((left, right) => left.visit_order - right.visit_order)
        .map((location) => {
          const order = getRelatedItem(location.orders);
          const storageLocation = getRelatedItem(location.locations);
          return {
            location_id: location.location_id,
            visit_order: location.visit_order,
            status: location.status,
            product_ref: order?.product_ref ?? null,
            qty: order?.qty ?? null,
            x: storageLocation?.x,
            y: storageLocation?.y,
            z: storageLocation?.z,
          };
        }),
    };
  });
}

export async function getShiftSummary() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data: waves, error: wavesError } = await supabase
    .from('waves')
    .select('status, total_items, total_distance')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString());
  if (wavesError) throw new Error(`Gagal memuat ringkasan wave: ${wavesError.message}`);

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('status')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString());
  if (ordersError) throw new Error(`Gagal memuat ringkasan order: ${ordersError.message}`);

  const totalItems = (waves ?? []).reduce((sum, wave) => sum + (wave.total_items ?? 0), 0);
  const totalDistance = (waves ?? []).reduce((sum, wave) => sum + (wave.total_distance ?? 0), 0);
  return {
    n_waves: waves?.length ?? 0,
    waves_done: waves?.filter((wave) => wave.status === 'done').length ?? 0,
    waves_active: waves?.filter((wave) => wave.status === 'in_progress').length ?? 0,
    waves_forming: waves?.filter((wave) => ['forming', 'assigned'].includes(wave.status)).length ?? 0,
    total_items: totalItems,
    items_picked: orders?.filter((order) => order.status === 'picked').length ?? 0,
    total_distance: Math.round(totalDistance * 10) / 10,
    dist_per_item: totalItems ? Math.round((totalDistance / totalItems) * 10) / 10 : 0,
  };
}

export async function generateDummyOrders() {
  const { data: products, error: productsError } = await supabase.from('product_catalog').select('product_ref');
  if (productsError) throw new Error(`Gagal memuat katalog produk: ${productsError.message}`);

  const { data: locations, error: locationsError } = await supabase.from('locations').select('location_id');
  if (locationsError) throw new Error(`Gagal memuat lokasi: ${locationsError.message}`);

  if (!products?.length || !locations?.length) {
    throw new Error('product_catalog / locations kosong — jalankan seed_product_catalog.py dulu.');
  }

  const count = 35 + Math.floor(Math.random() * 36);
  const rows = Array.from({ length: count }, () => {
    const minutesAhead = 5 + Math.random() * 15;
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
  if (error) throw new Error(`Gagal generate order: ${error.message}`);
  return { generated: count, order_ids: rows.map((row) => row.order_id) };
}

export async function getPickerRoute(pickerId: number) {
  const { data: wave, error: waveError } = await supabase
    .from('waves')
    .select('wave_id, status, total_items, total_distance')
    .eq('picker_id', pickerId)
    .in('status', ['assigned', 'in_progress'])
    .maybeSingle();
  if (waveError) throw new Error(`Gagal memuat wave picker: ${waveError.message}`);

  if (!wave) return { wave_id: null, status: 'no_wave', message: 'Tidak ada wave tersedia.' };

  const { data: locations, error: locationsError } = await supabase
    .from('wave_locations')
    .select('id, visit_order, location_id, status, orders(product_ref, qty), locations(x,y,z)')
    .eq('wave_id', wave.wave_id)
    .order('visit_order');
  if (locationsError) throw new Error(`Gagal memuat rute wave: ${locationsError.message}`);

  let previousFloor: number | null = null;
  const route = (locations ?? []).map((location) => {
    const order = getRelatedItem(location.orders);
    const storageLocation = getRelatedItem(location.locations);
    const floor = storageLocation?.z ?? 1;
    const note = previousFloor !== null && floor !== previousFloor ? `Naik ke Lantai ${floor} — ` : '';
    previousFloor = floor;
    return {
      route_item_id: location.id,
      step: location.visit_order,
      location_id: location.location_id,
      product_ref: order?.product_ref ?? null,
      qty: order?.qty ?? null,
      floor,
      x: storageLocation?.x,
      y: storageLocation?.y,
      status: location.status,
      instruction: `${note}Ambil ${order?.qty} unit ${order?.product_ref} di ${location.location_id}`,
    };
  });

  return {
    wave_id: wave.wave_id,
    status: wave.status,
    total_items: wave.total_items,
    total_distance: wave.total_distance,
    route,
  };
}
