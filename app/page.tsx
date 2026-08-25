'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Container, Typography } from '@mui/material';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import RouteIcon from '@mui/icons-material/Route';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import { supabase } from '@/lib/supabase';

type AuthState = 'checking' | 'guest';

const featureCards = [
  {
    icon: <RouteIcon sx={{ fontSize: 22 }} />,
    title: 'Picker routing yang efisien',
    body: 'NexWave menghitung rute pengambilan paling efisien untuk setiap wave agar picker tidak lagi menempuh perjalanan yang sia-sia.',
  },
  {
    icon: <InsightsOutlinedIcon sx={{ fontSize: 22 }} />,
    title: 'Order batching berbasis lokasi',
    body: 'Order dikelompokkan berdasarkan kedekatan lokasi barangnya, bukan semata berdasarkan urutan kedatangan.',
  },
  {
    icon: <VerifiedOutlinedIcon sx={{ fontSize: 22 }} />,
    title: 'Adaptif saat order terus masuk',
    body: 'Keputusan batching dan routing tetap terhubung, bahkan ketika order baru terus masuk selagi proses picking berlangsung.',
  },
];

const roleCards = [
  {
    eyebrow: 'Untuk manager',
    title: 'Rekomendasi wave dan rute yang lebih baik.',
    body: 'Supervisor memperoleh rekomendasi wave dan rute yang lebih baik dibandingkan aturan statis, dengan visibilitas progres operasional.',
    icon: <ManageAccountsOutlinedIcon sx={{ fontSize: 24 }} />,
  },
  {
    eyebrow: 'Untuk operator',
    title: 'Tempuh perjalanan yang lebih singkat.',
    body: 'Picker mengikuti rute pengambilan yang lebih efisien dan tidak lagi berjalan dari satu ujung gudang ke ujung yang lain tanpa perlu.',
    icon: <LocalShippingOutlinedIcon sx={{ fontSize: 24 }} />,
  },
];

const journeySteps = [
  'Order masuk dan dikelompokkan berdasarkan kedekatan lokasi barang.',
  'NexWave menghitung rute pengambilan paling efisien untuk setiap wave.',
  'Picker menjalankan rute, sementara supervisor memantau rekomendasi dan progresnya.',
];

export default function HomePage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>('checking');

  useEffect(() => {
    async function routeUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setAuthState('guest');
        return;
      }

      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile?.role === 'manager') {
        router.replace('/manager');
        return;
      }
      if (profile?.role === 'operator') {
        router.replace('/operator');
        return;
      }

      setAuthState('guest');
    }

    void routeUser();
  }, [router]);

  if (authState === 'checking') {
    return <Box sx={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', bgcolor: '#0a1a4b' }}><CircularProgress sx={{ color: 'white' }} /></Box>;
  }

  return (
    <main className="min-h-[100dvh] bg-[#0a1a4b] text-white">
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(0,86,214,0.34),_transparent_34%),radial-gradient(circle_at_88%_18%,_rgba(255,102,0,0.20),_transparent_24%),linear-gradient(180deg,_#0a1a4b_0%,_#061238_100%)]" />
        <div className="absolute right-[-8rem] top-12 h-64 w-64 rounded-full bg-[#0056d6]/20 blur-3xl sm:h-80 sm:w-80" />
        <div className="absolute bottom-[-6rem] left-[-3rem] h-52 w-52 rounded-full bg-[#ff6600]/10 blur-3xl sm:h-72 sm:w-72" />
        <Container maxWidth="lg" sx={{ position: 'relative', px: { xs: 2, sm: 3 }, pt: { xs: 3, md: 4 }, pb: { xs: 8, md: 12 } }}>
          <header className="flex items-center justify-between gap-4 rounded-2xl border border-white/12 bg-white/6 px-4 py-3 backdrop-blur-sm">
            <Image src="/logo-nexwave.svg" alt="nexWAVE" width={172} height={42} priority />
            <Button
              variant="outlined"
              onClick={() => router.push('/login')}
              sx={{
                borderColor: 'rgba(255,255,255,0.28)',
                color: '#fff',
                px: 2,
                '&:hover': { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.06)' },
              }}
            >
              Masuk
            </Button>
          </header>

          <div className="grid gap-8 pt-10 md:pt-14 lg:grid-cols-[minmax(0,1.05fr)_460px] lg:items-center lg:gap-10">
            <div className="max-w-[640px]">
              <Chip
                label="Warehouse Operations Control"
                sx={{
                  mb: 3,
                  borderRadius: '999px',
                  border: '1px solid rgba(255,255,255,0.16)',
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  color: '#fff',
                  fontWeight: 700,
                  letterSpacing: '.04em',
                }}
              />
              <Typography sx={{ fontSize: { xs: '2.8rem', md: '4.5rem' }, lineHeight: { xs: 1.02, md: 0.98 }, letterSpacing: '-0.05em', fontWeight: 800, maxWidth: '11ch' }}>
                Proses picking yang lebih cerdas.
              </Typography>
              <Typography sx={{ mt: 3, maxWidth: '34rem', color: 'rgba(255,255,255,0.74)', fontSize: { xs: '1rem', md: '1.08rem' }, lineHeight: 1.8 }}>
                NexWave menyatukan order batching dan picker routing untuk menekan perjalanan yang tidak perlu, tanpa menambah jumlah picker.
              </Typography>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  variant="contained"
                  endIcon={<NorthEastIcon />}
                  onClick={() => router.push('/login')}
                  sx={{
                    bgcolor: '#ff6600',
                    px: 3,
                    py: 1.4,
                    boxShadow: '0 18px 50px rgba(255,102,0,0.26)',
                    '&:hover': { bgcolor: '#e35a00' },
                  }}
                >
                  Buka Operations Control
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  sx={{
                    borderColor: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    px: 3,
                    py: 1.4,
                    '&:hover': { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.05)' },
                  }}
                >
                  Lihat overview
                </Button>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  ['Biaya order picking', 'Hingga 55%'],
                  ['Waktu untuk berjalan', 'Separuh proses'],
                  ['Keputusan yang disatukan', 'Batching + routing'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/12 bg-white/6 px-4 py-4 backdrop-blur-sm">
                    <p className="text-2xl font-semibold tracking-tight">{value}</p>
                    <p className="mt-1 text-sm text-white/62">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-3 rounded-[2rem] bg-white/8 blur-2xl" />
              <div className="relative overflow-hidden rounded-[2rem] border border-white/12 bg-[#f4f6fa] p-4 text-[#202938] shadow-[0_30px_80px_rgba(4,12,38,0.45)] sm:p-5">
                <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-[0_14px_30px_rgba(6,18,56,0.08)]">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0056d6]">Wave aktif</p>
                    <p className="mt-1 text-lg font-semibold">NW-08 / Zone B</p>
                  </div>
                  <div className="rounded-full bg-[#eaf2ff] px-3 py-1 text-xs font-bold text-[#0056d6]">
                    12 lokasi
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-[1.4rem] bg-[#0a1a4b] p-4 text-white">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Route preview</p>
                      <span className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/72">
                        Live map
                      </span>
                    </div>
                    <div className="mt-4 rounded-[1.2rem] border border-white/8 bg-[#061238] p-3">
                      <Image
                        src="/maps/Jalur_map.svg"
                        alt="Preview jalur warehouse"
                        width={820}
                        height={560}
                        className="h-auto w-full rounded-xl opacity-92"
                      />
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-sm text-white/72">
                      <HubOutlinedIcon sx={{ fontSize: 18, color: '#ff6600' }} />
                      Jalur disusun untuk meminimalkan perpindahan yang tidak perlu.
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[1.4rem] bg-white p-4 shadow-[0_14px_30px_rgba(6,18,56,0.08)]">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#687386]">Item aktif</p>
                      <p className="mt-2 text-lg font-semibold">A-12 · REF-204</p>
                      <p className="mt-1 text-sm text-[#687386]">2 unit · Level 3</p>
                      <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#f4f6fa] px-3 py-2">
                        <span className="text-sm font-medium">Konfirmasi pick</span>
                        <span className="rounded-full bg-[#ff6600] px-2.5 py-1 text-[11px] font-bold text-white">1 klik</span>
                      </div>
                    </div>
                    <div className="rounded-[1.4rem] border border-[#d8dee8] bg-[#edf3ff] p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0056d6]">Manager overview</p>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        {[
                          ['Wave aktif', '08'],
                          ['Item dipick', '142'],
                          ['Antrian order', '16'],
                          ['Wave selesai', '11'],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-2xl bg-white px-3 py-3">
                            <p className="text-lg font-semibold">{value}</p>
                            <p className="mt-1 text-xs text-[#687386]">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section id="overview" className="bg-[#f4f6fa] text-[#202938]">
        <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3 }, py: { xs: 8, md: 10 } }}>
          <div className="grid gap-5 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
            <div className="max-w-[30rem]">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0056d6]">Masalah di warehouse</p>
              <Typography sx={{ mt: 1.5, fontSize: { xs: '2rem', md: '2.85rem' }, lineHeight: 1.03, letterSpacing: '-0.04em', fontWeight: 800 }}>
                Setiap hari, warehouse membayar mahal untuk berjalan.
              </Typography>
            </div>
            <Typography sx={{ maxWidth: '40rem', justifySelf: 'end', color: '#687386', fontSize: '1rem', lineHeight: 1.85 }}>
              Proses order picking dapat menyerap hingga 55% dari total biaya operasional, dan separuh waktunya habis hanya untuk berjalan. Akar masalahnya: order diproses berdasarkan urutan kedatangan, bukan berdasarkan kedekatan lokasi barangnya.
            </Typography>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {featureCards.map((feature) => (
              <div key={feature.title} className="rounded-[1.5rem] border border-[#d8dee8] bg-white p-5 shadow-[0_18px_50px_rgba(10,26,75,0.06)]">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eaf2ff] text-[#0056d6]">
                  {feature.icon}
                </div>
                <h3 className="mt-4 text-xl font-semibold tracking-tight">{feature.title}</h3>
                <p className="mt-2 text-sm leading-7 text-[#687386]">{feature.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-white text-[#202938]">
        <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3 }, py: { xs: 8, md: 10 } }}>
          <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="rounded-[1.75rem] bg-[#0a1a4b] p-6 text-white md:p-7">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">Solusi NexWave</p>
              <Typography sx={{ mt: 1.5, fontSize: { xs: '2rem', md: '2.6rem' }, lineHeight: 1.04, letterSpacing: '-0.04em', fontWeight: 800, maxWidth: '10ch' }}>
                Dua keputusan, satu proses picking yang lebih optimal.
              </Typography>
              <div className="mt-6 space-y-4">
                {journeySteps.map((step, index) => (
                  <div key={step} className="flex items-start gap-4 rounded-[1.4rem] border border-white/10 bg-white/6 px-4 py-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ff6600] text-sm font-bold text-white">
                      0{index + 1}
                    </div>
                    <p className="text-sm leading-7 text-white/78">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {roleCards.map((card) => (
                <div key={card.title} className="rounded-[1.75rem] border border-[#d8dee8] bg-[#f4f6fa] p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#0056d6] shadow-[0_10px_25px_rgba(10,26,75,0.08)]">
                    {card.icon}
                  </div>
                  <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#0056d6]">{card.eyebrow}</p>
                  <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">{card.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#687386]">{card.body}</p>
                </div>
              ))}

              <div className="rounded-[1.75rem] border border-[#d8dee8] bg-white p-6 md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="max-w-[34rem]">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0056d6]">Action utama</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight">Warehouse tidak perlu menambah picker untuk menambah kapasitas.</h3>
                    <p className="mt-2 text-sm leading-7 text-[#687386]">
                      Mereka hanya perlu proses picking yang lebih cerdas. Inilah NexWave.
                    </p>
                  </div>
                  <Button
                    variant="contained"
                    endIcon={<NorthEastIcon />}
                    onClick={() => router.push('/login')}
                    sx={{
                      bgcolor: '#0056d6',
                      px: 3,
                      py: 1.35,
                      whiteSpace: 'nowrap',
                      '&:hover': { bgcolor: '#0046b1' },
                    }}
                  >
                    Masuk ke aplikasi
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </main>
  );
}
