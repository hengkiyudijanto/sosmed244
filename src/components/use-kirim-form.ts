'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Status "sedang dikirim" untuk tombol di dalam <form> server action.
 *
 * KENAPA HOOK INI ADA (jebakan yang sudah memakan waktu di proyek sebelumnya):
 * `useFormStatus()` mengembalikan `pending: true` saat komponen dirender di
 * SERVER, karena status form belum diketahui saat itu. Akibatnya
 * `<button disabled={pending}>` tercetak NONAKTIF di HTML awal — pengguna
 * melihat semua tombol mati sebelum halaman hidup, termasuk tombol Masuk.
 *
 * Hook ini hanya mempercayai `pending` setelah tombol benar-benar diklik.
 *
 * Pemakaian:
 *   const { sibuk, tandaiKirim } = useKirimForm();
 *   <button type="submit" disabled={sibuk} onClick={tandaiKirim}>
 *
 * JANGAN pakai `pending` mentah untuk `disabled`.
 */
export function useKirimForm() {
  const { pending } = useFormStatus();
  const [pernahDikirim, setPernahDikirim] = useState(false);

  return {
    /** true hanya bila form benar-benar sedang dikirim dari peramban */
    sibuk: pernahDikirim && pending,
    /** pasang di onClick tombol submit */
    tandaiKirim: () => setPernahDikirim(true),
  };
}
