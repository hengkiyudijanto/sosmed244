import fs from 'node:fs';
import path from 'node:path';
import type { KonfigSosmed } from './penerbit';

/**
 * Konfigurasi modus pengiriman.
 *
 * Dibaca dari BERKAS, bukan dari kolom database dan bukan dari env:
 *  - Berkas bisa diubah TANPA build ulang (cukup simpan, muat ulang halaman).
 *  - Token tidak ikut ter-backup/ter-ekspor bersama dump database.
 *
 * Lokasi: config/sosmed.json (sudah masuk .gitignore).
 */

const LOKASI = path.join(process.cwd(), 'config', 'sosmed.json');

/** Isi awal kalau berkas belum ada: simulasi penuh, aman dijalankan siapa pun. */
const BAWAAN: KonfigSosmed = { modus: 'mock' };

export function bacaKonfig(): KonfigSosmed {
  try {
    if (!fs.existsSync(LOKASI)) return BAWAAN;
    const isi = JSON.parse(fs.readFileSync(LOKASI, 'utf8')) as Partial<KonfigSosmed>;
    return {
      // apa pun isinya, hanya 'nyata' yang dianggap nyata — sisanya simulasi
      modus: isi.modus === 'nyata' ? 'nyata' : 'mock',
      instagram: isi.instagram,
      tiktok: isi.tiktok,
    };
  } catch (e) {
    console.error('[sosmed] gagal membaca config/sosmed.json:', e);
    // gagal baca = tetap simulasi; lebih baik tidak mengirim daripada salah kirim
    return BAWAAN;
  }
}

/**
 * Ringkasan untuk halaman pengaturan — TIDAK pernah memuat token.
 * Hanya menyatakan ada/tidak ada, panjangnya, dan 4 karakter pertama supaya
 * admin bisa memastikan token mana yang terpasang.
 */
export function ringkasKonfig() {
  const k = bacaKonfig();
  const potong = (s?: string) =>
    s ? { ada: true, panjang: s.length, awal: `${s.slice(0, 4)}…` } : { ada: false };

  return {
    modus: k.modus,
    lokasi: LOKASI,
    berkasAda: fs.existsSync(LOKASI),
    instagram: {
      igUserId: potong(k.instagram?.igUserId),
      accessToken: potong(k.instagram?.accessToken),
      apiVersi: k.instagram?.apiVersi ?? 'v21.0',
    },
    tiktok: {
      accessToken: potong(k.tiktok?.accessToken),
      mode: k.tiktok?.mode ?? 'DRAFT',
    },
  };
}
