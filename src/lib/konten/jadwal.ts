/**
 * PENGIRIM TERJADWAL — menjalankan konten berstatus DIJADWALKAN yang waktunya
 * sudah tiba.
 *
 * Kenapa dipisah dari endpoint HTTP: seluruh keputusan (konten mana yang layak
 * dijalankan, apa yang terjadi kalau gagal, bagaimana mencegah pengiriman dua
 * kali) ada di berkas ini sebagai fungsi biasa. Endpoint hanya memanggilnya,
 * sehingga aturannya bisa diuji tanpa menyalakan server dan tanpa menunggu jam.
 *
 * ATURAN YANG DIPEGANG:
 *
 * 1. **Satu konten tidak boleh terkirim dua kali.** Worker bisa dipanggil
 *    bersamaan (cron berikutnya menyusul cron sebelumnya yang masih jalan).
 *    Karena itu pengambilan konten memakai `updateMany` dengan syarat status
 *    masih DIJADWALKAN — yang berhasil mengubah status itulah yang berhak
 *    mengirim. Pola compare-and-swap yang sama seperti token berkas.
 *
 * 2. **Kegagalan TIDAK menghapus jadwal.** Kalau platform menolak, jadwal
 *    digeser beberapa menit ke depan lalu dicoba lagi; konten tetap
 *    DIJADWALKAN dan `jadwalAt` diperbarui, supaya pengguna bisa melihat
 *    "dijadwalkan ulang setelah gagal" alih-alih kegagalan yang hilang diam.
 *
 * 3. **Batas percobaan.** Setelah sekian kali gagal berturut-turut, jadwal
 *    DIBATALKAN dan konten kembali ke DISETUJUI dengan catatan yang menjelaskan
 *    sebabnya. Tanpa batas ini, satu konten yang selalu ditolak platform akan
 *    dicoba selamanya setiap kali cron berjalan.
 *
 * 4. **Satu konten gagal tidak menghentikan sisanya.** Setiap konten dibungkus
 *    try/catch sendiri.
 */

import { prisma } from '@/lib/db';
import { catatAudit } from '@/lib/auth';
import { periksaKelayakan, type JenisPosting, type Tujuan } from './status';
import { bacaKonfigSiapKirim } from './konfig-kirim';
import { buatTokenMedia, urlBerkasPublik } from './token-media';
import { kirimKePlatform, type BerkasKirim, type HasilPlatform } from './penerbit';
// Angka batas & perhitungan waktu dipisah ke modul murni supaya bisa diuji
// tanpa menyentuh database. Diekspor ulang di sini agar pemanggil cukup
// mengimpor dari satu tempat.
import {
  JEDA_COBA_ULANG_MENIT,
  MAKS_PERCOBAAN,
  MAKS_PER_JALAN,
  jadwalCobaUlang,
  EMAIL_SISTEM,
} from './jadwal-angka';

export { JEDA_COBA_ULANG_MENIT, MAKS_PERCOBAAN, MAKS_PER_JALAN, jadwalCobaUlang };

export type HasilSatuJadwal = {
  kontenId: string;
  judul: string;
  hasil: 'terkirim' | 'gagal_dicoba_ulang' | 'dibatalkan';
  pesan: string;
};

export type HasilJalan = {
  dipertimbangkan: number;
  terkirim: number;
  gagal: number;
  dibatalkan: number;
  rincian: HasilSatuJadwal[];
  modus: 'mock' | 'nyata';
};

/** Berapa kali percobaan sudah dilakukan (dibaca dari jejak keputusan). */
export async function hitungPercobaan(kontenId: string): Promise<number> {
  return prisma.keputusan.count({
    where: { kontenId, aksi: 'KIRIM_OTOMATIS_GAGAL' },
  });
}

/**
 * Jalankan semua jadwal yang jatuh tempo.
 *
 * `sekarang` bisa diberikan supaya perilakunya bisa diuji tanpa menunggu jam.
 */
export async function jalankanJadwal(
  sekarang: Date = new Date(),
  konfig?: Awaited<ReturnType<typeof bacaKonfigSiapKirim>>
): Promise<HasilJalan> {
  // Dibaca di dalam fungsi, bukan sebagai nilai bawaan parameter: pembacaan
  // token terbaru menyentuh database dan harus berurutan, bukan saat pemanggilan.
  const konfigSiapKirim = konfig ?? (await bacaKonfigSiapKirim());
  const jatuhTempo = await prisma.konten.findMany({
    where: {
      status: 'DIJADWALKAN',
      jadwalAt: { not: null, lte: sekarang },
    },
    select: { id: true, judul: true, jadwalAt: true },
    orderBy: { jadwalAt: 'asc' },
    take: MAKS_PER_JALAN,
  });

  const ringkas: HasilJalan = {
    dipertimbangkan: jatuhTempo.length,
    terkirim: 0,
    gagal: 0,
    dibatalkan: 0,
    rincian: [],
    modus: konfigSiapKirim.modus,
  };

  // Nama variabel sengaja berbeda dari konfigurasi: `konfigSiapKirim` untuk
  // kredensial, `jadwal` untuk konten yang sedang diproses.
  for (const jadwal of jatuhTempo) {
    try {
      const hasil = await kirimSatu(jadwal.id, sekarang, konfigSiapKirim);
      ringkas.rincian.push(hasil);
      if (hasil.hasil === 'terkirim') ringkas.terkirim++;
      else if (hasil.hasil === 'gagal_dicoba_ulang') ringkas.gagal++;
      else ringkas.dibatalkan++;
    } catch (e) {
      // satu konten bermasalah tidak boleh menghentikan sisanya
      console.error(`[jadwal] konten ${jadwal.id} gagal diproses:`, e);
      ringkas.gagal++;
      ringkas.rincian.push({
        kontenId: jadwal.id,
        judul: jadwal.judul,
        hasil: 'gagal_dicoba_ulang',
        pesan: e instanceof Error ? e.message : 'kesalahan tidak dikenal',
      });
    }
  }

  return ringkas;
}

/**
 * Kirim satu konten terjadwal.
 *
 * Langkah pertamanya adalah MENGUNCI konten dengan mengubah statusnya dari
 * DIJADWALKAN. Kalau ada pemanggilan lain yang lebih dulu, `updateMany` di sini
 * tidak mengubah baris apa pun dan fungsi ini berhenti — jadi konten tidak
 * mungkin terkirim dua kali walau cron jalan bersamaan.
 */
async function kirimSatu(
  kontenId: string,
  sekarang: Date,
  konfig: Awaited<ReturnType<typeof bacaKonfigSiapKirim>>
): Promise<HasilSatuJadwal> {
  const kunci = await prisma.konten.updateMany({
    where: { id: kontenId, status: 'DIJADWALKAN' },
    data: { status: 'DIKIRIM' }, // sementara: menandai "sedang diproses worker"
  });

  if (kunci.count === 0) {
    return {
      kontenId,
      judul: '(sedang diproses pemanggilan lain)',
      hasil: 'gagal_dicoba_ulang',
      pesan: 'Dilewati: pengiriman konten ini sedang berjalan.',
    };
  }

  const konten = await prisma.konten.findUnique({
    where: { id: kontenId },
    select: {
      id: true,
      judul: true,
      caption: true,
      tujuan: true,
      jenisPosting: true,
      status: true,
      terkirimAt: true,
      media: {
        select: { id: true, jenis: true, mime: true, byte: true, durasiDetik: true, versi: true },
        orderBy: { urutan: 'asc' },
      },
    },
  });

  if (!konten) {
    return { kontenId, judul: '(tidak ditemukan)', hasil: 'gagal_dicoba_ulang', pesan: 'Konten hilang.' };
  }

  // ==== kelayakan: dievaluasi ULANG saat jatuh tempo ====
  // Berkas bisa berubah setelah dijadwalkan; mengirim apa adanya tanpa periksa
  // ulang membuat platform yang menolaknya, dengan pesan yang lebih buruk.
  const masalah = periksaKelayakan({
    tujuan: konten.tujuan as Tujuan,
    jenisPosting: konten.jenisPosting as JenisPosting,
    caption: konten.caption,
    berkas: konten.media.map((m) => ({
      jenis: m.jenis,
      mime: m.mime,
      ukuranByte: m.byte,
      durasiDetik: m.durasiDetik,
    })),
  }).filter((m) => !/akan diabaikan/i.test(m.pesan));

  if (konten.media.length === 0 || masalah.length > 0) {
    const sebab =
      konten.media.length === 0
        ? 'Konten tidak punya berkas.'
        : `${masalah[0].platform}: ${masalah[0].pesan}`;

    // Kelengkapan isi BUKAN gangguan sesaat — mencoba ulang tidak akan menolong.
    // Jadi jadwalnya dibatalkan dan konten dikembalikan ke DISETUJUI.
    await prisma.konten.update({
      where: { id: kontenId },
      data: { status: 'DISETUJUI', jadwalAt: null },
    });
    await prisma.keputusan.create({
      data: {
        kontenId,
        aksi: 'JADWAL_DIBATALKAN',
        olehId: await idSistem(),
        catatan: `Jadwal dibatalkan otomatis: ${sebab} Perbaiki isinya lalu jadwalkan ulang.`,
      },
    });
    await catatAudit({
      penggunaId: await idSistem(),
      aksi: 'JADWAL_DIBATALKAN_OTOMATIS',
      entitas: 'Konten',
      entitasId: kontenId,
      dataBaru: { sebab },
    });
    return { kontenId, judul: konten.judul, hasil: 'dibatalkan', pesan: sebab };
  }

  // ==== susun URL bertoken, persis seperti pengiriman manual ====
  const basisUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000';

  const token = await buatTokenMedia({
    kontenId,
    media: konten.media.map((m) => ({ id: m.id })),
  });
  const petaToken = new Map(token.map((t) => [t.mediaId, t.token]));
  const berkasKirim: BerkasKirim[] = konten.media.map((m) => ({
    url: urlBerkasPublik({
      basisUrl,
      kontenId,
      mediaId: m.id,
      token: petaToken.get(m.id)!,
      versi: m.versi,
    }),
    jenis: m.jenis,
    mime: m.mime,
  }));

  const kirim = await kirimKePlatform(
    {
      kontenId,
      tujuan: konten.tujuan as Tujuan,
      jenisPosting: konten.jenisPosting as JenisPosting,
      caption: konten.caption,
      berkas: berkasKirim,
    },
    konfig
  );

  const peta: Record<string, HasilPlatform> = {};
  for (const h of kirim.hasil) peta[h.platform] = h;
  const ringkasHasil = kirim.hasil.map((h) => `${h.platform}: ${h.berhasil ? 'berhasil' : 'GAGAL'} — ${h.pesan}`).join(' | ');

  if (kirim.semuaBerhasil) {
    await prisma.konten.update({
      where: { id: kontenId },
      data: {
        status: 'DIKIRIM',
        hasilKirim: peta as never,
        terkirimAt: new Date(),
        jadwalAt: null,
      },
    });
    await prisma.keputusan.create({
      data: {
        kontenId,
        aksi: 'KIRIM_OTOMATIS',
        olehId: await idSistem(),
        catatan: `Dikirim otomatis sesuai jadwal. ${ringkasHasil}`,
      },
    });
    await catatAudit({
      penggunaId: await idSistem(),
      aksi: 'KIRIM_OTOMATIS',
      entitas: 'Konten',
      entitasId: kontenId,
      dataBaru: { modus: kirim.modus, hasil: kirim.hasil.map((h) => ({ platform: h.platform, berhasil: h.berhasil })) },
    });

    return {
      kontenId,
      judul: konten.judul,
      hasil: 'terkirim',
      pesan: kirim.modus === 'mock' ? `Disimulasikan terkirim. ${ringkasHasil}` : ringkasHasil,
    };
  }

  // ==== gagal: coba lagi, atau batalkan setelah batas percobaan ====
  const percobaan = await hitungPercobaan(kontenId);
  const gagalKe = percobaan + 1;

  if (gagalKe >= MAKS_PERCOBAAN) {
    await prisma.konten.update({
      where: { id: kontenId },
      data: { status: 'DISETUJUI', jadwalAt: null, hasilKirim: peta as never },
    });
    await prisma.keputusan.create({
      data: {
        kontenId,
        aksi: 'JADWAL_DIBATALKAN',
        olehId: await idSistem(),
        catatan: `Jadwal dibatalkan setelah ${gagalKe} percobaan gagal. ${ringkasHasil}`,
      },
    });
    await catatAudit({
      penggunaId: await idSistem(),
      aksi: 'JADWAL_DIBATALKAN_OTOMATIS',
      entitas: 'Konten',
      entitasId: kontenId,
      dataBaru: { gagalKe, hasil: kirim.hasil.map((h) => ({ platform: h.platform, berhasil: h.berhasil, pesan: h.pesan })) },
    });

    return {
      kontenId,
      judul: konten.judul,
      hasil: 'dibatalkan',
      pesan: `Dibatalkan setelah ${gagalKe} percobaan gagal. Konten kembali ke Disetujui supaya bisa diperiksa. ${ringkasHasil}`,
    };
  }

  const berikut = jadwalCobaUlang(sekarang);
  await prisma.konten.update({
    where: { id: kontenId },
    data: { status: 'DIJADWALKAN', jadwalAt: berikut, hasilKirim: peta as never },
  });
  await prisma.keputusan.create({
    data: {
      kontenId,
      aksi: 'KIRIM_OTOMATIS_GAGAL',
      olehId: await idSistem(),
      catatan: `Percobaan ke-${gagalKe} gagal. Dicoba lagi sekitar ${JEDA_COBA_ULANG_MENIT} menit lagi. ${ringkasHasil}`,
    },
  });

  return {
    kontenId,
    judul: konten.judul,
    hasil: 'gagal_dicoba_ulang',
    pesan: `Percobaan ke-${gagalKe} gagal — dicoba lagi dalam ${JEDA_COBA_ULANG_MENIT} menit. ${ringkasHasil}`,
  };
}

/**
 * Pengguna yang mewakili SISTEM di jejak keputusan.
 *
 * Pengiriman otomatis bukan tindakan manusia, tetapi `Keputusan.olehId` wajib
 * diisi. Daripada memakai akun admin tertentu (dan membuat seolah ia yang
 * menekan tombol), dibuat satu akun khusus yang jelas terbaca sebagai sistem.
 * Akun ini tidak punya password yang bisa dipakai login.
 */
async function idSistem(): Promise<string> {
  const ada = await prisma.pengguna.findUnique({
    where: { email: EMAIL_SISTEM },
    select: { id: true },
  });
  if (ada) return ada.id;

  // Password acak yang tidak pernah dipakai: akun ini tidak untuk login.
  const { hashPassword } = await import('@/lib/auth');
  const acak = await hashPassword(`sistem-${Date.now()}-${Math.random()}`);

  const dibuat = await prisma.pengguna.create({
    data: {
      email: EMAIL_SISTEM,
      nama: 'Pengiriman Terjadwal (sistem)',
      passwordHash: acak,
      peran: 'KREATOR',
      aktif: false, // tidak aktif = tidak bisa login, tapi tetap bisa jadi pelaku jejak
      harusGantiPassword: false,
    },
    select: { id: true },
  });
  return dibuat.id;
}
