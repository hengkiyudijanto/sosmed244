/**
 * Konfigurasi modus pengiriman.
 *
 * Dibaca dari BERKAS, bukan dari kolom database dan bukan dari env:
 *  - Berkas bisa diubah TANPA build ulang (cukup simpan, muat ulang halaman).
 *  - Token tidak ikut ter-backup/ter-ekspor bersama dump database.
 *
 * Lokasi: config/sosmed.json (sudah masuk .gitignore).
 *
 * CATATAN PENTING soal Vercel: filesystem-nya bersifat sementara, jadi berkas
 * ini HANYA ada kalau ikut ter-deploy. Untuk menghindari berkas rahasia ikut
 * git (dan ikut ter-bundle), kredensial boleh juga ditaruh di environment
 * variable — lihat `bacaKonfig` di bawah: env dipakai sebagai SUMBER CADANGAN
 * kalau berkasnya tidak ada, dan berkas selalu menang kalau ada.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { KonfigSosmed } from './penerbit';

const LOKASI = path.join(process.cwd(), 'config', 'sosmed.json');

/** Isi awal kalau berkas belum ada: simulasi penuh, aman dijalankan siapa pun. */
const BAWAAN: KonfigSosmed = { modus: 'mock' };

/**
 * Baca kredensial dari environment variable.
 *
 * Dipakai kalau config/sosmed.json tidak ada (mis. di Vercel). Nama variabelnya
 * sengaja sama dengan kunci di berkas supaya tidak ada dua daftar yang harus
 * diingat: `SOSMED_MODUS`, `SOSMED_IG_USER_ID`, `SOSMED_IG_TOKEN`,
 * `SOSMED_IG_API_VERSI`, `SOSMED_TIKTOK_TOKEN`, `SOSMED_TIKTOK_MODE`.
 */
function dariEnv(): KonfigSosmed {
  const env = process.env;
  if (!env.SOSMED_MODUS && !env.SOSMED_IG_TOKEN && !env.SOSMED_TIKTOK_TOKEN) {
    return BAWAAN;
  }
  return {
    // apa pun isinya, hanya 'nyata' yang dianggap nyata — sisanya simulasi
    modus: env.SOSMED_MODUS === 'nyata' ? 'nyata' : 'mock',
    instagram: {
      igUserId: env.SOSMED_IG_USER_ID,
      accessToken: env.SOSMED_IG_TOKEN,
      apiVersi: env.SOSMED_IG_API_VERSI,
    },
    tiktok: {
      accessToken: env.SOSMED_TIKTOK_TOKEN,
      mode: env.SOSMED_TIKTOK_MODE === 'PUBLIK' ? 'PUBLIK' : 'DRAFT',
    },
  };
}

/** Dari mana konfigurasi ini dibaca — dipakai halaman pengaturan untuk jujur. */
export function sumberKonfig(): 'berkas' | 'env' | 'bawaan' {
  if (fs.existsSync(LOKASI)) return 'berkas';
  const env = process.env;
  if (env.SOSMED_MODUS || env.SOSMED_IG_TOKEN || env.SOSMED_TIKTOK_TOKEN) return 'env';
  return 'bawaan';
}

export function bacaKonfig(): KonfigSosmed {
  try {
    if (!fs.existsSync(LOKASI)) {
      // Di Vercel berkasnya memang tidak ikut ter-deploy; env jadi sumbernya.
      return dariEnv();
    }
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
    sumber: sumberKonfig(),
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

