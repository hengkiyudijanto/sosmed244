/**
 * HAK AKSES — satu sumber kebenaran untuk modul konten.
 *
 * ATURAN PROYEK INI (pelajaran dari proyek sebelumnya):
 *  1. Jangan menulis `peran === 'ADMIN'` di halaman atau server action. Semua
 *     keputusan lewat berkas ini, supaya menambah peran tidak perlu mencari
 *     ke seluruh kode (dan tidak ada satu pun yang terlewat jadi celah).
 *  2. Cakupan data (melihat semua konten vs hanya milik sendiri) adalah
 *     KEMAMPUAN, bukan nama peran. Pola `peran === 'ADMIN'` untuk cakupan
 *     pernah membuat satu peran kehilangan datanya tanpa pesan error.
 *  3. Menyembunyikan tombol BUKAN pengamanan: setiap server action memanggil
 *     fungsi di sini sebelum mengubah data.
 */

import { bisaDiubah, type Status } from './status';

export const PERAN = ['KREATOR', 'PENYETUJU', 'ADMIN'] as const;
export type Peran = (typeof PERAN)[number];

export const LABEL_PERAN: Record<Peran, string> = {
  KREATOR: 'Kreator',
  PENYETUJU: 'Penyetuju',
  ADMIN: 'Administrator',
};

export const KETERANGAN_PERAN: Record<Peran, string> = {
  KREATOR: 'Membuat konten dan mengajukannya untuk disetujui.',
  PENYETUJU: 'Menyetujui atau meminta revisi. Boleh juga membuat konten sendiri.',
  ADMIN: 'Kelola pengguna, brand, akun platform, dan pengaturan pengiriman.',
};

export type Kemampuan =
  /** Membuat / mengubah / mengajukan / mengirim konten. */
  | 'kelola_konten'
  /** Menyetujui atau meminta revisi konten orang lain. */
  | 'setujui_konten'
  /** Melihat SEMUA konten, bukan hanya miliknya sendiri. */
  | 'lihat_semua_konten'
  /** Kelola pengguna. */
  | 'kelola_pengguna'
  /** Kelola brand & akun platform. */
  | 'kelola_master'
  /** Pengaturan modus pengiriman & kredensial platform. */
  | 'kelola_pengaturan'
  /** Melihat audit log. */
  | 'lihat_audit';

const KEMAMPUAN: Record<Peran, Kemampuan[]> = {
  KREATOR: ['kelola_konten'],

  PENYETUJU: [
    'kelola_konten',
    'setujui_konten',
    'lihat_semua_konten',
    'lihat_audit',
  ],

  ADMIN: [
    'kelola_konten',
    'setujui_konten',
    'lihat_semua_konten',
    'kelola_pengguna',
    'kelola_master',
    'kelola_pengaturan',
    'lihat_audit',
  ],
};

/** Apakah peran ini punya kemampuan tersebut? */
export function boleh(peran: string, kemampuan: Kemampuan): boolean {
  const daftar = KEMAMPUAN[peran as Peran];
  return Array.isArray(daftar) && daftar.includes(kemampuan);
}

/**
 * Penjaga untuk server action. Mengembalikan pesan error siap-pakai, atau null
 * kalau boleh lanjut.
 *
 *   const tolak = wajibKemampuan(saya, 'kelola_konten');
 *   if (tolak) return { error: tolak };
 */
export function wajibKemampuan(
  pengguna: { peran: string } | null,
  kemampuan: Kemampuan
): string | null {
  if (!pengguna) return 'Sesi habis. Silakan masuk kembali.';
  if (!boleh(pengguna.peran, kemampuan)) {
    return 'Peran Anda tidak berhak melakukan tindakan ini.';
  }
  return null;
}

/** Ringkas data konten yang dibutuhkan untuk memutuskan hak akses per baris. */
export type KontenRingkas = {
  pembuatId: string;
  penyetujuId: string | null;
  status: Status;
};

export type Saya = { id: string; peran: string };

/**
 * Apakah saya melihat konten ini di daftar?
 *
 * - pembuatnya          -> selalu
 * - penyetuju yang sah  -> selalu (perlu untuk menyetujui)
 * - punya lihat_semua_konten -> selalu
 */
export function bolehLihat(konten: KontenRingkas, saya: Saya): boolean {
  if (konten.pembuatId === saya.id) return true;
  if (konten.penyetujuId && konten.penyetujuId === saya.id) return true;
  return boleh(saya.peran, 'lihat_semua_konten');
}

export type AksiKonten = 'ubah' | 'hapus';

/**
 * Hak per baris konten.
 *
 * Sengaja diatur ketat:
 *  - Konten yang MENUNGGU tidak bisa diubah pembuatnya (harus ditarik dulu),
 *    supaya yang disetujui benar-benar yang diperiksa penyetuju.
 *  - Konten yang sudah dikirim tidak bisa dihapus siapa pun selain admin —
 *    jejak publikasi harus tetap ada.
 *  - Penyetuju tidak mengubah ISI konten; ia hanya memutuskan.
 */
export function bolehAksi(
  konten: KontenRingkas,
  saya: Saya,
  aksi: AksiKonten
): { boleh: true } | { boleh: false; alasan: string } {
  const admin = saya.peran === 'ADMIN';
  const pemilik = konten.pembuatId === saya.id;

  if (aksi === 'ubah') {
    if (admin) return { boleh: true };
    if (!pemilik) {
      return { boleh: false, alasan: 'Hanya pembuat konten yang dapat mengubah isinya.' };
    }
    if (!bisaDiubah(konten.status)) {
      return {
        boleh: false,
        alasan:
          'Konten yang sedang menunggu persetujuan, sudah disetujui, atau sudah dikirim tidak dapat diubah. Tarik pengajuan atau minta revisi terlebih dahulu.',
      };
    }
    return { boleh: true };
  }

  // ==== hapus ====
  if (admin) return { boleh: true };
  if (!pemilik) {
    return { boleh: false, alasan: 'Hanya pembuat konten yang dapat menghapusnya.' };
  }
  if (!bisaDiubah(konten.status)) {
    return {
      boleh: false,
      alasan:
        'Konten yang sudah diajukan atau dikirim tidak dapat dihapus — arsipkan agar jejaknya tetap terlacak.',
    };
  }
  return { boleh: true };
}

/**
 * Penentu peran dalam konteks transisi status.
 *
 * Penting: pembuat konten SELALU dihitung sebagai PEMILIK (walau ia kebetulan
 * berperan penyetuju), supaya aturan "tidak boleh menyetujui konten sendiri"
 * berlaku untuk semua orang — termasuk admin.
 */
export function peranTransisi(
  konten: KontenRingkas,
  saya: Saya
): 'PEMILIK' | 'PENYETUJU' {
  if (konten.pembuatId === saya.id) return 'PEMILIK';
  if (!boleh(saya.peran, 'setujui_konten')) return 'PEMILIK';
  // kalau penyetuju sudah dikunci saat pengajuan, hanya dia yang sah
  if (konten.penyetujuId && konten.penyetujuId !== saya.id) return 'PEMILIK';
  return 'PENYETUJU';
}

/** Saringan daftar konten menurut cakupan — ditulis sekali, dipakai di mana-mana. */
export function whereCakupan(saya: Saya) {
  if (boleh(saya.peran, 'lihat_semua_konten')) return {};
  return { OR: [{ pembuatId: saya.id }, { penyetujuId: saya.id }] };
}
