import { redirect } from 'next/navigation';
import Link from 'next/link';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { prisma } from '@/lib/db';
import { FormKonten } from '@/components/form-konten';
import { boleh } from '@/lib/konten/akses';

export const metadata = { title: 'Buat Konten' };

/** Pengguna yang berhak menyetujui — dipakai untuk pilihan penyetuju. */
export async function daftarCalonPenyetuju(sayaId: string) {
  const semua = await prisma.pengguna.findMany({
    where: { aktif: true, id: { not: sayaId } },
    select: { id: true, nama: true, email: true, peran: true },
    orderBy: { nama: 'asc' },
  });
  // saring lewat sumber kebenaran akses, bukan daftar peran yang ditulis ulang
  return semua.filter((p) => boleh(p.peran, 'setujui_konten'));
}

export default async function HalamanKontenBaru() {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) redirect('/masuk');
  if (pengguna.harusGantiPassword) redirect('/ubah-password');
  if (!boleh(pengguna.peran, 'kelola_konten')) redirect('/konten');

  const calon = await daftarCalonPenyetuju(pengguna.id);

  return (
    <Kerangka pengguna={pengguna}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="animasi-naik">
          <Link href="/konten" className="text-xs font-semibold text-teks-3 hover:text-mint">
            ← Kembali ke daftar konten
          </Link>
          <p className="label-kolom mt-3">Konten</p>
          <h1 className="huruf-judul mt-2 text-3xl text-mint sm:text-4xl">Buat konten</h1>
          <p className="mt-3 text-sm leading-relaxed text-teks-2">
            Unggah berkas, tentukan tujuan dan penyetujunya. Setelah tersimpan sebagai draft, Anda
            masih bisa mengubahnya sebelum diajukan.
          </p>
        </div>

        {calon.length === 0 && (
          <div className="mt-6 border-l-2 border-tunggu bg-tunggu-bg px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-tunggu">
              Belum ada penyetuju
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-teks-2">
              Tidak ada pengguna lain berperan penyetuju atau administrator. Konten tetap bisa
              disimpan sebagai draft, tetapi belum dapat diajukan sampai ada penyetuju.
            </p>
          </div>
        )}

        <div className="mt-6">
          <FormKonten calonPenyetuju={calon} sayaId={pengguna.id} />
        </div>
      </div>
    </Kerangka>
  );
}
