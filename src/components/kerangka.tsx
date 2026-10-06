import { keluar } from '@/app/actions/auth';
import { Sidebar, type ItemMenu } from '@/components/nav-menu';
import { boleh, LABEL_PERAN } from '@/lib/konten/akses';
import type { PenggunaSesi } from '@/lib/auth';

/**
 * Kerangka halaman: sidebar + bilah merah + isi + kaki.
 *
 * Menu disaring di server menurut kemampuan peran, supaya tautan yang tidak
 * relevan tidak pernah sampai ke peramban. (Ini kenyamanan, BUKAN pengamanan —
 * setiap halaman dan server action tetap memeriksa sendiri.)
 *
 * Kenapa sidebar: menu sudah tujuh, dan akan bertambah. Di bilah atas ia berebut
 * tempat dengan nama pengguna dan tombol keluar, lalu di layar sempit menjadi
 * gulir mendatar yang menyembunyikan sebagian menu — di sidebar semua menu
 * selalu terlihat sekaligus.
 *
 * Warna: bilah tepat di kanan sidebar memakai merah yang diambil langsung dari
 * logo BTN (--logo-merah: rgb(255,0,0)); sidebar-nya sendiri bergradasi biru
 * (dari logo yang sama) menuju putih.
 *
 * Catatan tata letak: sidebar memakai `sticky top-0 h-screen`, bukan `fixed`,
 * supaya isi halaman ikut mengalir di sebelahnya tanpa perlu memberi margin
 * kiri pada setiap halaman — cara ini tidak mudah rusak saat halaman baru
 * ditambahkan.
 */
export function Kerangka({
  pengguna,
  children,
}: {
  pengguna: PenggunaSesi;
  children: React.ReactNode;
}) {
  const menu: ItemMenu[] = [
    { href: '/', label: 'Dasbor', ikon: 'dasbor' },
    { href: '/konten', label: 'Konten', ikon: 'konten' },
    ...(boleh(pengguna.peran, 'kelola_konten')
      ? [{ href: '/konten/baru', label: 'Buat Konten', ikon: 'baru' }]
      : []),
    ...(boleh(pengguna.peran, 'setujui_konten')
      ? [{ href: '/persetujuan', label: 'Persetujuan', ikon: 'persetujuan' }]
      : []),
    ...(boleh(pengguna.peran, 'lihat_audit')
      ? [{ href: '/audit', label: 'Audit', ikon: 'audit' }]
      : []),
    ...(boleh(pengguna.peran, 'kelola_pengguna')
      ? [{ href: '/pengguna', label: 'Pengguna', ikon: 'pengguna' }]
      : []),
    ...(boleh(pengguna.peran, 'kelola_pengaturan')
      ? [{ href: '/pengaturan', label: 'Pengaturan', ikon: 'pengaturan' }]
      : []),
  ];

  return (
    <div className="flex min-h-screen flex-1">
      <Sidebar
        menu={menu}
        namaPengguna={pengguna.nama}
        labelPeran={LABEL_PERAN[pengguna.peran]}
        brandKode={pengguna.brand?.kode ?? null}
        aksiKeluar={keluar}
      />

      {/* pt-16 di layar kecil: memberi ruang bagi tombol buka menu yang mengapung */}
      <div className="flex min-w-0 flex-1 flex-col pt-16 lg:pt-0">
        {/* ===== bilah merah (warna aksen dari logo BTN) ===== */}
        <div className="h-1.5 shrink-0 bg-logo-merah lg:h-2" />

        <main className="flex-1">{children}</main>

        <footer className="border-t border-abu-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
            <p className="text-[11px] text-abu-400">
              sosmed244 — manajemen konten sosial media
            </p>
            <p className="text-[11px] text-abu-400">Konten hanya terkirim setelah disetujui.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
