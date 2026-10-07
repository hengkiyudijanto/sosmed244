/**
 * ANGKA & ATURAN WAKTU pengiriman terjadwal — fungsi murni, TANPA Prisma.
 *
 * Kenapa dipisah dari `jadwal.ts`: berkas itu menyentuh database, sehingga
 * mengimpornya di unit test menarik driver `pg` dan gagal tanpa `DATABASE_URL`.
 * Angka batas dan perhitungan waktu tidak butuh database, jadi tempatnya di
 * sini — dan bisa diuji cepat, tanpa server, tanpa mock.
 */

/** Berapa menit jadwal digeser ke depan setiap kali pengiriman gagal. */
export const JEDA_COBA_ULANG_MENIT = 5;

/**
 * Berapa kali percobaan sebelum jadwal dibatalkan.
 *
 * 4 percobaan × 5 menit = jendela sekitar 20 menit. Cukup untuk melewati
 * gangguan jaringan sesaat, tetapi tidak sampai mencoba berhari-hari.
 */
export const MAKS_PERCOBAAN = 4;

/**
 * Batas jumlah konten per pemanggilan.
 *
 * Cron Vercel dibatasi waktu eksekusi; mengirim puluhan konten (masing-masing
 * bisa mengunggah video) dalam satu pemanggilan akan dipotong di tengah jalan.
 * Sisanya diambil pemanggilan berikutnya.
 */
export const MAKS_PER_JALAN = 5;

/** Hitung jadwal berikutnya setelah percobaan gagal. */
export function jadwalCobaUlang(sekarang: Date, menit = JEDA_COBA_ULANG_MENIT): Date {
  return new Date(sekarang.getTime() + menit * 60 * 1000);
}

/** Akun yang mewakili SISTEM pada jejak keputusan (bukan manusia). */
export const EMAIL_SISTEM = 'sistem@sosmed244.local';
