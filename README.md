# nexWAVE — Frontend

nexWAVE adalah antarmuka berbasis web yang dirancang untuk kontrol operasional *warehouse*. Aplikasi ini menggabungkan fitur *order batching* (pengelompokan pesanan berdasarkan kedekatan lokasi barang) dan *picker routing* (penentuan rute pengambilan barang paling efisien menggunakan algoritma A*) dalam satu dashboard yang terintegrasi.

## Peran Pengguna

* **Manager**: Memantau *wave* (batch order) yang sedang aktif atau telah selesai, melihat ringkasan *shift*, serta memantau progres *picker* secara *real-time* melalui peta interaktif.
* **Operator / Picker**: Menjalankan rute pengambilan barang (*picking*) langkah demi langkah di atas peta gudang interaktif, lengkap dengan *checklist* dan animasi rute.

---

## Ringkasan Arsitektur & Teknologi

| Komponen | Teknologi / Detail |
| --- | --- |
| **Framework** | Next.js 16 (App Router + Turbopack), React 19, TypeScript |
| **Styling & UI** | Tailwind CSS v4, Material UI (MUI) v9 |
| **Autentikasi & Database** | Supabase — Auth untuk manajemen pengguna, PostgreSQL untuk penyimpanan data *wave*, *order*, lokasi, dan *picker* |
| **Backend API Eksternal** | Digunakan secara terpisah untuk eksekusi tindakan khusus (proses *order* tertunda dan penutupan *wave*) melalui `NEXT_PUBLIC_API_BASE_URL` |

### Alur Halaman

* `/` — *Landing page* publik. Pengguna yang sudah berhasil masuk (*authenticated*) akan otomatis diarahkan ke `/manager` atau `/operator` berdasarkan *role* pengguna di database.
* `/login` — Otentikasi menggunakan *email/password* atau Google OAuth (Supabase Auth) dengan Callback handler pada `/auth/callback`.
* `/manager` — Dasbor manajer yang menampilkan daftar *wave*, ringkasan *shift*, dan peta rute (`components/MapViewer.tsx`).
* `/operator` — Dasbor operator untuk eksekusi *checklist pick* interaktif dengan animasi rute A* di atas peta gudang berbasis SVG (`data/master_map_data.json`).

> **Catatan Penting**: Aplikasi ini bergantung pada skema tabel Supabase (`users`, `pickers`, `waves`, `wave_locations`, `orders`, `locations`). Proyek frontend ini membutuhkan konfigurasi basis data Supabase yang sesuai agar fungsi otentikasi dan data dapat berjalan dengan normal.

---

## Prasyarat Sistem

Sebelum memulai, pastikan perangkat Anda memenuhi persyaratan lingkungan pengembangan berikut:

1. **Node.js ≥ 20.9**: Wajib digunakan karena merupakan batas minimum Next.js 16. Versi Node.js di bawah 20.9 akan menyebabkan kegagalan instalasi dengan pesan kesalahan `EBADENGINE`.
```bash
node -v

```


*(Gunakan Node Version Manager (`nvm`) jika Anda perlu memperbarui atau berpindah versi Node.js).*
2. **npm**: Disarankan menggunakan `npm` (bukan `yarn` atau `pnpm`) agar penanganan *dependency* sesuai dengan file `package-lock.json`.
3. **Git**: Untuk manajemen repositori.
4. **Proyek Supabase**: Proyek aktif di Supabase (membutuhkan *URL* dan *Anon Key*).
5. **Backend API nexWAVE (Opsional)**: Diperlukan jika ingin menjalankan fitur "Process pending orders" dan "Close wave".

---

## Panduan Instalasi & Pengoperasian

### 1. Clone Repositori

```bash
git clone https://github.com/ahmdlka/nexWave-Frontend.git
cd nexWave-Frontend

```

### 2. Instal Dependency

Jalankan perintah berikut untuk menginstal seluruh *dependency* yang dibutuhkan proyek:

```bash
npm install

```

### 3. Konfigurasi Environment Variables

Proyek ini menyediakan file `.env.example` sebagai templat konfigurasi. Salin file tersebut menjadi `.env.local`:

```bash
cp .env.example .env.local

```

Buka file `.env.local` dan lengkapi nilai variabel berikut sesuai dengan konfigurasi Anda:

| Variabel | Status | Sumber | Kegunaan |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Wajib | Supabase Dashboard → Project Settings → API → Project URL | Koneksi Auth dan Database Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Wajib | Supabase Dashboard → Project Settings → API → Anon Public Key | Identifikasi otorisasi client Supabase |
| `NEXT_PUBLIC_API_BASE_URL` | Rekomendasi | URL server Backend nexWAVE yang sedang berjalan | Endpoint untuk memproses *pending orders* & *close wave* |

> **Perhatian**: Jika file `.env.local` tidak diisi, *development server* dapat tetap berjalan, tetapi aplikasi akan mengalami *runtime error* `Error: supabaseUrl is required` saat dibuka di peramban. Setiap perubahan pada `.env.local` memerlukan pemulaian ulang (*restart*) *development server*.

### 4. Jalankan Development Server

Jalankan perintah berikut untuk memulai server dalam mode pengembangan:

```bash
npm run dev

```

Jika berhasil, keluaran pada terminal akan menampilkan informasi seperti berikut:

```text
Next.js 16.3.2 (Turbopack)
- Local:        http://localhost:3000

Ready in ...ms

```

Akses aplikasi melalui peramban di alamat `http://localhost:3000`.

### 5. Verifikasi & Pengujian

* **Build Production**:
```bash
npm run build
npm run start

```


* **Linting Kode**:
```bash
npm run lint

```


* **Unit Testing**:
```bash
npm run test

```



---

## Troubleshooting

* **Error: `supabaseUrl is required.**`
File `.env.local` belum dibuat, penamaan variabel tidak sesuai, atau server belum di-*restart* setelah mengubah file konfigurasi environment.
* **npm error `EBADENGINE` saat running `npm install**`
Versi Node.js yang digunakan kurang dari 20.9. Perbarui versi Node.js Anda terlebih dahulu.
* **Peringatan Fetch Google Font (`Failed to fetch Plus Jakarta Sans...`)**
Terjadi akibat keterbatasan koneksi internet saat proses kompilasi pertama kali. Peringatan ini tidak menggagalkan proses *build* atau pengoperasian aplikasi karena Next.js akan menggunakan *fallback font* sistem secara otomatis.
* **Port 3000 sedang digunakan**
Jalankan aplikasi di port alternatif dengan perintah:
```bash
npm run dev -- -p 3001

```


* **Login berhasil namun terarah kembali ke halaman utama / Data Kosong**
Pengguna belum terdaftar dalam tabel `users` di Supabase dengan *role* `manager` atau `operator`, atau tabel terkait (`waves`, `orders`, `locations`, `pickers`) belum terisi data.
* **Gagal saat menekan tombol "Tutup Wave" atau "Process Pending Orders"**
Server backend eksternal yang dikonfigurasikan pada `NEXT_PUBLIC_API_BASE_URL` tidak aktif atau URL tidak valid.

---

## Struktur Proyek

```text
app/                          # Routing berbasis Next.js App Router
  page.tsx                    # Landing page publik
  login/                      # Halaman otentikasi
  auth/callback/               # Handler callback OAuth Supabase
  manager/                     # Dasbor operasional Manager
  operator/                    # Dasbor operasional Operator/Picker
components/
  MapViewer.tsx                # Visualisasi peta gudang interaktif (SVG)
  MaterialThemeProvider.tsx    # Konfigurasi integrasi tema MUI & Tailwind
lib/
  supabase.ts                  # Inisialisasi client Supabase
  supabase-queries.ts          # Abstraksi query & mutasi data Supabase
  api.ts                       # Utility HTTP request ke backend eksternal
  astar.ts                     # Implementasi algoritma pathfinding A*
  route-legs.ts                # Helper pemecah rute menjadi segmen-segmen
  map-viewport.ts              # Utilitas viewport & pemetaan koordinat peta
  operator-checklist.ts        # Logika manajemen checklist operator
data/
  master_map_data.json         # Data node, koridor, dan koordinat peta gudang
  dummy_waves.json             # Data simulasi untuk pengujian lokal
public/maps/                   # Aset grafis peta gudang (SVG)

```