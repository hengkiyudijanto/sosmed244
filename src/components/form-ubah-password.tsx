'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ubahPassword, type HasilUbahPassword } from '@/app/actions/auth';
import { useKirimForm } from '@/components/use-kirim-form';

export function FormUbahPassword({ wajib }: { wajib: boolean }) {
  const [state, aksi] = useActionState(ubahPassword, {} as HasilUbahPassword);
  const { sibuk, tandaiKirim } = useKirimForm();
  const router = useRouter();

  // Setelah berhasil dan password itu WAJIB diganti, halaman lain baru boleh
  // dibuka — jadi arahkan ke dasbor.
  useEffect(() => {
    if (state.sukses && wajib) {
      const t = setTimeout(() => router.push('/'), 1200);
      return () => clearTimeout(t);
    }
  }, [state.sukses, wajib, router]);

  return (
    <form action={aksi} className="space-y-4">
      <div>
        <label htmlFor="lama" className="mb-1.5 block text-xs font-medium text-teks-2">
          Password saat ini
        </label>
        <input id="lama" name="lama" type="password" required autoComplete="current-password" className="input" />
      </div>

      <div>
        <label htmlFor="baru" className="mb-1.5 block text-xs font-medium text-teks-2">
          Password baru
        </label>
        <input id="baru" name="baru" type="password" required autoComplete="new-password" className="input" />
        <p className="mt-1.5 text-[11px] leading-relaxed text-teks-3">
          Minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka.
        </p>
      </div>

      <div>
        <label htmlFor="ulang" className="mb-1.5 block text-xs font-medium text-teks-2">
          Ulangi password baru
        </label>
        <input id="ulang" name="ulang" type="password" required autoComplete="new-password" className="input" />
      </div>

      {state.error && (
        <p className=" bg-bahaya-bg px-3 py-2 text-xs text-buruk">{state.error}</p>
      )}
      {state.sukses && (
        <p className=" bg-baik-bg px-3 py-2 text-xs text-aksen">
          {state.pesan}
          {wajib && ' Mengalihkan ke dasbor…'}
        </p>
      )}

      <button type="submit" disabled={sibuk} onClick={tandaiKirim} className="tombol tombol-utama w-full justify-center">
        {sibuk && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        Simpan password baru
      </button>
    </form>
  );
}
