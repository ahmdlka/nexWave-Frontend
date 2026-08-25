# Brief: Instant Wave-Close (operator page)

## Masalah
`finishWave()` sekarang manggil `POST /api/wave/done` (Modal) yang ngerjain 2 hal SEKALIGUS dalam satu request: (1) nutup wave + bebasin picker, (2) cari & assign wave berikutnya (butuh Attention Routing model). Operator nunggu SELURUH proses ini (termasuk cold start Modal kalau container lagi nggak warm) sebelum lihat konfirmasi apapun — padahal langkah (1) itu SQL doang, harusnya instan.

## Solusi: 2 fase
1. **Fase 1 — instant**: `supabase.rpc('close_own_wave', ...)` langsung ke Supabase. Nutup wave + bebasin picker. Operator langsung lihat "Wave selesai!" begitu ini resolve — biasanya < 200ms, gak nunggu Modal sama sekali.
2. **Fase 2 — tetap Modal**: `POST /api/wave/done` (endpoint SAMA, TIDAK diubah) buat cari wave forming berikutnya + hitung rute (Attention Routing). Ini yang butuh loading state, karena tetap bisa kena cold start Modal.

`POST /api/wave/done` aman dipanggil SETELAH fase 1 — dia re-set `status='done'`/`finish_ts` yang sama persis (idempotent, bukan re-close yang beda), jadi nggak ada resiko double-processing.

## Backend — sudah selesai, gak perlu App diubah
`close_own_wave(p_wave_id TEXT)` — fungsi Postgres baru (`schema.sql` STEP 9), `SECURITY DEFINER`, di-scope KETAT: cuma bisa nutup wave milik picker yang manggil (atau manager, buat siapapun). Bukan UPDATE bebas — operator nggak bisa reassign `picker_id` atau ubah `total_distance` lewat jalur ini. Tested (4 skenario: sukses milik sendiri, ditolak punya orang lain, manager override, wave_id nggak valid) — semua sesuai ekspektasi.

## 1. `lib/supabase-queries.ts` — tambahan fungsi baru
```typescript
// ── Operator: fase 1 dari wave/done -- instant, Supabase langsung ─────────
export async function closeOwnWave(waveId: string) {
  const { error } = await supabase.rpc('close_own_wave', { p_wave_id: waveId });
  if (error) throw new Error(`Gagal menutup wave: ${error.message}`);
}
```

## 2. `app/operator/page.tsx`

### 2.1 Import
```diff
  import { getPickerRoute, confirmPickDirect, reportProblemDirect } from '@/lib/supabase-queries';
+ import { closeOwnWave } from '@/lib/supabase-queries';
```
(atau digabung satu baris dengan import yang sudah ada dari migrasi sebelumnya)

### 2.2 State baru — fase "assigning" (dipakai buat UI fase 2)
```diff
  const [submitting, setSubmitting] = useState(false);
+ const [assigningNext, setAssigningNext] = useState(false);
```

### 2.3 `finishWave()`
```diff
  async function finishWave() {
-   if (!wave || !canFinish) return;
-   await submit('/api/wave/done', { wave_id: wave.wave_id });
+   if (!wave || !canFinish || !pickerId) return;
+   setSubmitting(true);
+   setError(null);
+   try {
+     await closeOwnWave(wave.wave_id);          // fase 1: instant
+     setAssigningNext(true);                     // fase 2 mulai: UI ganti ke "mencari wave berikutnya"
+     await submit('/api/wave/done', { wave_id: wave.wave_id });  // fase 2: tetap Modal, endpoint sama
+   } catch (cause) {
+     setError(cause instanceof Error ? cause.message : 'Aksi tidak dapat diproses.');
+   } finally {
+     setSubmitting(false);
+     setAssigningNext(false);
+   }
  }
```
Catatan: `submit()` sendiri TIDAK berubah — masih generic POST-to-Modal helper yang sudah ada, dan masih manggil `loadWave(pickerId)` di akhir buat refresh (wave berikutnya, kalau ada, langsung muncul).

### 2.4 Tombol "Selesaikan wave" — teks berubah sesuai fase
```diff
- <Button variant="outlined" disabled={!canFinish || submitting} onClick={finishWave}>Selesaikan wave</Button>
+ <Button variant="outlined" disabled={!canFinish || submitting} onClick={finishWave}>
+   {assigningNext ? 'Mencari wave berikutnya…' : 'Selesaikan wave'}
+ </Button>
```

## Testing
- [ ] Klik "Selesaikan wave" — tombol berubah teks ke "Mencari wave berikutnya…" HAMPIR SEKETIKA (bukan nunggu response Modal dulu)
- [ ] Wave lama beneran `status='done'` di DB meskipun fase 2 lagi jalan/lambat
- [ ] Wave berikutnya (kalau ada) muncul setelah fase 2 selesai, sama seperti sebelumnya
- [ ] Coba wave_id yang bukan milik picker (mis. edit state manual di devtools) — RPC harus reject, bukan diam-diam sukses
- [ ] Kalau fase 1 sukses tapi fase 2 gagal (mis. Modal timeout) — wave tetap `done`, picker tetap `available`, cuma belum dapat wave baru — operator bisa refresh manual buat retry fase 2 (dari `GET /api/picker/{id}/next`, yang sekarang query langsung ke Supabase, bakal balikin `no_wave` sampai fase 2 beneran jalan)
