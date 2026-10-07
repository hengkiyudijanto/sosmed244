import { NextRequest, NextResponse } from 'next/server';
import { jalankanJadwal } from '@/lib/konten/jadwal';

/**
 * ENDPOINT CRON — dipanggil Vercel Cron (atau penjadwal apa pun) untuk
 * menjalankan konten yang jadwalnya sudah jatuh tempo.
 *
 * KEAMANAN: endpoint ini mengirim konten ke platform sosial, jadi tidak boleh
 * bisa dipicu siapa pun yang tahu alamatnya. Dua lapis:
 *
 *  1. `CRON_SECRET` — Vercel Cron mengirim header `Authorization: Bearer <isi
 *     CRON_SECRET>`. Kalau variabel ini TIDAK diisi, endpoint MENOLAK SEMUA
 *     permintaan: lebih baik jadwal tidak jalan daripada endpoint pengiriman
 *     terbuka untuk umum. (Jadi variabel ini wajib diisi sebelum mengaktifkan
 *     cron.)
 *  2. Perbandingan rahasia memakai waktu tetap, supaya panjang dan isi rahasia
 *     tidak bisa ditebak dari perbedaan waktu respons.
 *
 * Endpoint ini sengaja hanya menerima GET supaya cocok dengan Vercel Cron, dan
 * tidak menerima parameter apa pun dari pemanggil — yang menentukan siapa yang
 * dikirim adalah isi database (`status = DIJADWALKAN` dan `jadwalAt` sudah
 * lewat), bukan masukan dari luar.
 */

export const dynamic = 'force-dynamic';
// Pengiriman bisa mengunggah berkas; beri waktu lebih dari fungsi biasa.
export const maxDuration = 60;

/** Bandingkan dua string dengan waktu yang tidak bergantung isinya. */
function samaAman(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let beda = 0;
  for (let i = 0; i < a.length; i++) {
    beda |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return beda === 0;
}

export async function GET(request: NextRequest) {
  const rahasia = process.env.CRON_SECRET;

  if (!rahasia) {
    console.error(
      '[jadwal] CRON_SECRET belum diset — endpoint pengiriman terjadwal menolak semua permintaan. ' +
        'Isi CRON_SECRET di environment variable sebelum mengaktifkan cron.'
    );
    return NextResponse.json(
      {
        ok: false,
        pesan:
          'CRON_SECRET belum diset di server. Pengiriman terjadwal tidak dijalankan sampai variabel itu diisi.',
      },
      { status: 503 }
    );
  }

  const dikirim = request.headers.get('authorization') ?? '';
  const diharapkan = `Bearer ${rahasia}`;

  if (!samaAman(dikirim, diharapkan)) {
    // Tidak menjelaskan apa yang salah — hanya menolak.
    return NextResponse.json({ ok: false, pesan: 'Tidak berwenang.' }, { status: 401 });
  }

  try {
    const hasil = await jalankanJadwal();
    return NextResponse.json({ ok: true, ...hasil });
  } catch (e) {
    console.error('[jadwal] gagal menjalankan jadwal:', e);
    return NextResponse.json(
      {
        ok: false,
        pesan: e instanceof Error ? e.message : 'Kesalahan tidak dikenal saat menjalankan jadwal.',
      },
      { status: 500 }
    );
  }
}
