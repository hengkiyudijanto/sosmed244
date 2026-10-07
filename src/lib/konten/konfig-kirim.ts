/**
 * Konfigurasi pengiriman SIAP PAKAI — gabungan kredensial tetap (berkas/env)
 * dengan token terbaru (database).
 *
 * Kenapa perlu lapisan ini: `bacaKonfig()` sengaja tidak menyentuh database
 * (dipakai juga oleh fungsi murni dan halaman yang harus bisa dirender tanpa
 * koneksi). Tetapi saat MENGIRIM, yang harus dipakai adalah token TERBARU —
 * hasil pembaruan otomatis, bukan token yang ditulis tangan berbulan lalu.
 *
 * Satu tempat untuk menggabungkannya, supaya tidak ada permukaan pengiriman
 * yang lupa memakai token terbaru. Kalau itu terjadi, gejalanya adalah
 * pengiriman yang gagal 401 hanya setelah token lewat masa berlaku.
 */

import { bacaKonfig } from './konfig';
import { bacaKredensial } from './token-platform';
import type { KonfigSosmed } from './penerbit';

export async function bacaKonfigSiapKirim(): Promise<KonfigSosmed> {
  const konfig = bacaKonfig();

  // Gagal membaca database TIDAK boleh menggagalkan pengiriman: token di
  // berkas/env mungkin masih berlaku, dan menolak mengirim karena gagal membaca
  // token terbaru justru lebih merugikan.
  try {
    const [ig, tt] = await Promise.all([
      bacaKredensial('INSTAGRAM'),
      bacaKredensial('TIKTOK'),
    ]);

    return {
      ...konfig,
      instagram: {
        igUserId: ig.igUserId,
        accessToken: ig.accessToken,
        apiVersi: ig.apiVersi,
      },
      tiktok: {
        accessToken: tt.accessToken,
        mode: tt.tiktokMode,
      },
      tokenTerbaru: {
        ...(ig.sumber === 'database' && ig.accessToken ? { INSTAGRAM: ig.accessToken } : {}),
        ...(tt.sumber === 'database' && tt.accessToken ? { TIKTOK: tt.accessToken } : {}),
      },
    };
  } catch (e) {
    console.error('[konfig] gagal membaca token terbaru dari database:', e);
    return konfig;
  }
}
