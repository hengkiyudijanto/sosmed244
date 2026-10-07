/**
 * SIMPAN TOKEN PLATFORM hasil alur otorisasi, beserta masa berlakunya.
 *
 * Kenapa perlu skrip terpisah: halaman pengaturan hanya bisa MEMPERBARUI token
 * yang sudah punya masa berlaku. Token PERTAMA (dari alur OAuth platform) harus
 * masuk lewat sini, karena hanya pada saat itulah kita mengetahui
 * `expires_in` yang dikembalikan platform.
 *
 * Tanpa masa berlaku yang tersimpan, pembaruan otomatis SENGAJA tidak bekerja
 * (lihat token-umur.ts) — supaya token yang masih panjang umurnya tidak
 * terbuang, terutama pada TikTok yang membatalkan refresh token lama setiap
 * kali diperbarui.
 *
 * Pemakaian:
 *   # Instagram (long-lived user token; expires_in dari Meta, biasanya 5183944 detik ≈ 60 hari)
 *   pnpm exec tsx scripts/simpan-token.ts INSTAGRAM <access_token> <expires_detik>
 *
 *   # TikTok (dari alur OAuth; access 24 jam, refresh 365 hari)
 *   pnpm exec tsx scripts/simpan-token.ts TIKTOK <access_token> <expires_detik> <refresh_token> <refresh_expires_detik>
 *
 * CATATAN KEAMANAN: token yang diberikan lewat argumen akan terlihat di riwayat
 * shell. Jalankan di mesin yang Anda percayai, dan bersihkan riwayat setelahnya
 * (`history -c`) kalau perlu. Token TIDAK pernah dicetak ulang oleh skrip ini.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL tidak ada.');
  process.exit(1);
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function petunjuk() {
  console.error(
    [
      'Pemakaian:',
      '  pnpm exec tsx scripts/simpan-token.ts INSTAGRAM <access_token> <expires_detik>',
      '  pnpm exec tsx scripts/simpan-token.ts TIKTOK <access_token> <expires_detik> <refresh_token> <refresh_expires_detik>',
      '',
      'expires_detik adalah nilai "expires_in" dari respons platform.',
      'Untuk Instagram long-lived token nilainya sekitar 5183944 (60 hari).',
      'Untuk TikTok access token 86400 (24 jam) dan refresh token 31536000 (365 hari).',
    ].join('\n')
  );
}

async function main() {
  const [platform, accessToken, expiresDetik, refreshToken, refreshExpiresDetik] =
    process.argv.slice(2);

  if (platform !== 'INSTAGRAM' && platform !== 'TIKTOK') {
    console.error('❌ Platform harus INSTAGRAM atau TIKTOK.');
    petunjuk();
    process.exit(1);
  }
  if (!accessToken) {
    console.error('❌ access_token wajib diisi.');
    petunjuk();
    process.exit(1);
  }

  const sekarang = new Date();
  const accessExpiresAt = expiresDetik
    ? new Date(sekarang.getTime() + Number(expiresDetik) * 1000)
    : null;

  if (platform === 'TIKTOK' && !refreshToken) {
    console.error(
      '❌ TikTok butuh refresh_token: tanpa itu pembaruan otomatis tidak bisa bekerja\n' +
        '   (access token hanya berlaku 24 jam dan akan mati besok).'
    );
    petunjuk();
    process.exit(1);
  }

  const refreshExpiresAt = refreshExpiresDetik
    ? new Date(sekarang.getTime() + Number(refreshExpiresDetik) * 1000)
    : null;

  await prisma.tokenPlatform.upsert({
    where: { platform },
    create: {
      platform,
      accessToken,
      refreshToken: refreshToken || null,
      accessExpiresAt,
      refreshExpiresAt,
      diperbaruiAt: sekarang,
      galatTerakhir: null,
    },
    update: {
      accessToken,
      ...(refreshToken ? { refreshToken } : {}),
      accessExpiresAt,
      ...(refreshExpiresAt ? { refreshExpiresAt } : {}),
      diperbaruiAt: sekarang,
      galatTerakhir: null,
    },
  });

  // Yang dicetak TIDAK memuat token — hanya panjangnya, supaya bisa dipastikan
  // yang tersimpan memang token yang dimaksud.
  console.log(`✓ Token ${platform} tersimpan.`);
  console.log(`  panjang access token : ${accessToken.length} karakter`);
  if (refreshToken) console.log(`  panjang refresh token: ${refreshToken.length} karakter`);
  console.log(
    `  berlaku sampai       : ${accessExpiresAt ? accessExpiresAt.toLocaleString('id-ID') : '(tidak diketahui — pembaruan otomatis TIDAK akan bekerja)'}`
  );
  if (refreshExpiresAt) {
    console.log(`  refresh sampai       : ${refreshExpiresAt.toLocaleString('id-ID')}`);
  }

  if (!accessExpiresAt) {
    console.log(
      '\n⚠ Masa berlaku tidak diisi, jadi pembaruan otomatis tidak akan menyentuh token ini.\n' +
        '  Token tetap bisa dipakai mengirim, tetapi harus diperbarui manual lewat\n' +
        '  tombol "Perbarui token sekarang" di halaman Pengaturan.'
    );
  }

  // Ingatkan kalau masa berlakunya sangat pendek: itu tanda token yang dimasukkan
  // bukan long-lived token, dan pengiriman akan berhenti dalam hitungan jam.
  if (accessExpiresAt && platform === 'INSTAGRAM') {
    const jam = (accessExpiresAt.getTime() - sekarang.getTime()) / 3600_000;
    if (jam < 25) {
      console.log(
        `\n⚠ Token Instagram ini hanya berlaku ${Math.round(jam)} jam.\n` +
          '  Long-lived token seharusnya berlaku ~60 hari. Kemungkinan yang dimasukkan\n' +
          '  adalah short-lived token — tukar dulu lewat /access_token (grant_type=ig_exchange_token).'
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
