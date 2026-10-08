import { redirect } from 'next/navigation';
import { penggunaDariSesi } from '@/lib/auth';
import { ubahPassword } from '@/app/actions/auth';
import { FormUbahPassword } from '@/components/form-ubah-password';
import { Kerangka } from '@/components/kerangka';

export const metadata = { title: 'Ubah Password' };

export default async function HalamanUbahPassword() {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) redirect('/masuk');

  return (
    <Kerangka pengguna={pengguna}>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="kartu p-6 sm:p-8">
            <p className="label-kolom">Keamanan akun</p>
            <h1 className="huruf-judul mt-2 text-2xl text-mint">
              {pengguna.harusGantiPassword ? 'Ganti password Anda' : 'Ubah password'}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-teks-2">
              {pengguna.harusGantiPassword
                ? 'Ini login pertama Anda (atau password baru saja direset). Demi keamanan, ganti password sebelum melanjutkan.'
                : 'Masukkan password lama untuk memastikan ini benar-benar Anda.'}
            </p>

            <div className="mt-6">
              <FormUbahPassword wajib={pengguna.harusGantiPassword} />
            </div>
          </div>

          {pengguna.harusGantiPassword && (
            <p className="mt-4 text-center text-[11px] text-teks-3">
              Anda tidak dapat membuka halaman lain sebelum password diganti.
            </p>
          )}
        </div>
      </div>
    </Kerangka>
  );
}
