# Frontend Auth Handling — NexWave

Panduan implementasi buat tim frontend (Next.js App Router) — pelengkap bagian [Auth di api.md](api.md#auth) yang sengaja diringkas jadi cuma garis besar. Setup provider di sisi Google/Supabase (bukan kerjaan frontend): [google_oauth_setup.md](google_oauth_setup.md).

---

## Ada DUA backend yang frontend ini bicara

Ini sumber kebingungan paling umum, jadi disebut duluan:

1. **Supabase** — buat login, session, Realtime, dan baca profil sendiri (role). Frontend bicara **langsung** ke Supabase pakai `@supabase/supabase-js` / `@supabase/ssr`, TIDAK lewat backend NexWave.
2. **Backend NexWave** (FastAPI di Modal) — buat data aplikasi beneran: order, wave, rute picker. Frontend bicara ke sini pakai `fetch` biasa + header `Authorization: Bearer <token>`, token-nya didapat dari Supabase di poin 1.

Alurnya: **login & session** → Supabase. **Data warehouse** → backend NexWave (pakai token dari Supabase).

---

## 1. Environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://bxgqzavziovzpohyaubu.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...   # project ini sudah generasi baru Supabase,
                                            # namanya "Publishable key" (Project Settings -> API Keys),
                                            # bukan lagi "anon key" -- tapi fungsinya sama & di kode lama/
                                            # tutorial lama masih sering ditulis NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_API_URL=https://farelfebryan06--nexwave-api-fastapi-app.modal.run
```
`PUBLISHABLE_KEY` publik, aman di-expose ke browser (`NEXT_PUBLIC_*`) — akses sebenarnya dibatasi RLS di DB, bukan oleh kerahasiaan key ini.

---

## 2. Setup client Supabase (boilerplate standar, verifikasi ke docs resmi)

```bash
npm install @supabase/supabase-js @supabase/ssr
```

**`lib/supabase/client.ts`** (dipakai di Client Component — form login, dsb.):
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
```

**`lib/supabase/server.ts`** (dipakai di Server Component/Route Handler) dan **proxy/refresh-session layer** (dulu namanya `middleware.ts`, di dokumentasi Supabase terbaru disebut **Proxy** — fungsinya sama: refresh token expired otomatis tiap request) — copy PERSIS dari halaman resmi, jangan dari ingatan siapa pun termasuk saya, karena bagian cookie-handling ini gampang salah kalau ditulis ulang manual:
👉 **https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs** (pilih tab "Next.js")

Yang saya bisa pastikan dari halaman itu (sudah dicek langsung, bukan tebakan): file top-level-nya sekarang bernama **`proxy.ts`** (bukan `middleware.ts`) isinya:
```typescript
// proxy.ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```
`updateSession` (isi lengkapnya di `lib/supabase/proxy.ts`, copy dari link di atas) yang benar-benar refresh token-nya.

---

## 3. Login — dua form berbeda

**Manager** — tombol "Login dengan Google":
```typescript
const supabase = createClient()
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${window.location.origin}/auth/callback` },
})
```

**Operator** — form email + password biasa (akun dibuatin admin, lihat [google_oauth_setup.md #6](google_oauth_setup.md)):
```typescript
const supabase = createClient()
const { error } = await supabase.auth.signInWithPassword({ email, password })
if (error) { /* tampilkan pesan gagal login */ }
else router.push('/dashboard') // atau /route buat operator, lihat poin 4
```

**Callback route buat Google** (`app/auth/callback/route.ts`) — menangkap `code` dari redirect Google→Supabase→app:
```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }
  return NextResponse.redirect(`${origin}/dashboard`)
}
```
Operator (email/password) **tidak lewat callback ini** — `signInWithPassword` langsung dapat session, tidak ada redirect Google.

**Logout** (sama buat kedua role):
```typescript
await supabase.auth.signOut()
```

---

## 4. Tau role & picker_id sendiri — query Supabase LANGSUNG, bukan lewat backend

Setelah login, `users` (role) dan — khusus operator — `pickers` (picker_id sendiri) dibaca **langsung dari Supabase**, bukan dari backend NexWave (RLS sudah ngizinin baca baris sendiri, lihat `schema.sql` STEP 6):

```typescript
const supabase = createClient()
const { data: { user } } = await supabase.auth.getUser()

const { data: profile } = await supabase
  .from('users').select('role').eq('id', user!.id).single()
// profile.role: 'manager' | 'operator' -- dipakai buat nentuin UI/nav mana yang ditampilin

let myPickerId: number | null = null
if (profile?.role === 'operator') {
  const { data: picker } = await supabase
    .from('pickers').select('picker_id').eq('auth_user_id', user!.id).single()
  myPickerId = picker?.picker_id ?? null
  // myPickerId null artinya operator ini belum di-link admin ke baris pickers --
  // GET /api/picker/{id}/next bakal selalu 403 sampai di-link (lihat schema.sql STEP 6)
}
```

---

## 5. Manggil API NexWave — ambil token, kirim sebagai Bearer

```typescript
async function callApi(path: string, options: RequestInit = {}) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  // getSession() aman dipakai DI SINI khusus buat ambil access_token forward
  // ke service lain (rekomendasi resmi Supabase) -- BEDA sama pakai getSession()
  // buat nentuin "apakah user ini valid/boleh akses halaman", itu pakai getClaims()
  // (lihat poin 6).

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    },
  })

  if (res.status === 401) {
    // token expired/invalid -- paksa login ulang
    await supabase.auth.signOut()
    window.location.href = '/login'
    throw new Error('unauthorized')
  }
  if (res.status === 403) {
    // token valid, tapi role nggak cukup (mis. operator manggil endpoint manager-only)
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail?.message ?? 'forbidden')
  }
  return res.json()
}

// contoh pakai:
const myRoute = await callApi(`/api/picker/${myPickerId}/next`)
```

---

## 6. Proteksi halaman (Proxy/Server Component) — pakai `getClaims()`, BUKAN `getSession()`

Rekomendasi resmi Supabase (dicek langsung dari docs): `getSession()` baca dari local storage/cookie TANPA validasi ulang ke server, jadi payload user-nya bisa dipalsukan di sisi cookie. Buat keputusan "apakah request ini boleh lewat" (proteksi halaman, redirect ke `/login`), pakai `getClaims()` yang memvalidasi signature JWT tiap kali dipanggil:

```typescript
// di Server Component atau di dalam updateSession() (proxy)
const { data: claims } = await supabase.auth.getClaims()
if (!claims) redirect('/login')
```

Ringkasnya kapan pakai yang mana:
| Fungsi | Kapan dipakai |
|---|---|
| `getClaims()` | Proteksi halaman/route — "apakah user ini valid?" |
| `getUser()` | Butuh data user PALING update dari server Supabase (network call) |
| `getSession()` | Cuma butuh `access_token`-nya buat diteruskan ke service lain (poin 5) — jangan percaya `user` di dalamnya buat keputusan otorisasi |

---

## 7. Operasi langsung ke Supabase (BUKAN lewat Modal)

6 dari 9 "endpoint" di [api.md](api.md) (di luar `/health`) sebenarnya nggak nyentuh model ML sama sekali — jadi nggak perlu lewat backend Modal yang lebih lambat (extra network hop + FastAPI + asyncpg overhead, belum lagi cold start). Dipindah ke query/insert Supabase langsung dari frontend. RLS (`schema.sql` STEP 7-8) yang jaga row-level access-nya (operator cuma lihat/update wave miliknya, manager semua) — **BUKAN** lagi kode Python di backend.

**⚠️ Beda penting dari versi Modal**: endpoint Modal yang lama balikin `403 Forbidden` kalau nggak boleh akses. Query Supabase langsung **TIDAK** — buat SELECT, RLS nge-filter baris secara diam-diam, hasilnya array kosong / `null`, bukan error (cek role dulu di sisi frontend, poin 4, sebelum manggil, biar bisa nunjukkin UI "akses ditolak" yang jelas). Buat INSERT (`generate-orders`, di bawah) beda lagi — row yang ditolak RLS balikin **error beneran** (`error.code 42501`), bukan diam-diam kefilter.

Yang MASIH lewat Modal (butuh model ML): `POST /api/order/new` (bukan dipanggil frontend, webhook WMS), `POST /api/wave/done`. Pola `callApi()` di poin 5 tetap dipakai buat keduanya, plus `POST /api/dev/process-pending-orders` kalau butuh trigger manual pas testing (lihat [api.md](api.md#post-apidevprocess-pending-orders)) — normalnya nggak perlu dipanggil frontend produksi karena udah otomatis jalan tiap 10 menit lewat cron di Modal.

### `GET /api/wave/active` → query `waves`
```typescript
const { data } = await supabase
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
  .order('created_at')

// flatten ke bentuk yang sama persis dengan kontrak lama di api.md
const result = (data ?? []).map(w => ({
  wave_id: w.wave_id, status: w.status, picker_id: w.picker_id,
  picker_name: w.pickers?.name ?? null,
  total_items: w.total_items, total_distance: w.total_distance,
  locations: (w.wave_locations ?? [])
    .sort((a, b) => a.visit_order - b.visit_order)
    .map(l => ({
      location_id: l.location_id, visit_order: l.visit_order, status: l.status,
      product_ref: l.orders?.product_ref ?? null, qty: l.orders?.qty ?? null,
      x: l.locations?.x, y: l.locations?.y, z: l.locations?.z,
    })),
}))
```
Manager lihat semua wave (RLS `is_manager()`); kalau operator manggil ini, `data` balik kosong (bukan error) — cek role dulu, jangan andelin ini buat gating.

### `GET /api/picker/{picker_id}/next` → query `waves` + `wave_locations`
```typescript
async function getPickerRoute(pickerId: number) {
  const { data: wave } = await supabase
    .from('waves')
    .select('wave_id, status, total_items, total_distance')
    .eq('picker_id', pickerId)
    .in('status', ['assigned', 'in_progress'])
    .maybeSingle()

  if (!wave) return { wave_id: null, status: 'no_wave', message: 'Tidak ada wave tersedia.' }
  // ^ ini JUGA yang balik kalau operator coba lihat picker_id ORANG LAIN --
  // RLS filter row-nya duluan, jadi keliatannya sama persis kayak "no_wave",
  // bukan 403 kayak versi Modal. Nggak bisa dibedain dari sisi frontend.

  const { data: locs } = await supabase
    .from('wave_locations')
    .select('visit_order, location_id, status, orders(product_ref, qty), locations(x,y,z)')
    .eq('wave_id', wave.wave_id)
    .order('visit_order')

  let prevFloor: number | null = null
  const route = (locs ?? []).map(l => {
    const floor = l.locations?.z ?? 1
    const note = prevFloor !== null && floor !== prevFloor ? `Naik ke Lantai ${floor} — ` : ''
    prevFloor = floor
    return {
      step: l.visit_order, location_id: l.location_id,
      product_ref: l.orders?.product_ref ?? null, qty: l.orders?.qty ?? null,
      floor, x: l.locations?.x, y: l.locations?.y, status: l.status,
      instruction: `${note}Ambil ${l.orders?.qty} unit ${l.orders?.product_ref} di ${l.location_id}`,
    }
  })

  return { wave_id: wave.wave_id, status: wave.status, total_items: wave.total_items,
           total_distance: wave.total_distance, route }
}
```

### `POST /api/pick/confirm` → UPDATE + SELECT `wave_locations`
```typescript
async function confirmPick(waveId: string, locationId: string) {
  await supabase.from('wave_locations')
    .update({ status: 'picked', picked_ts: new Date().toISOString() })
    .eq('wave_id', waveId).eq('location_id', locationId)
    // RLS "operator_update_own_wave_locations" -- kalau ini bukan wave
    // operator ini sendiri, UPDATE affect 0 rows, diam-diam, nggak error.

  const { data: rows } = await supabase
    .from('wave_locations')
    .select('status, visit_order, location_id, orders(product_ref, qty)')
    .eq('wave_id', waveId).order('visit_order')

  const picked = rows?.filter(r => r.status === 'picked').length ?? 0
  const total  = rows?.length ?? 0
  const nextL  = rows?.find(r => r.status === 'pending')

  return {
    status: 'ok', location_id: locationId,
    wave_progress: { picked, total, pct: total ? Math.round((picked / total) * 1000) / 10 : 0 },
    next_location: nextL
      ? { location_id: nextL.location_id, product_ref: nextL.orders?.product_ref, qty: nextL.orders?.qty }
      : null,
  }
}
```

### `POST /api/wave/problem` → UPDATE `wave_locations`
```typescript
async function reportProblem(waveId: string, locationId: string, reason: string) {
  const { error } = await supabase.from('wave_locations')
    .update({ status: 'problem', problem_reason: reason })
    .eq('wave_id', waveId).eq('location_id', locationId)
  return { status: error ? 'error' : 'ok', location_status: 'problem' }
}
```

### `GET /api/shift/summary` → query `waves` + `orders`, filter by date RANGE
```typescript
async function getShiftSummary() {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  // range gte/lt, BUKAN DATE(created_at) = today -- lebih murah (bisa pakai
  // index biasa di created_at) dan ngindarin masalah tipe yang sempat bikin
  // versi backend-nya 500 (lihat api.md).

  const { data: waves } = await supabase.from('waves')
    .select('status, total_items, total_distance')
    .gte('created_at', start.toISOString()).lt('created_at', end.toISOString())
  const { data: orders } = await supabase.from('orders')
    .select('status')
    .gte('created_at', start.toISOString()).lt('created_at', end.toISOString())

  const totalItems = (waves ?? []).reduce((s, w) => s + (w.total_items ?? 0), 0)
  const totalDist  = (waves ?? []).reduce((s, w) => s + (w.total_distance ?? 0), 0)

  return {
    shift_date: start.toISOString().slice(0, 10),
    n_waves: waves?.length ?? 0,
    waves_done: waves?.filter(w => w.status === 'done').length ?? 0,
    waves_active: waves?.filter(w => w.status === 'in_progress').length ?? 0,
    waves_forming: waves?.filter(w => ['forming', 'assigned'].includes(w.status)).length ?? 0,
    total_items: totalItems,
    items_picked: orders?.filter(o => o.status === 'picked').length ?? 0,
    total_distance: Math.round(totalDist * 10) / 10,
    dist_per_item: totalItems ? Math.round((totalDist / totalItems) * 10) / 10 : 0,
  }
}
```

### `generate-orders` → `INSERT` langsung ke `orders` (BUKAN lewat Modal sama sekali)
Beda dari 5 di atas: bukan query baca, ini `INSERT` — dan model ML **TIDAK** dipanggil di sini. `arrival_ts` sengaja di-set 5-20 menit ke depan; order baru diproses (masuk PPO batching agent + assign wave) belakangan oleh `process_due_orders_cron` yang jalan otomatis tiap 10 menit di Modal ([api.md](api.md#arsitektur)). Habis manggil ini, dashboard/app picker **BELUM** langsung keisi — baru muncul setelah cron tick berikutnya (atau panggil `POST /api/dev/process-pending-orders` lewat `callApi()`, poin 5, buat trigger manual pas testing tanpa nunggu).
```typescript
async function generateDummyOrders() {
  const { data: products } = await supabase.from('product_catalog').select('product_ref')
  const { data: locations } = await supabase.from('locations').select('location_id')
  if (!products?.length || !locations?.length) throw new Error('product_catalog / locations kosong')

  const n = 35 + Math.floor(Math.random() * 36)  // 35-70, sama kayak versi lama
  const rows = Array.from({ length: n }, () => {
    const minutesAhead = 5 + Math.random() * 15  // 5-20 menit ke depan
    return {
      order_id: `ORD-GEN-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
      product_ref: products[Math.floor(Math.random() * products.length)].product_ref,
      qty: 1 + Math.floor(Math.random() * 6),
      location_id: locations[Math.floor(Math.random() * locations.length)].location_id,
      arrival_ts: new Date(Date.now() + minutesAhead * 60_000).toISOString(),
      status: 'pending',
    }
  })

  const { error } = await supabase.from('orders').insert(rows)
  // RLS "manager_insert_orders" -- kalau caller BUKAN manager, INSERT ditolak
  // dengan error.code 42501 (beda dari SELECT yang diam-diam kefilter, lihat
  // peringatan di atas).

  return { status: error ? 'error' : 'ok', generated: n, order_ids: rows.map(r => r.order_id), error }
}
```
`product_catalog` diisi sekali oleh admin lewat `seed_product_catalog.py` (bukan tanggung jawab frontend) — kalau kosong berarti belum di-seed, bukan bug di kode ini.

**Cara dipanggil dari UI** — tombol dev/testing di dashboard manager (bukan bagian alur WMS beneran):
```typescript
function GenerateOrdersButton() {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const result = await generateDummyOrders()
    setLoading(false)
    if (result.error) return toast.error(`Gagal generate order: ${result.error.message}`)
    toast.success(`${result.generated} order dibuat — masuk antrian, diproses 5-20 menit lagi.`)
  }

  return <button onClick={handleClick} disabled={loading}>Generate Dummy Orders</button>
}
```
Karena hasilnya baru keliatan di dashboard setelah `process_due_orders_cron` jalan (tiap 10 menit), sandingkan dengan tombol kedua **"Proses Sekarang"** (opsional, dev/testing) yang manggil `POST /api/dev/process-pending-orders` lewat `callApi()` (poin 5) — biar pas demo manager bisa lihat hasilnya instan, nggak perlu nunggu cron tick.

---

## 8. Checklist ringkas
- [ ] `lib/supabase/client.ts`, `lib/supabase/server.ts`, `proxy.ts` + `lib/supabase/proxy.ts` ter-copy dari docs resmi
- [ ] Tombol login Google (manager) + form email/password (operator), dua-duanya
- [ ] `app/auth/callback/route.ts` buat Google
- [ ] Setelah login: baca `users.role`, kalau operator baca `pickers.picker_id` sendiri (poin 4)
- [ ] Cuma `order/new` (bukan urusan frontend), `wave/done`, + `process-pending-orders` (dev/testing doang) yang lewat `NEXT_PUBLIC_API_URL`/`callApi()` — 6 lainnya (poin 7, termasuk `generate-orders`) query/insert Supabase langsung
- [ ] Untuk yang masih ke Modal: `Bearer` dari `getSession().access_token`, handle 401 (→ login ulang) dan 403 (→ pesan "akses ditolak", bukan crash)
- [ ] Untuk yang query Supabase langsung (poin 7): cek `users.role` DULU sebelum manggil buat nentuin UI — RLS filter diam-diam (SELECT), nggak ada 403 buat digantungin. Kecuali `generate-orders` (INSERT) — itu balikin error beneran (`42501`) kalau ditolak RLS
- [ ] `product_catalog` sudah di-seed admin lewat `seed_product_catalog.py` sebelum `generate-orders` dipakai (kalau kosong, dropdown/random product jadi kosong juga)
- [ ] Proteksi halaman pakai `getClaims()`, bukan `getSession()`
- [ ] Realtime (lihat [api.md](api.md#realtime-via-supabase-js-client)) pakai client yang sama, sudah login — bukan client anon terpisah
