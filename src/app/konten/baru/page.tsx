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
          <Link href="/konten" className="text-xs text-abu-500 hover:text-abu-700">
            ← Kembali ke daftar konten
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-abu-900">Buat Konten</h1>
          <div className="mt-2 h-0.5 w-10 rounded-full bg-logo-merah" />
          <p className="mt-3 text-sm leading-relaxed text-abu-500">
            Unggah berkas, tentukan tujuan dan penyetujunya. Setelah tersimpan sebagai draft, Anda
            masih bisa mengubahnya sebelum diajukan.
          </p>
        </div>

        {calon.length === 0 && (
          <div className="mt-6 rounded-lg border-l-[3px] border-peringatan bg-peringatan-bg px-4 py-3">
            <p className="text-xs font-semibold text-peringatan">Belum ada penyetuju</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-abu-700">
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
