/**
 * KAPAN TOKEN PERLU DIPERBARUI — fungsi murni, TANPA Prisma.
 *
 * Dipisah supaya bisa diuji tanpa database. Salah di sini akibatnya jelas:
 * memperbarui terlalu lambat = pengiriman gagal dengan 401; terlalu sering =
 * permintaan pembaruan yang tidak perlu, dan TikTok MEMBATALKAN refresh token
 * lama setiap kali diperbarui, jadi percobaan yang gagal di tengah bisa
 * membuat token yang masih sehat justru mati.
 *
 * Masa berlaku menurut dokumentasi platform:
 *   Instagram (long-lived user token) : 60 hari
 *   TikTok access token               : 24 jam
 *   TikTok refresh token              : 365 hari
 */

/** Perbarui kalau sisa masa berlaku tinggal sekian persen atau kurang. */
export const AMBANG_SISA_PERSEN = 20;

/** Jangan pernah memperbarui kalau token baru berumur kurang dari ini (jam). */
export const MIN_UMUR_SEBELUM_PERBARUI_JAM = 24;

export type StatusToken = {
  accessExpiresAt: Date | null;
  refreshExpiresAt?: Date | null;
  diperbaruiAt?: Date | null;
};

export type KeputusanPerbarui =
  | { perlu: false; alasan: string }
  | { perlu: true; alasan: string }
  | { perlu: false; alasan: string; tidakBisa: string };

/**
 * Apakah token ini perlu diperbarui sekarang?
 *
 * Aturannya sengaja konservatif: kalau masa berlakunya TIDAK DIKETAHUI, token
 * TIDAK diperbarui. Memperbarui tanpa tahu sisa waktunya berisiko membuang
 * token yang masih panjang umurnya — dan pada TikTok, refresh token lama
 * langsung tidak berlaku begitu yang baru diterbitkan.
 */
export function perluPerbarui(
  status: StatusToken,
  sekarang: Date = new Date()
): KeputusanPerbarui {
  if (!status.accessExpiresAt) {
    return {
      perlu: false,
      alasan:
        'Masa berlaku token tidak diketahui (token diisi manual, tanpa info kedaluwarsa).',
      tidakBisa:
        'Isi masa berlaku token saat menyimpannya supaya pembaruan otomatis bisa bekerja.',
    };
  }

  const totalDetik = 60 * 60 * 24 * 60; // 60 hari sebagai acuan masa berlaku penuh
  const sisaDetik = (status.accessExpiresAt.getTime() - sekarang.getTime()) / 1000;

  if (sisaDetik <= 0) {
    return {
      perlu: false,
      alasan: 'Token SUDAH kedaluwarsa.',
      tidakBisa:
        'Token kedaluwarsa tidak bisa diperbarui otomatis — perbarui lewat alur otorisasi platform, lalu simpan lagi.',
    };
  }

  // Sudah pernah diperbarui dalam 24 jam terakhir? Jangan ulangi.
  if (status.diperbaruiAt) {
    const umurJam = (sekarang.getTime() - status.diperbaruiAt.getTime()) / 3600_000;
    if (umurJam < MIN_UMUR_SEBELUM_PERBARUI_JAM) {
      return {
        perlu: false,
        alasan: `Baru diperbarui ${Math.round(umurJam)} jam lalu — belum perlu diulang.`,
      };
    }
  }

  const sisaPersen = (sisaDetik / totalDetik) * 100;
  if (sisaPersen > AMBANG_SISA_PERSEN) {
    return {
      perlu: false,
      alasan: `Sisa masa berlaku masih ${sisaPersen.toFixed(0)}% (di atas ambang ${AMBANG_SISA_PERSEN}%).`,
    };
  }

  // TikTok: refresh token yang sudah lewat tidak bisa dipakai memperbarui apa pun.
  if (
    status.refreshExpiresAt &&
    status.refreshExpiresAt.getTime() <= sekarang.getTime()
  ) {
    return {
      perlu: false,
      alasan: 'Access token menipis, tetapi REFRESH token sudah kedaluwarsa.',
      tidakBisa:
        'Refresh token sudah lewat masa berlakunya — perlu otorisasi ulang dari akun platform.',
    };
  }

  return {
    perlu: true,
    alasan: `Sisa masa berlaku ${sisaPersen.toFixed(0)}% (≤ ambang ${AMBANG_SISA_PERSEN}%) — diperbarui sekarang supaya tidak terputus.`,
  };
}

/** Rangkuman sisa waktu untuk ditampilkan di halaman pengaturan. */
export function rangkumSisa(
  accessExpiresAt: Date | null | undefined,
  sekarang: Date = new Date()
): { teks: string; mendesak: boolean; lewat: boolean } {
  if (!accessExpiresAt) return { teks: 'tidak diketahui', mendesak: false, lewat: false };

  const sisaJam = (accessExpiresAt.getTime() - sekarang.getTime()) / 3600_000;
  if (sisaJam <= 0) return { teks: 'sudah kedaluwarsa', mendesak: true, lewat: true };
  if (sisaJam < 48) return { teks: `${Math.round(sisaJam)} jam lagi`, mendesak: true, lewat: false };
  return { teks: `${Math.round(sisaJam / 24)} hari lagi`, mendesak: false, lewat: false };
}
