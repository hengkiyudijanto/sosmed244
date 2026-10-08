'use client';

/**
 * Navigasi utama — diukur dari situs rujukan (thisisfc88.com), bukan ditebak:
 *
 *   rel samping  : HIJAU TERANG rgb(0,207,120) (di situsnya `.side` selebar 293px)
 *   teks menu    : hijau gelap rgb(0,85,75) — di atas mint/hijau terang JANGAN
 *                  pernah pakai teks mint, teksnya hilang
 *   huruf menu   : Schabo Condensed 30px (47px di situsnya; 47px terlalu besar
 *                  untuk 7 menu aplikasi lintas peran), huruf besar semua
 *   baris menu   : tinggi 70px, padding 14px atas-bawah, ikon di kanan
 *   kepala rel   : hitam (#181818) — TIDAK ikut hijau, seperti bilah logo di situsnya
 *   kaki rel     : identitas pengguna + keluar, teks hijau gelap
 *
 * Perilaku:
 *  - Desktop: bisa diciutkan (16rem -> 4.5rem) dan pilihannya DIINGAT lewat
 *    localStorage.
 *  - Layar < lg: sidebar jadi laci (drawer), ditutup dengan Esc, klik latar,
 *    atau setelah memilih menu.
 *  - Ikonnya SVG kecil yang ditulis sendiri — tidak menambah paket dependensi.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LogoBTN } from '@/components/logo-btn';

export type ItemMenu = { href: string; label: string; ikon?: string };

/** Penanda tautan aktif: '/' hanya cocok untuk halaman persis root. */
function aktifSekarang(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Ikon garis sederhana (stroke 1.6, kotak 24). Dipilih daripada memuat paket
 * ikon: hanya tujuh ikon yang dipakai, dan setiap paket ikon menambah ±40 kB.
 */
function Ikon({ nama, className = 'h-[18px] w-[18px]' }: { nama?: string; className?: string }) {
  const umum = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (nama) {
    case 'dasbor':
      return (
        <svg {...umum}>
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      );
    case 'konten':
      return (
        <svg {...umum}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18" />
          <path d="M8 4v5" />
          <path d="M7 14h7" />
        </svg>
      );
    case 'baru':
      return (
        <svg {...umum}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8.5v7M8.5 12h7" />
        </svg>
      );
    case 'persetujuan':
      return (
        <svg {...umum}>
          <path d="M9 11.5l2 2 4-4" />
          <path d="M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" />
        </svg>
      );
    case 'audit':
      return (
        <svg {...umum}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
          <path d="M11 8.5v5M8.5 11h5" />
        </svg>
      );
    case 'pengguna':
      return (
        <svg {...umum}>
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
        </svg>
      );
    case 'pengaturan':
      return (
        <svg {...umum}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.2M17.6 15.3l2.2 1.2M4.2 16.5l2.2-1.2M17.6 8.7l2.2-1.2" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...umum}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case 'ciut':
      return (
        <svg {...umum}>
          <path d="M15 6l-6 6 6 6" />
          <path d="M20 4v16" />
        </svg>
      );
    case 'buka':
      return (
        <svg {...umum}>
          <path d="M9 6l6 6-6 6" />
          <path d="M20 4v16" />
        </svg>
      );
    case 'tutup':
      return (
        <svg {...umum}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case 'keluar':
      return (
        <svg {...umum}>
          <path d="M15 4h3a1 1 0 011 1v14a1 1 0 01-1 1h-3" />
          <path d="M10 8l-4 4 4 4" />
          <path d="M6 12h9" />
        </svg>
      );
    default:
      return (
        <svg {...umum}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

/** Kunci localStorage untuk mengingat pilihan ciut/buka. */
const KUNCI_CIUT = 'sosmed244.sidebar.ciut';

/**
 * Kelas rel sidebar: panel arang tema FC88. Dipakai bersama oleh sidebar tetap
 * dan laci supaya keduanya pasti seragam.
 */
const REL_SIDEBAR = 'bg-aksen';

export function Sidebar({
  menu,
  namaPengguna,
  labelPeran,
  brandKode,
  aksiKeluar,
}: {
  menu: ItemMenu[];
  namaPengguna: string;
  labelPeran: string;
  brandKode?: string | null;
  /** server action keluar — dikirim dari server component, bukan diimpor di klien */
  aksiKeluar: (formData: FormData) => void | Promise<void>;
}) {
  const pathname = usePathname();
  const [ciut, setCiut] = useState(false);
  const [laciTerbuka, setLaciTerbuka] = useState(false);
  const [siap, setSiap] = useState(false);
  const tombolLaci = useRef<HTMLButtonElement>(null);

  // Pilihan ciut dibaca setelah mount (bukan saat render awal) supaya HTML dari
  // server dan hasil render pertama di peramban sama — kalau tidak, React
  // memperingatkan ketidakcocokan hidrasi.
  useEffect(() => {
    setCiut(localStorage.getItem(KUNCI_CIUT) === '1');
    setSiap(true);
  }, []);

  function ubahCiut(nilai: boolean) {
    setCiut(nilai);
    localStorage.setItem(KUNCI_CIUT, nilai ? '1' : '0');
  }

  // Laci ditutup dengan tombol Esc — kebiasaan umum di dialog.
  useEffect(() => {
    if (!laciTerbuka) return;
    const padaTombol = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLaciTerbuka(false);
    };
    window.addEventListener('keydown', padaTombol);
    return () => window.removeEventListener('keydown', padaTombol);
  }, [laciTerbuka]);

  // Saat laci terbuka, gulir latar dikunci supaya isi halaman tidak ikut bergerak.
  useEffect(() => {
    document.body.style.overflow = laciTerbuka ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [laciTerbuka]);

  // Menutup laci setiap kali berpindah halaman.
  useEffect(() => {
    setLaciTerbuka(false);
  }, [pathname]);

  const isi = (dipakaiDiLaci: boolean) => {
    const sempit = dipakaiDiLaci ? false : ciut;
    return (
      <>
        {/* ===== kepala rel: blok logo, diukur dari situs rujukan =====
            Di thisisfc88.com logo menempati blok 213×110 px di dalam rel, dengan
            gambar (SVG) setinggi 100 px, di atas menu. Di sini blok itu dipakai
            apa adanya; tingginya logo mengikuti permintaan agar diperbesar, tapi
            tetap dikecilkan di rel yang diciutkan supaya tidak meluber. */}
        <div
          className={`shrink-0 bg-mint ${
            sempit ? 'flex h-24 items-center justify-center px-2' : 'flex flex-col justify-center gap-2 px-6 py-5'
          }`}
        >
          <Link
            href="/"
            className={`flex min-w-0 items-center ${sempit ? '' : 'flex-col items-center gap-1.5'}`}
            title={sempit ? 'sosmed244' : undefined}
          >
            {/* Logo dibiarkan BERWARNA ASLI (biru + merah korporat BTN), jadi latar
                blok ini harus terang (mint) — logo biru di atas hitam pekat tidak
                terbaca. Karena latarnya terang, teksnya pun hijau gelap.
                Nama aplikasi diletakkan DI BAWAH logo: pada 76px logo butuh 190px
                lebar, dan rel 288px dikurangi padding tidak cukup untuk keduanya
                sebaris tanpa teks terpotong. */}
            <LogoBTN tinggi={sempit ? 30 : 76} prioritas={false} />
            {!sempit && (
              <span className="huruf-display text-[32px] leading-none text-teal">sosmed244</span>
            )}
          </Link>
          {dipakaiDiLaci && (
            <button
              type="button"
              onClick={() => setLaciTerbuka(false)}
              aria-label="Tutup menu"
              className="ml-auto rounded-none p-1.5 text-teks-3 hover:bg-mint-panel hover:text-mint"
            >
              <Ikon nama="tutup" />
            </button>
          )}
        </div>

        {/* ===== daftar menu: huruf display besar di atas hijau terang =====
            Ukurannya 30px, bukan 47px seperti situs rujukan: aplikasi ini punya
            tujuh menu lintas peran (di situsnya hanya empat), dan 47px membuat
            daftarnya melampaui tinggi layar. */}
        <nav className="flex-1 overflow-y-auto overflow-x-auto px-4 py-3">
          <ul className="flex flex-col">
            {menu.map((m) => {
              const aktif = aktifSekarang(pathname, m.href);
              return (
                <li key={m.href}>
                  <Link
                    href={m.href}
                    title={sempit ? m.label : undefined}
                    /* penanda untuk uji otomatis: memastikan menu aktif dikenali */
                    aria-current={aktif ? 'page' : undefined}
                    /* Menu nonaktif TIDAK diredupkan dengan opacity: teks hijau
                       gelap di atas hijau terang hanya 4.25:1, dan sedikit saja
                       dipudarkan ia jatuh di bawah ambang terbaca (opacity 0.6
                       = 2.2:1). Pembedaan dilakukan lewat garis bawah + ketebalan
                       huruf pada menu aktif, bukan dengan meredupkan yang lain. */
                    className={`group flex items-center justify-between gap-3 py-3.5 ${
                      sempit ? 'justify-center' : ''
                    }`}
                  >
                    {!sempit ? (
                      <>
                        <span
                          className={`huruf-display truncate text-[30px] leading-none text-teal ${
                            aktif ? 'border-b-[3px] border-teal' : ''
                          }`}
                        >
                          {m.label}
                        </span>
                        <span className="shrink-0 text-teal" aria-hidden>
                          <Ikon nama={m.ikon} className="h-5 w-5" />
                        </span>
                      </>
                    ) : (
                      <span className="text-teal">
                        <Ikon nama={m.ikon} />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ===== kaki: identitas pengguna + keluar =====
            Rel-nya hijau terang, jadi SEMUA teks di sini hijau gelap (--teal).
            Teks mint di area ini akan hilang sama sekali. */}
        <div className="shrink-0 p-3">
          {sempit ? (
            <div className="flex flex-col items-center gap-2">
              <div
                title={`${namaPengguna} · ${labelPeran}`}
                className="grid h-8 w-8 place-items-center rounded-full bg-teal text-xs font-bold text-mint"
              >
                {namaPengguna.charAt(0).toUpperCase()}
              </div>
              <form action={aksiKeluar}>
                <button
                  type="submit"
                  title="Keluar"
                  aria-label="Keluar"
                  className="rounded-none p-2 text-teal/80 hover:text-teal"
                >
                  <Ikon nama="keluar" />
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 border-t border-teal/25 pt-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal text-xs font-bold text-mint">
                {namaPengguna.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-teal">{namaPengguna}</div>
                <div className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-teal/70">
                  {labelPeran}
                  {brandKode && ` · ${brandKode}`}
                </div>
              </div>
              <form action={aksiKeluar}>
                <button
                  type="submit"
                  title="Keluar"
                  aria-label="Keluar"
                  className="rounded-none p-1.5 text-teal/70 transition-colors hover:text-teal"
                >
                  <Ikon nama="keluar" />
                </button>
              </form>
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      {/* ===== tombol buka laci (hanya layar kecil) ===== */}
      <button
        ref={tombolLaci}
        type="button"
        onClick={() => setLaciTerbuka(true)}
        aria-label="Buka menu"
        aria-expanded={laciTerbuka}
        className="fixed left-3 top-3 z-50 rounded-none bg-teal p-2.5 text-mint shadow-lg lg:hidden"
      >
        <Ikon nama="menu" className="h-5 w-5" />
      </button>

      {/* ===== sidebar tetap (desktop) =====
          Lebar 18rem (288px) mengikuti rel situs rujukan (293px): cukup untuk
          menu 30px dan nama aplikasi di samping logo tanpa terpotong. */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col text-teal transition-[width] duration-200 lg:flex ${REL_SIDEBAR} ${
          ciut ? 'w-[4.5rem]' : 'w-72'
        }`}
        data-terlihat={siap ? 'ya' : 'tidak'}
      >
        <div className="relative flex h-full flex-col">
          {isi(false)}

          {/* tombol ciut/buka — menempel di tepi kanan sidebar */}
          <button
            type="button"
            onClick={() => ubahCiut(!ciut)}
            title={ciut ? 'Lebarkan menu' : 'Ciutkan menu'}
            aria-label={ciut ? 'Lebarkan menu' : 'Ciutkan menu'}
            className="absolute right-[-0.75rem] top-20 hidden h-6 w-6 place-items-center rounded-full border border-teal/30 bg-latar text-mint shadow-md transition-colors hover:bg-teal xl:grid"
          >
            <Ikon nama={ciut ? 'buka' : 'ciut'} className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>

      {/* ===== laci (layar kecil) ===== */}
      {laciTerbuka && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* latar gelap — menutup laci saat diklik */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
            onClick={() => setLaciTerbuka(false)}
            aria-hidden
          />
          <aside
            className={`animasi-kiri absolute inset-y-0 left-0 flex w-72 flex-col text-teal shadow-2xl ${REL_SIDEBAR}`}
          >
            {isi(true)}
          </aside>
        </div>
      )}
    </>
  );
}
