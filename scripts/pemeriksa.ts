/**
 * PEMERIKSA KESEHATAN sosmed244 — mencetak HANYA bila ada masalah.
 *
 * Dipanggil oleh scripts/periksa-kesehatan.sh (yang dijalankan cron Hermes).
 * Keluaran kosong = sehat = tidak ada pesan yang dikirim ke pengguna.
 *
 * Kenapa begini: pemeriksa yang selalu melapor akan diabaikan lama-lama.
 * Yang berguna adalah pemberitahuan yang hanya muncul saat memang ada yang
 * perlu ditindak.
 *
 * Yang diperiksa — diurutkan dari yang paling berbahaya:
 *   1. Token IG HILANG dari database  -> SEMUA pengiriman (termasuk manual) mati
 *   2. Token ada tapi DITOLAK Meta    -> sama bahayanya, tapi ketahuan lebih awal
 *   3. Penjadwal luar berhenti        -> konten terjadwal & pembaruan token mati
 *   4. Konten terjadwal menggantung   -> ada pekerjaan yang tak terselesaikan
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const p = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)!,
  }),
});

/** Batas umur jejak penjadwal sebelum dianggap berhenti (jam). */
const BATAS_JADWAL_JAM = 24;
/** Konten terjadwal yang lewat lebih dari ini dianggap menggantung (jam). */
const BATAS_MENGGANTUNG_JAM = 24;

const masalah: string[] = [];
const JAM = 3600_000;

async function main() {
  const token = await p.tokenPlatform.findUnique({ where: { platform: 'INSTAGRAM' } });

  // ===== 1. Token ada di database? =====
  if (!token?.accessToken) {
    masalah.push(
      '🔴 *Token Instagram HILANG dari database.*\n' +
        '   Semua pengiriman — manual maupun terjadwal — akan gagal.\n' +
        '   Perlu ambil token baru lewat Graph API Explorer.'
    );
  } else {
    // ===== 2. Token masih diterima Meta? =====
    // Membaca saja, tidak mengirim apa pun.
    //
    // CATATAN PENTING: `debug_token` TIDAK bisa dipakai di sini. Untuk Page
    // Access Token, endpoint itu menuntut app access token (atau user token
    // pemilik app), sehingga token yang SEHAT pun dilaporkan ditolak dengan
    // "(#100) You must provide an app access token..." — peringatan palsu.
    //
    // Yang benar: panggil ID halaman dengan token itu sendiri. Kalau token
    // diterima, jawabannya berisi nama halaman. Ini endpoint yang sama dengan
    // yang dipakai jalur pengiriman, jadi hasilnya mewakili kenyataan.
    try {
      const u = new URL('https://graph.facebook.com/v26.0/me');
      u.searchParams.set('fields', 'id,name,instagram_business_account{id,username}');
      u.searchParams.set('access_token', token.accessToken);
      const r = await fetch(u, { signal: AbortSignal.timeout(20_000) });
      const j = (await r.json().catch(() => ({}))) as {
        id?: string;
        name?: string;
        instagram_business_account?: { id?: string; username?: string };
        error?: { message?: string; code?: number };
      };
      if (!r.ok || j.error || !j.id) {
        masalah.push(
          '🔴 *Token Instagram DITOLAK Meta.*\n' +
            `   Sebab: ${j.error?.message ?? `HTTP ${r.status}`}\n` +
            '   Semua pengiriman — manual maupun terjadwal — akan gagal\n' +
            '   sampai token diganti.'
        );
      } else if (!j.instagram_business_account?.id) {
        masalah.push(
          '🟠 *Token diterima, tetapi akun Instagram tidak terbaca.*\n' +
            `   Halaman: ${j.name ?? '?'}\n` +
            '   Kemungkinan akun IG tidak lagi tertaut ke halaman itu.'
        );
      }
    } catch (e) {
      masalah.push(
        '🟡 *Tidak bisa menghubungi Meta untuk memeriksa token.*\n' +
          `   ${e instanceof Error ? e.message : 'kesalahan jaringan'}\n` +
          '   Bisa jadi hanya gangguan sesaat — akan diperiksa lagi nanti.'
      );
    }
  }

  // Riwayat galat pembaruan token juga penting: pembaru yang gagal berulang
  // berarti token lama masih dipakai dan cepat atau lambat akan habis.
  if (token?.galatTerakhir) {
    masalah.push(
      '🟡 *Pembaruan token terakhir GAGAL.*\n' +
        `   Catatan: ${token.galatTerakhir.slice(0, 200)}`
    );
  }

  // ===== 3. Penjadwal luar masih mengetuk? =====
  const sistem = await p.pengguna.findUnique({
    where: { email: 'sistem@sosmed244.local' },
    select: { id: true },
  });
  const jejakTerakhir = sistem
    ? await p.keputusan.findFirst({
        where: { olehId: sistem.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
    : null;

  /**
   * CATATAN PENTING — kenapa ketiadaan jejak TIDAK dijadikan alarm.
   *
   * Endpoint yang tidak punya pekerjaan menjawab 200 TANPA menulis jejak apa
   * pun. Pada aplikasi ini kirim terjadwal jarang dipakai, jadi penjadwal yang
   * SEHAT pun akan berhari-hari tidak meninggalkan jejak. Menjadikannya alarm
   * akan menghasilkan peringatan palsu terus-menerus — dan peringatan yang
   * sering salah akhirnya diabaikan, yang justru lebih berbahaya daripada tidak
   * ada peringatan sama sekali.
   *
   * Yang benar-benar bisa memberi tahu apakah penjadwal masih mengetuk adalah
   * cron-job.orgnya sendiri (notifikasi kegagalan di akun itu). Di sini kita
   * hanya melapor bila ada pekerjaan yang JELAS tidak terselesaikan, yaitu
   * konten terjadwal yang menggantung (bagian 4).
   */
  if (jejakTerakhir) {
    const umurJam = (Date.now() - jejakTerakhir.createdAt.getTime()) / JAM;
    // Hanya dilaporkan bila ada pekerjaan terjadwal yang seharusnya jalan.
    const menunggu = await p.konten.count({ where: { status: 'DIJADWALKAN' } });
    if (menunggu > 0 && umurJam > BATAS_JADWAL_JAM) {
      masalah.push(
        `🟠 *Ada ${menunggu} konten terjadwal, tetapi tidak ada aktivitas pengiriman\n` +
          `   terjadwal selama ${umurJam.toFixed(1)} jam.*\n` +
          '   Kemungkinan penjadwal luar (cron-job.org) berhenti.\n' +
          '   Periksa dashboard cron-job.org.'
      );
    }
  }

  // ===== 4. Konten terjadwal menggantung? =====
  // INILAH alarm yang sebenarnya untuk "penjadwal berhenti": kalau penjadwal
  // mati, konten terjadwal pasti menggantung — jadi memeriksa keadaan DATA
  // lebih andal daripada menebak dari ada/tidaknya jejak.
  const menggantung = await p.konten.findMany({
    where: {
      status: 'DIJADWALKAN',
      jadwalAt: { lt: new Date(Date.now() - BATAS_MENGGANTUNG_JAM * JAM) },
    },
    select: { judul: true, jadwalAt: true },
    take: 5,
  });
  if (menggantung.length > 0) {
    const daftar = menggantung
      .map((k) => `   • ${k.judul} (jadwal ${k.jadwalAt?.toISOString().slice(0, 16)})`)
      .join('\n');
    masalah.push(
      `🟠 *${menggantung.length} konten terjadwal lewat lebih dari ${BATAS_MENGGANTUNG_JAM} jam:*\n` +
        `${daftar}\n   Periksa di halaman Konten.`
    );
  }

  // Keluaran hanya bila ada masalah.
  if (masalah.length > 0) {
    console.log(masalah.join('\n\n'));
  }
}

main()
  .catch((e) => {
    console.log(`🟡 *Pemeriksa kesehatan gagal berjalan.*\n   ${e instanceof Error ? e.message : e}`);
  })
  .finally(() => p.$disconnect());
