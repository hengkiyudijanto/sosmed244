/**
 * TEMATIKA — TEMA FC88 (thisisfc88.com)
 *
 * Situs rujukannya memakai latar hitam pekat dengan teks hijau mint dan satu
 * aksen hijau terang; bilah atasnya HITAM dan halamannya ditutup footer HIJAU
 * MINT. Token warnanya ada di `globals.css` (--latar, --mint, --aksen, --teal).
 *
 * Aturan yang mudah dilanggar saat menambah halaman: teks TERANG hanya boleh
 * diletakkan di atas panel GELAP (--panel / --latar). Blok berlatar mint
 * (--mint / --mint-lembut) WAJIB berteks gelap (--teal atau --latar) — kalau
 * tidak, teksnya hilang sama sekali.
 *
 * Warna logonya sendiri (--logo-biru, --logo-merah) sengaja TIDAK diubah:
 * itu warna logo BTN, dipakai hanya di logo. Semua aksen antarmuka memakai
 * --aksen (hijau terang) supaya seragam dengan tema.
 */

import { keluar } from '@/app/actions/auth';
import { Sidebar, type ItemMenu } from '@/components/nav-menu';
import { boleh, LABEL_PERAN } from '@/lib/konten/akses';
import type { PenggunaSesi } from '@/lib/auth';

/**
 * Kerangka halaman: sidebar + isi + kaki.
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
 * Warna: kepala sidebar memakai merah dari logo BTN (--logo-merah-tua), menu
 * biru logo, badan sidebar bergradasi biru menuju putih.
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
        <main className="flex-1">{children}</main>

        {/* kaki halaman: HIJAU MINT dengan teks hijau gelap — kebalikan panel
            utama, sama seperti footer di situs rujukan. Karena latarnya TERANG,
            teksnya WAJIB gelap (--teal), bukan mint. */}
        <footer className="border-t border-garis bg-mint">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal">
              sosmed244 — manajemen konten sosial media
            </p>
            <p className="text-[11px] text-teal/80">Konten hanya terkirim setelah disetujui.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
