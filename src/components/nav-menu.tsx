'use client';

/**
 * Navigasi utama — bilah samping (sidebar) ala dasbor aplikasi profesional.
 *
 * TEMA: kepala sidebar MERAH, menu biru, badan sidebar bergradasi biru -> putih —
 * semuanya memakai warna yang diambil LANGSUNG dari logo BTN (--logo-biru:
 * rgb(0,91,253) dan --logo-merah: rgb(255,0,0)). Karena bagian atas gelap dan
 * bagian bawah terang, warna teks TIDAK bisa seragam: kepala dan menu memakai
 * teks putih, sedangkan kaki (nama pengguna) memakai teks gelap.
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
 * Kelas gradasi sidebar: biru logo BTN di atas, memudar ke putih di bawah.
 * Dipakai bersama oleh sidebar tetap dan laci supaya keduanya pasti seragam.
 */
const GRADASI_SIDEBAR =
  'bg-[linear-gradient(180deg,#003ba8_0%,#005bfd_22%,#3f83f5_48%,#a9c8fb_74%,#ffffff_100%)]';

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
        {/* ===== kepala: logo + nama aplikasi =====
            Latar memakai --logo-merah-tua (#cc0000), bukan merah murni. Alasannya
            kontras: teks putih di atas merah murni hanya 4.00:1 (di bawah WCAG AA
            4.5:1), sedangkan di atas merah tua ini 5.9:1 — jelas terbaca. */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/20 bg-logo-merah-tua px-3">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2.5"
            title={sempit ? 'sosmed244' : undefined}
          >
            {/* logo diputihkan — logo biru di latar biru tidak terbaca */}
            <LogoBTN tinggi={22} className="brightness-0 invert" />
            {!sempit && (
              <span className="truncate text-sm font-semibold tracking-tight text-white">
                sosmed244
              </span>
            )}
          </Link>
          {dipakaiDiLaci && (
            <button
              type="button"
              onClick={() => setLaciTerbuka(false)}
              aria-label="Tutup menu"
              className="ml-auto rounded-md p-1.5 text-white/80 hover:bg-white/15 hover:text-white"
            >
              <Ikon nama="tutup" />
            </button>
          )}
        </div>

        {/* ===== daftar menu (latar biru pekat, menempel di bawah kepala) ===== */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden bg-logo-biru px-2.5 py-3">
          <ul className="flex flex-col gap-0.5">
            {menu.map((m) => {
              const aktif = aktifSekarang(pathname, m.href);
              return (
                <li key={m.href}>
                  <Link
                    href={m.href}
                    title={sempit ? m.label : undefined}
                    /* penanda untuk uji otomatis: memastikan menu aktif dikenali */
                    aria-current={aktif ? 'page' : undefined}
                    className={`group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                      aktif
                        ? 'bg-white font-semibold text-logo-biru-tua shadow-sm'
                        : 'text-white/80 hover:bg-white/15 hover:text-white'
                    } ${sempit ? 'justify-center' : ''}`}
                  >
                    <span className="shrink-0">
                      <Ikon nama={m.ikon} />
                    </span>
                    {!sempit && <span className="truncate">{m.label}</span>}
                    {/* penanda merah (warna aksen dari logo BTN) di tautan aktif */}
                    {aktif && !sempit && (
                      <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-logo-merah" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ===== kaki: identitas pengguna + keluar (di area gradasi terang) =====
            Di sini latarnya sudah memudar ke putih, jadi teksnya WAJIB gelap —
            teks putih di area ini akan hilang sama sekali. */}
        <div className="shrink-0 border-t border-logo-biru/15 p-2.5">
          {sempit ? (
            <div className="flex flex-col items-center gap-2">
              <div
                title={`${namaPengguna} · ${labelPeran}`}
                className="grid h-8 w-8 place-items-center rounded-full bg-logo-biru text-xs font-semibold text-white"
              >
                {namaPengguna.charAt(0).toUpperCase()}
              </div>
              <form action={aksiKeluar}>
                <button
                  type="submit"
                  title="Keluar"
                  aria-label="Keluar"
                  className="rounded-md p-2 text-logo-biru-tua hover:bg-logo-biru/10"
                >
                  <Ikon nama="keluar" />
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-logo-biru/15">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-logo-biru text-xs font-semibold text-white">
                {namaPengguna.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-logo-biru-tua">
                  {namaPengguna}
                </div>
                <div className="truncate text-[10px] text-abu-600">
                  {labelPeran}
                  {brandKode && ` · ${brandKode}`}
                </div>
              </div>
              <form action={aksiKeluar}>
                <button
                  type="submit"
                  title="Keluar"
                  aria-label="Keluar"
                  className="rounded-md p-1.5 text-logo-biru-tua/70 transition-colors hover:bg-logo-biru/10 hover:text-logo-biru-tua"
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
        className="fixed left-3 top-3 z-50 rounded-lg bg-logo-merah p-2.5 text-white shadow-lg lg:hidden"
      >
        <Ikon nama="menu" className="h-5 w-5" />
      </button>

      {/* ===== sidebar tetap (desktop) ===== */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col text-white transition-[width] duration-200 lg:flex ${GRADASI_SIDEBAR} ${
          ciut ? 'w-[4.5rem]' : 'w-64'
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
            className="absolute right-[-0.75rem] top-20 hidden h-6 w-6 place-items-center rounded-full border border-abu-200 bg-white text-logo-biru-tua shadow-md transition-colors hover:bg-logo-biru hover:text-white xl:grid"
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
            className="absolute inset-0 bg-abu-900/60 backdrop-blur-[2px]"
            onClick={() => setLaciTerbuka(false)}
            aria-hidden
          />
          <aside
            className={`animasi-kiri absolute inset-y-0 left-0 flex w-64 flex-col text-white shadow-2xl ${GRADASI_SIDEBAR}`}
          >
            {isi(true)}
          </aside>
        </div>
      )}
    </>
  );
}
