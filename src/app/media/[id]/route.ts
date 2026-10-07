import { NextRequest, NextResponse } from 'next/server';
import { penggunaDariSesi } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { bolehLihat } from '@/lib/konten/akses';
import type { Status } from '@/lib/konten/status';

/**
 * Menyajikan berkas media sebagai respons tersendiri (bukan data URL di HTML).
 *
 * Dua alasan route ini harus ada:
 *  1. Berkas bisa sampai 20 MB. Kalau ditanam di HTML, berkas itu ikut terkirim
 *     setiap kali halaman dibuka. Dengan route ini peramban meng-cache-nya.
 *  2. API TikTok/Instagram meminta URL PUBLIK. Route inilah URL yang dipakai
 *     adapter pengiriman.
 *
 * DUA bentuk alamat:
 *   /media/{kontenId}            -> berkas PERTAMA (urutan 0), untuk thumbnail
 *   /media/{kontenId}/{mediaId}  -> berkas tertentu (carousel & story berderet)
 *
 * CATATAN KEAMANAN (belum selesai untuk produksi): saat ini berkas hanya bisa
 * diambil oleh pengguna yang sudah masuk. Platform TIDAK punya sesi, jadi untuk
 * pengiriman nyata route ini perlu menerima token sekali-pakai berumur pendek
 * khusus pengiriman. Lihat catatan di halaman /pengaturan.
 */

// 'private' karena isinya hanya untuk pengguna aplikasi, bukan untuk umum.
const CACHE = 'private, max-age=300';

const POLA = /^data:(image\/(?:jpeg|png|webp)|video\/(?:mp4|quicktime|webm));base64,([\s\S]+)$/;

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; mediaId?: string }> }
) {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) return new NextResponse(null, { status: 401 });

  const { id, mediaId } = await ctx.params;

  const konten = await prisma.konten.findUnique({
    where: { id },
    select: { pembuatId: true, penyetujuId: true, status: true },
  });
  if (!konten) return new NextResponse(null, { status: 404 });

  const izin = bolehLihat(
    {
      pembuatId: konten.pembuatId,
      penyetujuId: konten.penyetujuId,
      status: konten.status as Status,
    },
    { id: pengguna.id, peran: pengguna.peran }
  );
  if (!izin) return new NextResponse(null, { status: 403 });

  // Tanpa mediaId: berkas pertama. Ini yang dipakai thumbnail daftar/dasbor,
  // jadi satu permintaan saja sudah cukup untuk menampilkan kartu konten.
  const berkas = await prisma.media.findFirst({
    where: mediaId ? { id: mediaId, kontenId: id } : { kontenId: id },
    orderBy: { urutan: 'asc' },
    select: { id: true, data: true, mime: true },
  });
  if (!berkas) return new NextResponse(null, { status: 404 });

  const cocok = POLA.exec(berkas.data);
  if (!cocok) return new NextResponse(null, { status: 422 });

  const isi = Buffer.from(cocok[2], 'base64');
  const contentType = cocok[1] || berkas.mime || 'application/octet-stream';

  // Catat berapa kali berkas dibaca — dipakai untuk memutuskan kapan pindah ke
  // object storage. Kegagalan mencatat tidak boleh menggagalkan pengiriman berkas.
  // Dihitung per BERKAS (carousel 10 item = 10 pembacaan) DAN di konten sebagai
  // ringkasan, supaya halaman pengaturan tidak perlu menjumlahkan tiap baris.
  prisma.media
    .update({ where: { id: berkas.id }, data: { dilihat: { increment: 1 } } })
    .catch(() => {});
  prisma.konten
    .update({ where: { id }, data: { mediaDilihat: { increment: 1 } } })
    .catch(() => {});

  return new NextResponse(new Uint8Array(isi), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(isi.length),
      'Cache-Control': CACHE,
    },
  });
}
