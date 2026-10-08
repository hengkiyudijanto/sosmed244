import { redirect } from 'next/navigation';
import Link from 'next/link';
import { penggunaDariSesi } from '@/lib/auth';
import { Kerangka } from '@/components/kerangka';
import { FormKonten } from '@/components/form-konten';
import { boleh } from '@/lib/konten/akses';

export const metadata = { title: 'Buat Konten' };

export default async function HalamanKontenBaru() {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) redirect('/masuk');
  if (pengguna.harusGantiPassword) redirect('/ubah-password');
  if (!boleh(pengguna.peran, 'kelola_konten')) redirect('/konten');

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
            Unggah berkas dan tentukan tujuannya. Setelah tersimpan sebagai draft, Anda masih bisa
            mengubahnya sebelum diajukan.
          </p>
        </div>

        <div className="mt-6">
          <FormKonten />
        </div>
      </div>
    </Kerangka>
  );
}
