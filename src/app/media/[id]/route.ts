import { NextRequest, NextResponse } from 'next/server';
import { penggunaDariSesi } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { bolehLihat } from '@/lib/konten/akses';
import { cariBerkasKonten } from '@/lib/konten/sajikan-media';
import type { Status } from '@/lib/konten/status';

/**
 * THUMBNAIL: berkas PERTAMA (urutan 0) milik sebuah konten.
 *
 * Dipakai kartu di daftar konten, dasbor, dan halaman persetujuan — satu
 * permintaan saja cukup untuk menampilkan kartunya.
 *
 * Route ini SENGAJA TIDAK menerima token sekali-pakai. Tautan bertoken ada di
 * /media/{kontenId}/{mediaId}; kalau token juga diterima di sini, satu tautan
 * bocor cukup untuk menarik berkas mana pun dengan menebak id kontennya.
 *
 * Konsekuensinya: permintaan dari platform ke rute ini selalu ditolak, dan itu
 * memang benar — platform hanya diberi tautan berkas bertoken.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) return new NextResponse(null, { status: 401 });

  const { id } = await ctx.params;

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

  return cariBerkasKonten(id, undefined, {
    cache: 'private, max-age=300',
    catatDilihat: true,
  });
}
