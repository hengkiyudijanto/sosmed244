'use client';

import { useActionState } from 'react';
import { masuk, type HasilLogin } from '@/app/actions/auth';
import { useKirimForm } from '@/components/use-kirim-form';

export function FormMasuk() {
  const [state, aksi] = useActionState(masuk, {} as HasilLogin);
  const { sibuk, tandaiKirim } = useKirimForm();

  return (
    <form action={aksi} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-xs font-medium text-teks-2 mb-1.5">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="nama@contoh.com"
          className="input"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-xs font-medium text-teks-2 mb-1.5">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="input"
        />
      </div>

      {state.error && (
        <p className=" bg-bahaya-bg px-3 py-2 text-xs text-buruk">{state.error}</p>
      )}

      <button type="submit" disabled={sibuk} onClick={tandaiKirim} className="tombol tombol-utama w-full justify-center">
        {sibuk && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        Masuk
      </button>
    </form>
  );
}
