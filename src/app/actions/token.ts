'use server';

/**
 * Server action untuk kredensial platform: memperbarui token secara manual.
 *
 * Kenapa tombol manual perlu ada meski sudah otomatis: pembaruan otomatis
 * SENGAJA TIDAK BEKERJA untuk token yang tidak punya informasi masa berlaku
 * (token yang ditempel tangan). Tanpa tombol ini, pemilik aplikasi tidak punya
 * cara memperbarui selain membuka dokumentasi platform dan menyentuh database.
 *
 * Juga: kalau pembaruan otomatis gagal (mis. jaringan), tombol ini yang dipakai
 * mencoba lagi tanpa menunggu cron berikutnya — dan paket Hobby hanya punya
 * satu cron sehari.
 */

import { revalidatePath } from 'next/cache';
import { catatAudit, penggunaDariSesi } from '@/lib/auth';
import { wajibKemampuan } from '@/lib/konten/akses';
import { perbaruiTokenSekarang } from '@/lib/konten/token-platform';
import type { Platform } from '@/lib/konten/status';

export type HasilToken = { error?: string; sukses?: boolean; pesan?: string };

export async function perbaruiTokenPlatform(
  _sebelumnya: HasilToken,
  formData: FormData
): Promise<HasilToken> {
  const pengguna = await penggunaDariSesi();
  const tolak = wajibKemampuan(pengguna, 'kelola_pengaturan');
  if (tolak || !pengguna) return { error: tolak ?? 'Sesi habis.' };

  const platform = String(formData.get('platform') ?? '') as Platform;
  if (platform !== 'INSTAGRAM' && platform !== 'TIKTOK') {
    return { error: 'Platform tidak dikenal.' };
  }

  const hasil = await perbaruiTokenSekarang(platform);

  await catatAudit({
    penggunaId: pengguna.id,
    aksi: 'PERBARUI_TOKEN',
    entitas: 'TokenPlatform',
    entitasId: platform,
    dataBaru: { platform, berhasil: hasil.diperbarui, pesan: hasil.pesan },
  });

  revalidatePath('/pengaturan');

  if (hasil.diperbarui) {
    return { sukses: true, pesan: hasil.pesan };
  }
  // Pesannya sengaja diteruskan apa adanya: sebabnya bisa bermacam-macam
  // (client key belum diisi, refresh token belum ada, atau platform menolak),
  // dan menyamaratakan semuanya menjadi "gagal" membuat penyebabnya tak bisa
  // ditelusuri.
  return {
    error: hasil.galat ? `${hasil.pesan} (${hasil.galat})` : hasil.pesan,
  };
}
