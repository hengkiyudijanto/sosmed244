import Link from 'next/link';
import { keluar } from '@/app/actions/auth';
import { NavMenu } from '@/components/nav-menu';
import { boleh, LABEL_PERAN } from '@/lib/konten/akses';
import type { PenggunaSesi } from '@/lib/auth';

/**
 * Kerangka halaman: bilah atas + isi + kaki.
 *
 * Menu disaring di server menurut kemampuan peran, supaya tautan yang tidak
 * relevan tidak pernah sampai ke peramban. (Ini kenyamanan, BUKAN pengamanan —
 * setiap halaman dan server action tetap memeriksa sendiri.)
 */
export function Kerangka({
  pengguna,
  children,
}: {
  pengguna: PenggunaSesi;
  children: React.ReactNode;
}) {
  const menu = [
    { href: '/', label: 'Dasbor' },
    { href: '/konten', label: 'Konten' },
    ...(boleh(pengguna.peran, 'kelola_konten') ? [{ href: '/konten/baru', label: 'Buat Konten' }] : []),
    ...(boleh(pengguna.peran, 'setujui_konten')
      ? [{ href: '/persetujuan', label: 'Persetujuan' }]
      : []),
    ...(boleh(pengguna.peran, 'lihat_audit') ? [{ href: '/audit', label: 'Audit' }] : []),
    ...(boleh(pengguna.peran, 'kelola_pengguna')
      ? [{ href: '/pengguna', label: 'Pengguna' }]
      : []),
    ...(boleh(pengguna.peran, 'kelola_pengaturan')
      ? [{ href: '/pengaturan', label: 'Pengaturan' }]
      : []),
  ];

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="sticky top-0 z-40 bg-biru-900 text-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-5">
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-jingga-500 text-sm font-bold">
                s
              </span>
              <span className="text-sm font-semibold tracking-tight">sosmed244</span>
            </Link>
            <NavMenu menu={menu} />
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="max-w-[180px] truncate text-sm font-semibold leading-tight">
                {pengguna.nama}
              </div>
              <div className="text-[11px] leading-tight text-white/60">
                {LABEL_PERAN[pengguna.peran]}
                {pengguna.brand && ` · ${pengguna.brand.kode}`}
              </div>
            </div>
            <form action={keluar}>
              <button
                type="submit"
                className="rounded-md border border-white/25 px-3 py-1.5 text-xs font-medium text-white/90 transition-colors hover:bg-white/10"
              >
                Keluar
              </button>
            </form>
          </div>
        </div>
        <div className="h-1 bg-jingga-500" />
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-abu-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
          <p className="text-[11px] text-abu-400">
            sosmed244 — manajemen konten sosial media
          </p>
          <p className="text-[11px] text-abu-400">
            Konten hanya terkirim setelah disetujui.
          </p>
        </div>
      </footer>
    </div>
  );
}
