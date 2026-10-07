/**
 * PENYAJIAN BERKAS MEDIA — satu tempat untuk mengambil isi berkas dari database
 * dan mengubahnya menjadi respons HTTP.
 *
 * Kenapa dipisah dari route: ada DUA route yang menyajikan berkas (thumbnail
 * per konten, dan berkas tertentu per id) dengan aturan izin yang berbeda.
 * Kalau parsing data URL, penentuan tipe isi, dan pencatatan statistik ditulis
 * dua kali, cepat atau lambat keduanya berbeda — dan perbedaan itu muncul
 * sebagai berkas yang tampil di satu halaman tetapi kosong di halaman lain.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/** Pola data URL yang diterima. Di luar ini dianggap berkas rusak. */
const POLA = /^data:(image\/(?:jpeg|png|webp)|video\/(?:mp4|quicktime|webm));base64,([\s\S]+)$/;

export type OpsiSajikan = {
  /** nilai header Cache-Control */
  cache: string;
  /**
   * Catat pembacaan untuk statistik pemakaian berkas?
   *
   * `false` untuk pembacaan oleh PLATFORM: yang dihitung adalah berapa kali
   * orang melihat berkas (dipakai memutuskan pindah ke object storage), dan
   * pengambilan otomatis oleh TikTok/Instagram bukan "dilihat orang".
   */
  catatDilihat: boolean;
};

/**
 * Ambil berkas (opsional satu berkas tertentu) milik konten, lalu kembalikan
 * sebagai respons. Mengembalikan 404 kalau berkasnya tidak ada, 422 kalau
 * isinya bukan data URL yang dikenali.
 */
export async function cariBerkasKonten(
  kontenId: string,
  mediaId: string | undefined,
  opsi: OpsiSajikan
): Promise<NextResponse> {
  const berkas = await prisma.media.findFirst({
    // tanpa mediaId: berkas pertama menurut urutan — itu yang dipakai thumbnail
    where: mediaId ? { id: mediaId, kontenId } : { kontenId },
    orderBy: { urutan: 'asc' },
    select: { id: true, data: true, mime: true },
  });
  if (!berkas) return new NextResponse(null, { status: 404 });

  const cocok = POLA.exec(berkas.data);
  if (!cocok) return new NextResponse(null, { status: 422 });

  const isi = Buffer.from(cocok[2], 'base64');
  const contentType = cocok[1] || berkas.mime || 'application/octet-stream';

  // Gagal mencatat TIDAK boleh menggagalkan penyajian berkas.
  if (opsi.catatDilihat) {
    prisma.media
      .update({ where: { id: berkas.id }, data: { dilihat: { increment: 1 } } })
      .catch(() => {});
    prisma.konten
      .update({ where: { id: kontenId }, data: { mediaDilihat: { increment: 1 } } })
      .catch(() => {});
  }

  return new NextResponse(new Uint8Array(isi), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(isi.length),
      'Cache-Control': opsi.cache,
    },
  });
}
