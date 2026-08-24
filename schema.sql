-- ============================================================
-- WaveIQ Database Schema — Supabase (PostgreSQL)
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- Jalankan SEKALI saat setup awal
-- ============================================================

-- ============================================================
-- STEP 1: BUAT TABEL
-- ============================================================

-- Locations: dimuat sekali dari Storage_Location.csv
CREATE TABLE IF NOT EXISTS locations (
    location_id TEXT PRIMARY KEY, -- e.g. "I-14-12"
    block TEXT NOT NULL, -- e.g. "I"
    aisle TEXT NOT NULL, -- e.g. "14"
    level INTEGER NOT NULL, -- e.g. 1
    slot TEXT, -- e.g. "2" (slot dalam aisle)
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    z INTEGER NOT NULL DEFAULT 1, -- lantai (1-4)
    nav_node_id TEXT -- titik navigasi terdekat dari Support_Points_Navigation.csv
);

-- Pickers: satu baris per picker/operator
CREATE TABLE IF NOT EXISTS pickers (
    picker_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    -- status: available | busy | break | offline
    current_wave_id TEXT,
    device_token TEXT, -- JWT token device picker
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Waves: satu wave = satu perjalanan picker
CREATE TABLE IF NOT EXISTS waves (
  wave_id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  status          TEXT NOT NULL DEFAULT 'forming',
  -- status: forming | assigned | in_progress | done
  picker_id       INTEGER REFERENCES pickers(picker_id),
  start_ts        TIMESTAMPTZ,
  finish_ts       TIMESTAMPTZ,
  total_items     INTEGER DEFAULT 0,
  total_distance  FLOAT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Orders: satu baris per order-line dari WMS
CREATE TABLE IF NOT EXISTS orders (
    order_id TEXT PRIMARY KEY, -- dari WMS, e.g. "ORD-2024-001234"
    product_ref TEXT NOT NULL, -- kode produk, e.g. "8N10W9"
    qty INTEGER NOT NULL,
    location_id TEXT REFERENCES locations (location_id),
    arrival_ts TIMESTAMPTZ NOT NULL, -- waktu order masuk dari WMS
    status TEXT NOT NULL DEFAULT 'pending',
    -- status: pending | in_wave | picked
    wave_id TEXT REFERENCES waves (wave_id),
    picker_id INTEGER REFERENCES pickers (picker_id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wave locations: satu baris per lokasi yang harus dikunjungi dalam satu wave
-- Ini yang di-watch oleh Supabase Realtime untuk live update dashboard
CREATE TABLE IF NOT EXISTS wave_locations (
    id SERIAL PRIMARY KEY,
    wave_id TEXT NOT NULL REFERENCES waves (wave_id) ON DELETE CASCADE,
    location_id TEXT NOT NULL REFERENCES locations (location_id),
    order_id TEXT REFERENCES orders (order_id),
    visit_order INTEGER NOT NULL DEFAULT 0, -- urutan kunjungan dari routing agent
    status TEXT NOT NULL DEFAULT 'pending',
    -- status: pending | active | picked | problem
    picked_ts TIMESTAMPTZ,
    picker_id INTEGER REFERENCES pickers (picker_id),
    problem_reason TEXT -- diisi kalau status = problem
);

-- Shift log: agregat harian untuk analytics
CREATE TABLE IF NOT EXISTS shift_log (
    id SERIAL PRIMARY KEY,
    shift_date DATE NOT NULL UNIQUE,
    n_waves INTEGER DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    total_distance FLOAT DEFAULT 0,
    n_pickers INTEGER DEFAULT 0,
    makespan_min FLOAT,
    dist_per_item FLOAT,
    fill_rate FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STEP 2: INDEX untuk query yang sering dipakai
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

CREATE INDEX IF NOT EXISTS idx_orders_wave_id ON orders (wave_id);

CREATE INDEX IF NOT EXISTS idx_orders_arrival ON orders (arrival_ts);

CREATE INDEX IF NOT EXISTS idx_waves_status ON waves (status);

CREATE INDEX IF NOT EXISTS idx_waves_picker ON waves (picker_id);

CREATE INDEX IF NOT EXISTS idx_wave_loc_wave ON wave_locations (wave_id);

CREATE INDEX IF NOT EXISTS idx_wave_loc_status ON wave_locations (status);

CREATE INDEX IF NOT EXISTS idx_wave_loc_visit_order ON wave_locations (wave_id, visit_order);

-- ============================================================
-- STEP 3: ENABLE REALTIME
-- Supabase Realtime menggantikan Redis pub/sub.
-- Setiap UPDATE pada tabel ini langsung di-broadcast ke subscriber.
-- ============================================================
ALTER TABLE wave_locations REPLICA IDENTITY FULL;

ALTER TABLE waves REPLICA IDENTITY FULL;

ALTER TABLE orders REPLICA IDENTITY FULL;

ALTER TABLE pickers REPLICA IDENTITY FULL;

-- ============================================================
-- STEP 4: ROW LEVEL SECURITY
-- service_role key (dipakai FastAPI di Modal) bypass semua RLS.
-- anon key (dipakai frontend di Vercel) hanya baca data.
--
-- PENTING: policy "service_all_*" di bawah HARUS scoped "TO service_role".
-- Tanpa "TO", Postgres default-nya "TO public" -- artinya SIAPAPUN (termasuk
-- anon key yang publik di frontend JS) otomatis dapat akses FOR ALL alias
-- INSERT/UPDATE/DELETE bebas, bukan cuma SELECT seperti niat aslinya. Baris
-- "TO service_role" di bawah ini WAJIB ada, jangan dihapus.
-- ============================================================
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

ALTER TABLE pickers ENABLE ROW LEVEL SECURITY;

ALTER TABLE waves ENABLE ROW LEVEL SECURITY;

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE wave_locations ENABLE ROW LEVEL SECURITY;

ALTER TABLE shift_log ENABLE ROW LEVEL SECURITY;

-- Backend (service_role) bisa semua operasi -- scoped ke role service_role
-- SAJA (lihat catatan di atas kenapa "TO" ini wajib). DROP IF EXISTS dulu di
-- tiap policy -- CREATE POLICY (beda dari CREATE TABLE) TIDAK support
-- "IF NOT EXISTS", jadi tanpa DROP ini schema.sql gagal kalau di-run ulang ke
-- project yang sudah pernah kejalan.
DROP POLICY IF EXISTS "service_all_locations" ON locations;
CREATE POLICY "service_all_locations" ON locations FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "service_all_pickers" ON pickers;
CREATE POLICY "service_all_pickers" ON pickers FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "service_all_waves" ON waves;
CREATE POLICY "service_all_waves" ON waves FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "service_all_orders" ON orders;
CREATE POLICY "service_all_orders" ON orders FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "service_all_wave_locations" ON wave_locations;
CREATE POLICY "service_all_wave_locations" ON wave_locations FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "service_all_shift_log" ON shift_log;
CREATE POLICY "service_all_shift_log" ON shift_log FOR ALL TO service_role USING (true);

-- Frontend (anon key) hanya bisa SELECT -- policy ini sendiri di-drop lagi di
-- STEP 6 (diganti authenticated_read_*), tapi tetap di-guard di sini biar
-- STEP 4 doang juga aman di-run ulang sendirian.
DROP POLICY IF EXISTS "anon_read_waves" ON waves;
CREATE POLICY "anon_read_waves" ON waves FOR
SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_read_wave_locations" ON wave_locations;
CREATE POLICY "anon_read_wave_locations" ON wave_locations FOR
SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_read_pickers" ON pickers;
CREATE POLICY "anon_read_pickers" ON pickers FOR
SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon_read_orders" ON orders;
CREATE POLICY "anon_read_orders" ON orders FOR
SELECT TO anon USING (true);

-- ============================================================
-- STEP 5: SEED DATA — 7 picker default (sesuai data operator riil)
-- Ubah nama sesuai nama operator gudang
-- ============================================================
INSERT INTO
    pickers (name, status)
VALUES ('Operator 1', 'available'),
    ('Operator 2', 'available'),
    ('Operator 3', 'available'),
    ('Operator 4', 'available'),
    ('Operator 5', 'available'),
    ('Operator 6', 'available'),
    ('Operator 7', 'available') ON CONFLICT DO NOTHING;

-- ============================================================
-- STEP 6: AUTH — dua role, dua cara login, satu sistem (Supabase Auth)
-- Dua role: "manager" (lihat semua: order, pembagian wave, rute & wave TIAP
-- operator) dan "operator" (cuma lihat rute wave dia sendiri) -- lihat gating-
-- nya di verify_token/get_caller_profile (modal_app.py).
-- Dua provider Supabase Auth, keduanya masuk ke tabel auth.users yang SAMA:
--   - Google OAuth   -- buat manager (setup: google_oauth_setup.md)
--   - Email/Password -- buat operator, akun dummy dibuatin admin (bukan
--                        self-signup), lihat create_dummy_operators.py
-- Supabase Auth sendiri yang kelola akun (tabel auth.users, bawaan Supabase) --
-- kita TIDAK bikin tabel password sendiri, provider mana pun sama-sama lewat
-- situ. Cukup:
--   1. users: data tambahan per akun (role, nama, foto) -- 1 baris per
--      auth.users, auto-terisi lewat trigger di bawah begitu ada baris baru
--      di auth.users (baik dari Google OAuth maupun dari create_dummy_operators.py).
--      Namanya "users" (bukan "profiles") biar keliatan langsung di schema
--      publik -- auth.users sendiri (yang beneran nyimpen password) tetap
--      terpisah/tersembunyi, dikelola Supabase, bukan tabel ini.
--   2. pickers.auth_user_id: penghubung antara data operasional picker
--      (status, current_wave_id, dst — sudah ada dari STEP 1) ke akun
--      Supabase Auth-nya. Nullable, karena baris picker (mis. dari seed di
--      STEP 5) bisa dibuat duluan sebelum akunnya dibuat.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id         UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT 'operator', -- operator | manager (naikkan manual, lihat catatan di bawah -- default paling rendah privilege-nya biar aman)
    full_name  TEXT,
    avatar_url TEXT,
    email      TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pickers
    ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users (id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pickers_auth_user
    ON pickers (auth_user_id)
    WHERE auth_user_id IS NOT NULL;

-- Auto-bikin baris users (public.users, BUKAN auth.users) begitu ada akun baru
-- di auth.users. raw_user_meta_data buat provider Google isinya antara lain
-- full_name/name, avatar_url/picture, email — ambil yang ada.
--
-- Role: raw_app_meta_data->>'provider' (BUKAN raw_user_meta_data -- field ini
-- diisi Supabase sendiri pas signup, bukan dari data yang user kontrol) nunjukin
-- provider yang dipakai. Login Google -> 'manager' otomatis. Provider lain
-- (email/password, dummy operator) -> tetap 'operator' (least-privilege).
--
-- PENTING kalau dipakai: berarti SIAPAPUN yang berhasil login Google otomatis
-- dapat akses manager (lihat semua order/wave/rute semua operator). Ini aman
-- SELAMA Google OAuth consent screen masih "Testing" dengan Test users
-- terbatas (lihat google_oauth_setup.md langkah 1) -- begitu di-Publish jadi
-- akses publik, siapapun dengan akun Google beneran bisa dapat manager access.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := CASE
        WHEN NEW.raw_app_meta_data ->> 'provider' = 'google' THEN 'manager'
        ELSE 'operator'
    END;

    INSERT INTO public.users (id, role, full_name, avatar_url, email)
    VALUES (
        NEW.id,
        v_role,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
        COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture'),
        NEW.email
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Login Google sekarang OTOMATIS dapat role 'manager' (lihat handle_new_user()
-- di atas) -- nggak perlu manual lagi buat itu. Manual promotion di bawah ini
-- masih relevan buat: (a) akun yang login SEBELUM trigger ini di-update, atau
-- (b) mau kasih manager ke akun yang BUKAN dari Google (mis. akun email/password):
--   UPDATE users SET role = 'manager' WHERE email = 'nama@perusahaan.com';
-- Kalau mau TURUNKAN manager Google jadi operator biasa, sebaliknya:
--   UPDATE users SET role = 'operator' WHERE email = 'nama@perusahaan.com';
-- Hubungkan picker yang sudah ada (dari seed STEP 5 atau ditambah manual)
-- ke akun Google/operator mereka setelah login pertama:
--   UPDATE pickers SET auth_user_id = (SELECT id FROM auth.users WHERE email = 'operator1@perusahaan.com')
--   WHERE picker_id = 1;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_users" ON users;
CREATE POLICY "service_all_users" ON users FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "authenticated_read_own_user" ON users;
CREATE POLICY "authenticated_read_own_user" ON users FOR
SELECT TO authenticated USING (auth.uid () = id);

-- Perbaikan buat project yang STEP 4-nya sudah kejalan duluan (sebelum baris
-- "TO service_role" ditambahkan di atas): policy "service_all_*" lama itu
-- TANPA "TO", defaultnya "TO public" -- artinya siapapun (termasuk anon key
-- publik) sebenarnya sudah punya akses INSERT/UPDATE/DELETE bebas selama ini,
-- bukan cuma anon_read_* yang SELECT-only. ALTER di bawah ini nge-scope ulang
-- ke service_role SAJA. Aman dijalankan berkali-kali (idempotent).
ALTER POLICY "service_all_locations" ON locations TO service_role;

ALTER POLICY "service_all_pickers" ON pickers TO service_role;

ALTER POLICY "service_all_waves" ON waves TO service_role;

ALTER POLICY "service_all_orders" ON orders TO service_role;

ALTER POLICY "service_all_wave_locations" ON wave_locations TO service_role;

ALTER POLICY "service_all_shift_log" ON shift_log TO service_role;

-- Sekarang login beneran ada, ketatkan RLS read policy dari STEP 4: dulu pakai
-- role "anon" (siapapun yang pegang public anon key, TANPA login, bisa baca),
-- sekarang wajib "authenticated" (harus login Google dulu). Kalau frontend
-- masih pakai Supabase client yang belum login buat baca/subscribe tabel-tabel
-- ini, itu bakal mulai kena RLS block setelah baris di bawah ini dijalankan.
DROP POLICY IF EXISTS "anon_read_waves" ON waves;
DROP POLICY IF EXISTS "authenticated_read_waves" ON waves;

DROP POLICY IF EXISTS "anon_read_wave_locations" ON wave_locations;
DROP POLICY IF EXISTS "authenticated_read_wave_locations" ON wave_locations;

DROP POLICY IF EXISTS "anon_read_pickers" ON pickers;
DROP POLICY IF EXISTS "authenticated_read_pickers" ON pickers;

DROP POLICY IF EXISTS "anon_read_orders" ON orders;
DROP POLICY IF EXISTS "authenticated_read_orders" ON orders;

CREATE POLICY "authenticated_read_waves" ON waves FOR
SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_wave_locations" ON wave_locations FOR
SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_pickers" ON pickers FOR
SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_read_orders" ON orders FOR
SELECT TO authenticated USING (true);

-- ============================================================
-- STEP 7: RLS row-scoped -- wave/active, picker/next, pick/confirm, wave/
-- problem, shift/summary pindah dari lewat backend FastAPI (authorization-nya
-- di Python: get_caller_profile()) ke query Supabase LANGSUNG dari frontend,
-- buat ngehindarin latency Modal buat endpoint yang nggak butuh model ML sama
-- sekali. Tanpa ini, blanket "authenticated_read_*" di atas artinya SEMUA
-- operator bisa lihat wave/rute operator LAIN langsung lewat Supabase,
-- walaupun FastAPI-nya sendiri sudah nge-block itu -- backend Python TIDAK
-- lagi jadi satu-satunya penjaga begitu frontend query Supabase langsung.
--
-- PENTING -- dicek dulu sebelum nulis policy ini: wave_locations.picker_id
-- dan orders.picker_id ADA di schema tapi TIDAK PERNAH diisi kode manapun
-- (_close_wave, assign_wave_to_picker, pick_confirm semua nggak nyentuh
-- kolom itu) -- cuma waves.picker_id yang reliable (diisi
-- assign_wave_to_picker). Makanya policy di bawah scope-nya lewat JOIN ke
-- waves, BUKAN lewat wave_locations.picker_id/orders.picker_id langsung --
-- kalau dipakai langsung, operator nggak akan pernah bisa baca wave_locations/
-- orders mereka sendiri sama sekali (selalu NULL != picker_id).
-- ============================================================

-- Helper, dipakai di banyak policy di bawah -- SECURITY DEFINER + search_path
-- eksplisit (pola standar Supabase buat helper RLS, biar nggak kena masalah
-- RLS-di-dalam-RLS pas dipanggil dari policy tabel lain).
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'manager');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION my_picker_id()
RETURNS INTEGER AS $$
    SELECT picker_id FROM public.pickers WHERE auth_user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- waves.picker_id reliable -- langsung dipakai. DROP dua nama -- nama lama
-- (authenticated_read_waves, buat project yang belum kejalan STEP 7 ini) DAN
-- nama baru sendiri (buat re-run STEP 7 ini berkali-kali, CREATE POLICY nggak
-- support IF NOT EXISTS).
DROP POLICY IF EXISTS "authenticated_read_waves" ON waves;
DROP POLICY IF EXISTS "read_own_or_manager_waves" ON waves;
CREATE POLICY "read_own_or_manager_waves" ON waves FOR
SELECT TO authenticated USING (is_manager() OR picker_id = my_picker_id());

-- wave_locations & orders: scope lewat waves.picker_id (JOIN), BUKAN kolom
-- picker_id di tabel ini sendiri (lihat catatan di atas kenapa).
DROP POLICY IF EXISTS "authenticated_read_wave_locations" ON wave_locations;
DROP POLICY IF EXISTS "read_own_or_manager_wave_locations" ON wave_locations;
CREATE POLICY "read_own_or_manager_wave_locations" ON wave_locations FOR
SELECT TO authenticated USING (
    is_manager() OR wave_id IN (SELECT wave_id FROM waves WHERE picker_id = my_picker_id())
);

DROP POLICY IF EXISTS "authenticated_read_orders" ON orders;
DROP POLICY IF EXISTS "read_own_or_manager_orders" ON orders;
CREATE POLICY "read_own_or_manager_orders" ON orders FOR
SELECT TO authenticated USING (
    is_manager() OR wave_id IN (SELECT wave_id FROM waves WHERE picker_id = my_picker_id())
);

-- Tulis buat pick/confirm & wave/problem (update status/picked_ts/problem_reason).
-- Row-level doang -- operator pemilik wave ini SECARA TEKNIS bisa update kolom
-- APAPUN di baris ini (termasuk visit_order/wave_id/dst), bukan cuma status.
-- Pembatasan per-kolom butuh column-level GRANT (mekanisme Postgres terpisah
-- dari RLS), belum dikerjakan -- row-level ini nutup celah UTAMA (operator
-- ubah wave operator LAIN), bukan proteksi lengkap dari operator ubah kolom
-- yang harusnya cuma-baca buat dia sendiri.
DROP POLICY IF EXISTS "operator_update_own_wave_locations" ON wave_locations;
CREATE POLICY "operator_update_own_wave_locations" ON wave_locations FOR UPDATE
TO authenticated
USING (is_manager() OR wave_id IN (SELECT wave_id FROM waves WHERE picker_id = my_picker_id()))
WITH CHECK (is_manager() OR wave_id IN (SELECT wave_id FROM waves WHERE picker_id = my_picker_id()));

-- ============================================================
-- STEP 8: "generate orders" jadi INSERT langsung dari frontend (Opsi B) --
-- manager generate order dummy buat testing TANPA lewat Modal (cuma INSERT,
-- nggak ada model ML di langkah ini -- lihat api.md kenapa dipisah dari
-- proses batching-nya). Order yang di-generate dikasih arrival_ts BEBERAPA
-- MENIT KE DEPAN (bukan sekarang) -- scheduled function di Modal
-- (process_due_orders_cron, lihat modal_app.py) yang secara periodik nyariin
-- order yang arrival_ts-nya udah lewat dan masukin ke batching agent.
-- ============================================================

-- product_catalog: daftar product_ref yang BENERAN ada embedding-nya di
-- prod_emb.pkl (198 produk) -- frontend butuh ini buat generate order dummy
-- yang realistis (product_ref asal-asalan = fallback ke zero-vector di
-- batching agent, bukan actually exercise GNN embedding-nya). Diisi SEKALI
-- lewat seed_product_catalog.py (bukan manual), lihat file itu.
CREATE TABLE IF NOT EXISTS product_catalog (
    product_ref TEXT PRIMARY KEY
);

ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all_product_catalog" ON product_catalog;
CREATE POLICY "service_all_product_catalog" ON product_catalog FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "authenticated_read_product_catalog" ON product_catalog;
CREATE POLICY "authenticated_read_product_catalog" ON product_catalog FOR
SELECT TO authenticated USING (true);

-- Manager boleh INSERT order baru langsung (generate-orders dummy). Bukan
-- UPDATE/DELETE -- itu tetap cuma service_role (lewat batching agent di Modal).
DROP POLICY IF EXISTS "manager_insert_orders" ON orders;
CREATE POLICY "manager_insert_orders" ON orders FOR INSERT
TO authenticated WITH CHECK (is_manager());

-- Index buat query scheduled function: "cari order pending yang arrival_ts-nya
-- udah lewat" -- tanpa ini, tiap tick cron bakal full table scan orders.
CREATE INDEX IF NOT EXISTS idx_orders_due
    ON orders (arrival_ts)
    WHERE status = 'pending' AND wave_id IS NULL;

-- ============================================================
-- VERIFIKASI: jalankan query ini setelah schema selesai
-- ============================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
-- Harus muncul: locations, orders, pickers, product_catalog, shift_log, users, wave_locations, waves