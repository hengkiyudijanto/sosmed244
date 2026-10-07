'use client';

/**
 * Tombol "Perbarui sekarang" untuk token platform.
 *
 * Dipakai ketika pembaruan otomatis tidak bisa bekerja — terutama untuk token
 * yang tidak punya informasi masa berlaku (ditempel manual), dan ketika
 * pembaruan otomatis gagal karena gangguan jaringan.
 *
 * Tombolnya TIDAK menyembunyikan sebab kegagalan: server mengirim pesan yang
 * spesifik (client key belum diisi, refresh token belum ada, platform menolak),
 * dan pesan itu yang ditampilkan.
 */

import { useActionState } from 'react';
import { useKirimForm } from '@/components/use-kirim-form';
import { perbaruiTokenPlatform, type HasilToken } from '@/app/actions/token';

export function TombolPerbaruiToken({ platform }: { platform: 'INSTAGRAM' | 'TIKTOK' }) {
  const [state, aksi] = useActionState(perbaruiTokenPlatform, {} as HasilToken);
  const { sibuk, tandaiKirim } = useKirimForm();

  return (
    <form action={aksi} className="mt-3">
      <input type="hidden" name="platform" value={platform} />
      <button type="submit" disabled={sibuk} onClick={tandaiKirim} className="tombol tombol-sekunder text-xs">
        {sibuk && (
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {sibuk ? 'Memperbarui…' : 'Perbarui token sekarang'}
      </button>

      {state.error && (
        <p className="mt-2 rounded-lg bg-bahaya-bg px-2.5 py-1.5 text-[11px] leading-relaxed text-bahaya">
          {state.error}
        </p>
      )}
      {state.sukses && (
        <p className="mt-2 rounded-lg bg-sukses-bg px-2.5 py-1.5 text-[11px] leading-relaxed text-sukses">
          {state.pesan}
        </p>
      )}
    </form>
  );
}
