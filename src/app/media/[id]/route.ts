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
  ctx: { params: Promise<{ id: string }> }
) {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) return new NextResponse(null, { status: 401 });

  const { id } = await ctx.params;

  const konten = await prisma.konten.findUnique({
    where: { id },
    select: {
      mediaData: true,
      mediaMime: true,
      pembuatId: true,
      penyetujuId: true,
      status: true,
    },
  });
  if (!konten?.mediaData) return new NextResponse(null, { status: 404 });

  const izin = bolehLihat(
    {
      pembuatId: konten.pembuatId,
      penyetujuId: konten.penyetujuId,
      status: konten.status as Status,
    },
    { id: pengguna.id, peran: pengguna.peran }
  );
  if (!izin) return new NextResponse(null, { status: 403 });

  const cocok = POLA.exec(konten.mediaData);
  if (!cocok) return new NextResponse(null, { status: 422 });

  const isi = Buffer.from(cocok[2], 'base64');
  const contentType = cocok[1] || konten.mediaMime || 'application/octet-stream';

  // Catat berapa kali berkas dibaca — dipakai untuk memutuskan kapan pindah ke
  // object storage. Kegagalan mencatat tidak boleh menggagalkan pengiriman berkas.
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
