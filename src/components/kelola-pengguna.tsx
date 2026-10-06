'use client';

/**
 * Komponen kelola pengguna: tambah, ubah, reset password, hapus.
 *
 * Aturan tampilan:
 *  - Tombol yang tidak tersedia untuk akun tertentu TIDAK ditampilkan, dengan
 *    alasan yang disebutkan — bukan tombol mati tanpa penjelasan.
 *  - Password sementara yang dibuat server ditampilkan SEKALI dalam kotak yang
 *    jelas; setelah ditutup tidak bisa dilihat lagi (memang tidak disimpan).
 *  - Konfirmasi hapus memakai dua langkah (klik → konfirmasi), bukan dialog
 *    bawaan peramban, supaya alasannya bisa dibaca.
 */

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useKirimForm } from '@/components/use-kirim-form';
import {
  tambahPengguna,
  ubahPengguna,
  resetPassword,
  hapusPengguna,
  type HasilAksi,
} from '@/app/actions/pengguna';
import { LABEL_PERAN, KETERANGAN_PERAN, PERAN, type Peran } from '@/lib/konten/akses';

type Brand = { id: string; nama: string; kode: string };

function Tombol({
  children,
  variasi = 'utama',
  className = '',
}: {
  children: React.ReactNode;
  variasi?: 'utama' | 'sekunder' | 'bahaya';
  className?: string;
}) {
  const { sibuk, tandaiKirim } = useKirimForm();
  const kelas =
    variasi === 'utama' ? 'tombol-utama' : variasi === 'bahaya' ? 'tombol-bahaya' : 'tombol-sekunder';

  return (
    <button type="submit" disabled={sibuk} onClick={tandaiKirim} className={`tombol ${kelas} ${className}`}>
      {sibuk && (
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

/** Pesan hasil, termasuk kotak password sementara yang hanya tampil sekali. */
function Pesan({ state, onTutup }: { state: HasilAksi; onTutup?: () => void }) {
  if (state.error) {
    return (
      <p className="mt-2 rounded-lg bg-bahaya-bg px-3 py-2 text-xs leading-relaxed text-bahaya">
        {state.error}
      </p>
    );
  }
  if (!state.sukses) return null;

  return (
    <div className="mt-2 space-y-2">
      <p className="rounded-lg bg-sukses-bg px-3 py-2 text-xs text-sukses">{state.pesan}</p>

      {state.passwordSementara && (
        <div className="rounded-lg border-l-[3px] border-jingga-500 bg-peringatan-bg px-3.5 py-3">
          <p className="text-xs font-semibold text-peringatan">
            Password sementara — catat sekarang, tidak akan ditampilkan lagi
          </p>
          <p className="mt-2 select-all rounded bg-white px-3 py-2 font-mono text-sm tracking-wider text-abu-900">
            {state.passwordSementara}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-abu-700">
            Sampaikan ke pemilik akun lewat jalur aman (bukan grup chat). Ia wajib menggantinya
            saat login pertama.
          </p>
          {onTutup && (
            <button
              type="button"
              onClick={onTutup}
              className="mt-2 text-[11px] font-semibold text-peringatan hover:underline"
            >
              Sudah saya catat, tutup
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PilihPeran({ nilaiAwal, nama = 'peran' }: { nilaiAwal?: Peran; nama?: string }) {
  return (
    <select name={nama} defaultValue={nilaiAwal ?? 'KREATOR'} className="input">
      {PERAN.map((p) => (
        <option key={p} value={p}>
          {LABEL_PERAN[p]} — {KETERANGAN_PERAN[p]}
        </option>
      ))}
    </select>
  );
}

// ===========================================================================
// Form tambah pengguna
// ===========================================================================

export function FormTambahPengguna({ daftarBrand }: { daftarBrand: Brand[] }) {
  const [state, aksi] = useActionState(tambahPengguna, {} as HasilAksi);
  const [terbuka, setTerbuka] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.sukses) router.refresh();
  }, [state.sukses, router]);

  if (!terbuka) {
    return (
      <button type="button" onClick={() => setTerbuka(true)} className="tombol tombol-utama">
        + Tambah Pengguna
      </button>
    );
  }

  return (
    <div className="kartu animasi-naik p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-abu-800">Tambah Pengguna</h2>
        <button
          type="button"
          onClick={() => setTerbuka(false)}
          className="text-xs text-abu-400 hover:text-abu-600"
        >
          Tutup
        </button>
      </div>

      <form action={aksi} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nama" className="mb-1.5 block text-xs font-medium text-abu-600">
              Nama lengkap
            </label>
            <input id="nama" name="nama" required minLength={3} maxLength={80} className="input" />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-abu-600">
              Email (dipakai untuk login)
            </label>
            <input id="email" name="email" type="email" required className="input" />
          </div>
        </div>

        <div>
          <label htmlFor="peran" className="mb-1.5 block text-xs font-medium text-abu-600">
            Peran
          </label>
          <PilihPeran />
        </div>

        {daftarBrand.length > 0 && (
          <div>
            <label htmlFor="brandId" className="mb-1.5 block text-xs font-medium text-abu-600">
              Brand <span className="text-abu-400">(opsional)</span>
            </label>
            <select id="brandId" name="brandId" defaultValue="" className="input">
              <option value="">— tanpa brand —</option>
              {daftarBrand.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.kode} — {b.nama}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-abu-600">
            Password awal <span className="text-abu-400">(kosongkan untuk dibuatkan otomatis)</span>
          </label>
          <input id="password" name="password" type="text" autoComplete="new-password" className="input" />
          <p className="mt-1.5 text-[11px] leading-relaxed text-abu-400">
            Kalau dikosongkan, sistem membuat password sementara dan menampilkannya sekali untuk Anda
            catat. Akun baru selalu <strong>wajib mengganti password</strong> saat login pertama.
          </p>
        </div>

        <Pesan state={state} />
        <Tombol>Simpan akun baru</Tombol>
      </form>
    </div>
  );
}

// ===========================================================================
// Baris pengguna: ubah, reset password, hapus
// ===========================================================================

export type PenggunaBaris = {
  id: string;
  nama: string;
  email: string;
  peran: string;
  aktif: boolean;
  harusGantiPassword: boolean;
  brandId: string | null;
  jumlahKonten: number;
  jumlahKeputusan: number;
};

export function AksiPengguna({
  pengguna,
  daftarBrand,
  sayaId,
}: {
  pengguna: PenggunaBaris;
  daftarBrand: Brand[];
  sayaId: string;
}) {
  const [panel, setPanel] = useState<'ubah' | 'reset' | 'hapus' | null>(null);
  const [stateUbah, aksiUbah] = useActionState(ubahPengguna, {} as HasilAksi);
  const [stateReset, aksiReset] = useActionState(resetPassword, {} as HasilAksi);
  const [stateHapus, aksiHapus] = useActionState(hapusPengguna, {} as HasilAksi);
  const router = useRouter();
  const diriSendiri = pengguna.id === sayaId;

  useEffect(() => {
    if (stateUbah.sukses || stateReset.sukses || stateHapus.sukses) router.refresh();
  }, [stateUbah.sukses, stateReset.sukses, stateHapus.sukses, router]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPanel(panel === 'ubah' ? null : 'ubah')}
          className="text-[11px] font-medium text-biru-600 hover:underline"
        >
          {panel === 'ubah' ? 'Tutup' : 'Ubah'}
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === 'reset' ? null : 'reset')}
          className="text-[11px] font-medium text-biru-600 hover:underline"
        >
          {panel === 'reset' ? 'Tutup' : 'Reset password'}
        </button>
        {!diriSendiri && (
          <button
            type="button"
            onClick={() => setPanel(panel === 'hapus' ? null : 'hapus')}
            className="text-[11px] font-medium text-bahaya hover:underline"
          >
            {panel === 'hapus' ? 'Batal' : pengguna.jumlahKonten + pengguna.jumlahKeputusan > 0 ? 'Nonaktifkan' : 'Hapus'}
          </button>
        )}
      </div>

      {diriSendiri && (
        <p className="text-[10px] leading-relaxed text-abu-400">
          Ini akun Anda — peran dan statusnya tidak dapat diubah dari sini.
        </p>
      )}

      {/* ===== ubah ===== */}
      {panel === 'ubah' && (
        <form action={aksiUbah} className="animasi-naik space-y-3 rounded-lg border border-abu-200 bg-abu-50 p-3.5">
          <input type="hidden" name="id" value={pengguna.id} />
          <div>
            <label className="mb-1 block text-[11px] text-abu-500">Nama</label>
            <input name="nama" defaultValue={pengguna.nama} required minLength={3} className="input text-xs" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-abu-500">Email</label>
            <input name="email" type="email" defaultValue={pengguna.email} required className="input text-xs" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-abu-500">Peran</label>
            <PilihPeran nilaiAwal={pengguna.peran as Peran} />
          </div>
          {daftarBrand.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] text-abu-500">Brand</label>
              <select name="brandId" defaultValue={pengguna.brandId ?? ''} className="input text-xs">
                <option value="">— tanpa brand —</option>
                {daftarBrand.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.kode} — {b.nama}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-abu-700">
            <input
              type="checkbox"
              name="aktif"
              defaultChecked={pengguna.aktif}
              className="accent-biru-600"
            />
            Akun aktif (bisa masuk)
          </label>
          <Pesan state={stateUbah} />
          <Tombol>Simpan perubahan</Tombol>
        </form>
      )}

      {/* ===== reset password ===== */}
      {panel === 'reset' && (
        <form action={aksiReset} className="animasi-naik space-y-3 rounded-lg border border-abu-200 bg-abu-50 p-3.5">
          <input type="hidden" name="id" value={pengguna.id} />
          <p className="text-[11px] leading-relaxed text-abu-600">
            Semua sesi aktif akun ini akan dicabut, dan ia wajib mengganti password saat login
            berikutnya.
          </p>
          <div>
            <label className="mb-1 block text-[11px] text-abu-500">
              Password baru <span className="text-abu-400">(kosongkan untuk dibuatkan otomatis)</span>
            </label>
            <input name="password" type="text" autoComplete="new-password" className="input text-xs" />
          </div>
          <Pesan state={stateReset} onTutup={() => setPanel(null)} />
          <Tombol variasi="sekunder">Reset password</Tombol>
        </form>
      )}

      {/* ===== hapus / nonaktifkan ===== */}
      {panel === 'hapus' && (
        <form action={aksiHapus} className="animasi-naik space-y-3 rounded-lg border border-bahaya/30 bg-bahaya-bg p-3.5">
          <input type="hidden" name="id" value={pengguna.id} />
          {pengguna.jumlahKonten + pengguna.jumlahKeputusan > 0 ? (
            <p className="text-[11px] leading-relaxed text-abu-700">
              <strong>{pengguna.nama}</strong> punya {pengguna.jumlahKonten} konten dan{' '}
              {pengguna.jumlahKeputusan} keputusan. Akunnya akan <strong>dinonaktifkan</strong>, bukan
              dihapus — supaya riwayat approval tetap menunjukkan siapa pelakunya. Sesi aktifnya
              dicabut.
            </p>
          ) : (
            <p className="text-[11px] leading-relaxed text-abu-700">
              <strong>{pengguna.nama}</strong> belum punya konten maupun keputusan, jadi akunnya dapat
              dihapus permanen. Tindakan ini tidak bisa dibatalkan.
            </p>
          )}
          <Pesan state={stateHapus} />
          <Tombol variasi="bahaya">
            {pengguna.jumlahKonten + pengguna.jumlahKeputusan > 0 ? 'Ya, nonaktifkan' : 'Ya, hapus permanen'}
          </Tombol>
        </form>
      )}
    </div>
  );
}
