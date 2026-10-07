/**
 * TOKEN SEKALI-PAKAI UNTUK BERKAS MEDIA.
 *
 * Masalah yang dipecahkan: TikTok & Instagram menarik berkas dari URL PUBLIK,
 * sedangkan route /media/[id] mengharuskan sesi login. Platform tidak punya sesi,
 * jadi permintaannya ditolak 401 dan pengiriman nyata tidak akan pernah berhasil.
 *
 * Kenapa TIDAK sekadar membuka route /media untuk umum: berkas konten organisasi
 * (termasuk yang masih draft dan belum disetujui) akan bisa diambil siapa pun
 * yang menebak id-nya. Id memang sulit ditebak (cuid), tetapi "sulit ditebak"
 * bukan pengamanan.
 *
 * Kenapa TIDAK memakai token yang sama untuk semua berkas satu konten: kalau
 * token itu bocor, seluruh berkas konten bisa diunduh. Di sini SATU TOKEN = SATU
 * BERKAS, jadi kebocoran paling banyak membuka satu berkas yang sudah disetujui.
 *
 * Cara kerja:
 *  1. Saat mengirim, server membuat satu token per berkas (fungsi `buatTokenMedia`).
 *  2. URL yang dikirim ke platform memuat token itu, bukan sesi.
 *  3. Route /media menerima `?t=<token>`, memeriksa hash + masa berlaku + sisa
 *     pemakaian, lalu menyajikan berkasnya tanpa sesi.
 *  4. Token kedaluwarsa cepat dan dibatasi jumlah pemakaian, lalu dibersihkan.
 */

import crypto from 'node:crypto';
import { prisma } from '@/lib/db';

/**
 * Umur token. Dipilih pendek dengan alasan: platform menarik berkas SEGERA
 * setelah permintaan kirim (hitungan detik sampai beberapa menit untuk video
 * berukuran besar). Token berumur panjang hanya menambah jendela penyalahgunaan
 * tanpa manfaat.
 */
export const UMUR_TOKEN_KIRIM_MENIT = 30;

/**
 * Berapa kali satu token boleh dipakai.
 *
 * Bukan 1: Instagram dan TikTok kadang mengambil berkas lebih dari sekali untuk
 * satu unggahan (pemeriksaan format, lalu pemrosesan sebenarnya). Kalau dibatasi
 * ketat 1, unggahan yang sebenarnya sehat bisa gagal karena pengambilan kedua.
 * Karena itu dibuat 2, dan TIDAK lebih — supaya token tidak bisa dipakai
 * berkeliling mengambil berkas berulang kali.
 */
export const MAKS_PAKAI_TOKEN = 2;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** URL publik satu berkas media, lengkap dengan token. */
export function urlBerkasPublik(input: {
  basisUrl: string;
  kontenId: string;
  mediaId: string;
  token: string;
  versi: number;
}): string {
  const basis = input.basisUrl.replace(/\/$/, '');
  return `${basis}/media/${input.kontenId}/${input.mediaId}?v=${input.versi}&t=${encodeURIComponent(
    input.token
  )}`;
}

export type TokenTerbuat = {
  mediaId: string;
  token: string;
  expiresAt: Date;
};

/**
 * Buat satu token untuk tiap berkas yang akan dikirim.
 *
 * Token mentah HANYA dikembalikan di sini dan tidak disimpan — yang tersimpan
 * adalah hash-nya. Jadi token tidak bisa dibaca lagi dari database.
 */
export async function buatTokenMedia(input: {
  kontenId: string;
  media: { id: string }[];
  umurMenit?: number;
}): Promise<TokenTerbuat[]> {
  const umur = input.umurMenit ?? UMUR_TOKEN_KIRIM_MENIT;
  const expiresAt = new Date(Date.now() + umur * 60 * 1000);

  // Bersihkan token kedaluwarsa milik konten ini lebih dulu, supaya tabel tidak
  // menumpuk sisa percobaan kirim yang gagal.
  await prisma.tokenMedia
    .deleteMany({ where: { kontenId: input.kontenId, expiresAt: { lt: new Date() } } })
    .catch(() => {});

  const hasil: TokenTerbuat[] = [];
  for (const m of input.media) {
    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.tokenMedia.create({
      data: {
        tokenHash: hashToken(token),
        mediaId: m.id,
        kontenId: input.kontenId,
        expiresAt,
        maksPakai: MAKS_PAKAI_TOKEN,
      },
    });
    hasil.push({ mediaId: m.id, token, expiresAt });
  }
  return hasil;
}

export type HasilPeriksa =
  | { sah: true; mediaId: string }
  | { sah: false; alasan: 'tidak_ada' | 'kedaluwarsa' | 'habis' };

/**
 * Periksa dan PAKAI token.
 *
 * Dipanggil route /media ketika ada parameter `t`. Mengembalikan mediaId yang
 * boleh disajikan, atau alasan penolakan.
 *
 * Penambahan `jumlahPakai` dilakukan dengan syarat `jumlahPakai < maksPakai` di
 * dalam WHERE — jadi dua permintaan bersamaan tidak bisa sama-sama lolos
 * melebihi batas (pola compare-and-swap, bukan baca-lalu-tulis).
 */
export async function pakaiTokenMedia(
  token: string,
  petunjuk?: { mediaId?: string; kontenId?: string }
): Promise<HasilPeriksa> {
  const tokenHash = hashToken(token);

  const data = await prisma.tokenMedia.findUnique({
    where: { tokenHash },
    select: { id: true, mediaId: true, kontenId: true, expiresAt: true, jumlahPakai: true, maksPakai: true },
  });

  if (!data) return { sah: false, alasan: 'tidak_ada' };
  if (data.expiresAt < new Date()) return { sah: false, alasan: 'kedaluwarsa' };

  // Token dikunci ke satu berkas: permintaan untuk berkas lain ditolak, walau
  // tokennya masih berlaku.
  if (petunjuk?.mediaId && data.mediaId !== petunjuk.mediaId) {
    return { sah: false, alasan: 'tidak_ada' };
  }
  if (petunjuk?.kontenId && data.kontenId !== petunjuk.kontenId) {
    return { sah: false, alasan: 'tidak_ada' };
  }

  const dipakai = await prisma.tokenMedia.updateMany({
    where: { id: data.id, jumlahPakai: { lt: data.maksPakai }, expiresAt: { gt: new Date() } },
    data: { jumlahPakai: { increment: 1 }, dipakaiAt: new Date() },
  });

  if (dipakai.count === 0) return { sah: false, alasan: 'habis' };
  return { sah: true, mediaId: data.mediaId };
}

/** Buang token kedaluwarsa (dipanggil dari halaman pengaturan / pemeliharaan). */
export async function bersihkanTokenKedaluwarsa(): Promise<number> {
  const hasil = await prisma.tokenMedia.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return hasil.count;
}

/** Ringkasan untuk halaman pengaturan — tidak pernah memuat token. */
export async function ringkasToken() {
  const [aktif, total, terpakai] = await Promise.all([
    prisma.tokenMedia.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.tokenMedia.count(),
    prisma.tokenMedia.count({ where: { jumlahPakai: { gt: 0 } } }),
  ]);
  return { aktif, total, terpakai, umurMenit: UMUR_TOKEN_KIRIM_MENIT, maksPakai: MAKS_PAKAI_TOKEN };
}
