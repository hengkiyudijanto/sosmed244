import { NextRequest, NextResponse } from 'next/server';
import { penggunaDariSesi } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { bolehLihat } from '@/lib/konten/akses';
import { pakaiTokenMedia } from '@/lib/konten/token-media';
import { cariBerkasKonten } from '@/lib/konten/sajikan-media';
import type { Status } from '@/lib/konten/status';

/**
 * SATU BERKAS MEDIA milik sebuah konten — berkas tertentu, bukan yang pertama.
 *
 * Route ini melayani DUA hal:
 *  1. Halaman aplikasi (carousel & story berderet) — lewat SESI pengguna.
 *  2. PLATFORM (TikTok/Instagram) yang menarik berkas dari URL publik — lewat
 *     TOKEN sekali-pakai `?t=…`, karena platform tidak punya sesi.
 *
 * Kenapa thumbnail TIDAK di sini: lihat /media/{kontenId}. Tautan bertoken
 * sengaja hanya berlaku untuk berkas tertentu, supaya satu tautan bocor tidak
 * cukup untuk menarik berkas lain dengan menebak id kontennya.
 *
 * Token tidak membuka pintu umum: ia terikat pada SATU berkas, berumur pendek,
 * dan dibatasi jumlah pemakaian (lihat src/lib/konten/token-media.ts).
 */

// Respons dengan token TIDAK boleh di-cache bersama: token yang sudah habis
// tidak boleh tetap dilayani dari cache setelah masa berlakunya lewat.
const CACHE_SESI = 'private, max-age=300';
const CACHE_TOKEN = 'private, no-store';

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; mediaId: string }> }
) {
  const { id, mediaId } = await ctx.params;
  const token = request.nextUrl.searchParams.get('t');

  if (token) {
    // ==== jalur TOKEN (untuk platform) ====
    const hasil = await pakaiTokenMedia(token, { mediaId, kontenId: id });
    if (!hasil.sah) {
      return new NextResponse(
        hasil.alasan === 'kedaluwarsa'
          ? 'Tautan berkas sudah kedaluwarsa. Kirim ulang konten untuk membuat tautan baru.'
          : null,
        { status: hasil.alasan === 'habis' ? 410 : 401 }
      );
    }

    // Pembacaan oleh platform bukan "dilihat orang": jangan cemari statistik
    // yang dipakai memutuskan kapan pindah ke object storage.
    return cariBerkasKonten(id, mediaId, { cache: CACHE_TOKEN, catatDilihat: false });
  }

  // ==== jalur SESI (untuk pengguna aplikasi) ====
  const pengguna = await penggunaDariSesi();
  if (!pengguna) return new NextResponse(null, { status: 401 });

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

  return cariBerkasKonten(id, mediaId, { cache: CACHE_SESI, catatDilihat: true });
}
