'use server';

/**
 * Server action untuk modul konten.
 *
 * Aturan yang dipegang di sini:
 *  1. SETIAP aksi memanggil `wajibKemampuan` / `bolehAksi` DULU. Menyembunyikan
 *     tombol bukan pengamanan: action bisa dipanggil langsung lewat POST.
 *  2. Transisi status lewat `transisi()` (fungsi murni + unit test) — jangan
 *     menulis perbandingan status sendiri di sini.
 *  3. Peran transisi ditentukan `peranTransisi()` yang selalu menghitung pembuat
 *     konten sebagai PEMILIK, supaya "tidak menyetujui konten sendiri" berlaku
 *     untuk semua orang, termasuk admin.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { penggunaDariSesi, catatAudit } from '@/lib/auth';
import {
  boleh,
  bolehAksi,
  bolehLihat,
  peranTransisi,
  wajibKemampuan,
  type Saya,
} from '@/lib/konten/akses';
import { transisi, type Status, type Tujuan } from '@/lib/konten/status';
import { bacaKonfig } from '@/lib/konten/konfig';
import { kirimKePlatform, type HasilPlatform } from '@/lib/konten/penerbit';

export type HasilAksi = { error?: string; sukses?: boolean; pesan?: string; id?: string };

/** Batas panjang data URL yang diterima server (base64 ≈ 1,37× byte berkas). */
const MAKS_DATA_URL = 28 * 1024 * 1024;

function sayaDari(p: { id: string; peran: string }): Saya {
  return { id: p.id, peran: p.peran };
}

/** URL publik berkas media — platform menarik sendiri berkasnya dari sini. */
function urlMedia(kontenId: string, versi: number) {
  const basis =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
  return `${basis.replace(/\/$/, '')}/media/${kontenId}?v=${versi}`;
}

// ===========================================================================
// Simpan / ubah konten
// ===========================================================================

export async function simpanKonten(
  _sebelumnya: HasilAksi,
  formData: FormData
): Promise<HasilAksi> {
  const pengguna = await penggunaDariSesi();
  const tolak = wajibKemampuan(pengguna, 'kelola_konten');
  if (tolak || !pengguna) return { error: tolak ?? 'Sesi habis.' };

  const id = String(formData.get('id') ?? '').trim();
  const judul = String(formData.get('judul') ?? '').trim();
  const caption = String(formData.get('caption') ?? '');
  const tujuan = String(formData.get('tujuan') ?? 'KEDUANYA') as Tujuan;
  const penyetujuId = String(formData.get('penyetujuId') ?? '').trim();

  // ==== validasi masukan ====
  if (judul.length < 3) return { error: 'Judul internal minimal 3 karakter.' };
  if (judul.length > 120) return { error: 'Judul internal maksimal 120 karakter.' };
  if (caption.length > 2200) {
    return { error: `Caption ${caption.length} karakter, melebihi batas platform (2200).` };
  }
  if (!['TIKTOK', 'INSTAGRAM', 'KEDUANYA'].includes(tujuan)) {
    return { error: 'Platform tujuan tidak dikenal.' };
  }

  // ==== berkas ====
  const mediaData = String(formData.get('mediaData') ?? '');
  const mediaMime = String(formData.get('mediaMime') ?? '');
  const mediaByte = Number(formData.get('mediaByte') ?? 0);
  const mediaLebar = Number(formData.get('mediaLebar') ?? 0) || null;
  const mediaTinggi = Number(formData.get('mediaTinggi') ?? 0) || null;
  const durasiDetik = Number(formData.get('durasiDetik') ?? 0) || null;
  const adaBerkasBaru = mediaData.length > 0;

  if (adaBerkasBaru) {
    if (!/^data:(image\/(jpeg|png|webp)|video\/(mp4|quicktime|webm));base64,/.test(mediaData)) {
      return { error: 'Format berkas tidak didukung. Gambar JPG/PNG/WebP atau video MP4/MOV.' };
    }
    if (mediaData.length > MAKS_DATA_URL) {
      return { error: 'Berkas terlalu besar untuk disimpan. Kompres dulu berkasnya.' };
    }
  }

  const jenis: 'GAMBAR' | 'VIDEO' =
    mediaMime.startsWith('video/') || String(formData.get('jenis') ?? '') === 'VIDEO'
      ? 'VIDEO'
      : 'GAMBAR';

  // TikTok menolak gambar — dicegah di sini, bukan setelah dikirim.
  if (jenis === 'GAMBAR' && tujuan === 'TIKTOK') {
    return { error: 'TikTok hanya menerima video. Pilih "Instagram saja" atau unggah video.' };
  }

  // ==== calon penyetuju ====
  if (penyetujuId) {
    if (penyetujuId === pengguna.id) {
      return { error: 'Anda tidak dapat menunjuk diri sendiri sebagai penyetuju.' };
    }
    const calon = await prisma.pengguna.findUnique({
      where: { id: penyetujuId },
      select: { id: true, nama: true, peran: true, aktif: true },
    });
    if (!calon || !calon.aktif) return { error: 'Penyetuju tidak ditemukan atau tidak aktif.' };
    if (!boleh(calon.peran, 'setujui_konten')) {
      return { error: `${calon.nama} tidak berhak menyetujui konten.` };
    }
  }

  // ===================== UBAH =====================
  if (id) {
    const konten = await prisma.konten.findUnique({
      where: { id },
      select: { pembuatId: true, penyetujuId: true, status: true, versiMedia: true },
    });
    if (!konten) return { error: 'Konten tidak ditemukan.' };

    const hak = bolehAksi(
      {
        pembuatId: konten.pembuatId,
        penyetujuId: konten.penyetujuId,
        status: konten.status as Status,
      },
      sayaDari(pengguna),
      'ubah'
    );
    if (!hak.boleh) return { error: hak.alasan };

    await prisma.konten.update({
      where: { id },
      data: {
        judul,
        caption,
        tujuan,
        jenis,
        penyetujuId: penyetujuId || konten.penyetujuId,
        ...(adaBerkasBaru
          ? {
              mediaData,
              mediaMime,
              mediaByte,
              mediaLebar,
              mediaTinggi,
              durasiDetik,
              mediaDilihat: 0,
              // penanda versi naik: URL media ikut berubah, jadi peramban
              // tidak menyajikan gambar lama dari cache
              versiMedia: { increment: 1 },
            }
          : {}),
      },
    });

    await catatAudit({
      penggunaId: pengguna.id,
      aksi: 'UBAH_KONTEN',
      entitas: 'Konten',
      entitasId: id,
      dataBaru: { judul, tujuan, jenis, gantiBerkas: adaBerkasBaru },
    });

    revalidatePath('/');
    revalidatePath(`/konten/${id}`);
    return { sukses: true, pesan: 'Konten tersimpan.', id };
  }

  // ===================== BUAT BARU =====================
  if (!adaBerkasBaru) {
    return { error: 'Pilih berkas gambar atau video terlebih dahulu.' };
  }

  const baru = await prisma.konten.create({
    data: {
      judul,
      caption,
      tujuan,
      jenis,
      status: 'DRAFT',
      mediaData,
      mediaMime,
      mediaByte,
      mediaLebar,
      mediaTinggi,
      durasiDetik,
      pembuatId: pengguna.id,
      penyetujuId: penyetujuId || null,
      brandId: pengguna.brand?.id ?? null,
    },
  });

  await prisma.keputusan.create({
    data: {
      kontenId: baru.id,
      aksi: 'DIBUAT',
      olehId: pengguna.id,
      catatan: 'Konten dibuat sebagai draft.',
    },
  });

  await catatAudit({
    penggunaId: pengguna.id,
    aksi: 'BUAT_KONTEN',
    entitas: 'Konten',
    entitasId: baru.id,
    dataBaru: { judul, jenis, tujuan },
  });

  revalidatePath('/');
  return { sukses: true, pesan: `Konten "${judul}" dibuat sebagai draft.`, id: baru.id };
}

/** Hapus berkas media saja (konten tetap ada, jadi draft tanpa berkas). */
export async function hapusMedia(
  _sebelumnya: HasilAksi,
  formData: FormData
): Promise<HasilAksi> {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) return { error: 'Sesi habis. Silakan masuk kembali.' };

  const id = String(formData.get('id') ?? '');
  const konten = await prisma.konten.findUnique({
    where: { id },
    select: { pembuatId: true, penyetujuId: true, status: true },
  });
  if (!konten) return { error: 'Konten tidak ditemukan.' };

  const hak = bolehAksi(
    {
      pembuatId: konten.pembuatId,
      penyetujuId: konten.penyetujuId,
      status: konten.status as Status,
    },
    sayaDari(pengguna),
    'ubah'
  );
  if (!hak.boleh) return { error: hak.alasan };

  await prisma.konten.update({
    where: { id },
    data: {
      mediaData: null,
      mediaMime: null,
      mediaByte: null,
      mediaLebar: null,
      mediaTinggi: null,
      durasiDetik: null,
      versiMedia: { increment: 1 },
    },
  });

  revalidatePath(`/konten/${id}`);
  return { sukses: true, pesan: 'Berkas dihapus. Unggah berkas pengganti, lalu simpan.' };
}

/** Hapus konten — hanya draft/revisi milik sendiri, atau admin. */
export async function hapusKonten(
  _sebelumnya: HasilAksi,
  formData: FormData
): Promise<HasilAksi> {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) return { error: 'Sesi habis. Silakan masuk kembali.' };

  const id = String(formData.get('id') ?? '');
  const konten = await prisma.konten.findUnique({
    where: { id },
    select: { judul: true, pembuatId: true, penyetujuId: true, status: true },
  });
  if (!konten) return { error: 'Konten tidak ditemukan.' };

  const hak = bolehAksi(
    {
      pembuatId: konten.pembuatId,
      penyetujuId: konten.penyetujuId,
      status: konten.status as Status,
    },
    sayaDari(pengguna),
    'hapus'
  );
  if (!hak.boleh) return { error: hak.alasan };

  await prisma.konten.delete({ where: { id } });

  await catatAudit({
    penggunaId: pengguna.id,
    aksi: 'HAPUS_KONTEN',
    entitas: 'Konten',
    entitasId: id,
    dataLama: { judul: konten.judul, status: konten.status },
  });

  revalidatePath('/');
  return { sukses: true, pesan: `Konten "${konten.judul}" dihapus.` };
}

// ===========================================================================
// Persetujuan — satu pintu untuk semua transisi status
// ===========================================================================

export async function ubahStatus(
  _sebelumnya: HasilAksi,
  formData: FormData
): Promise<HasilAksi> {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) return { error: 'Sesi habis. Silakan masuk kembali.' };

  const id = String(formData.get('id') ?? '');
  const aksi = String(formData.get('aksi') ?? '');
  const catatan = String(formData.get('catatan') ?? '').trim();
  const jadwalMentah = String(formData.get('jadwalAt') ?? '').trim();
  const penyetujuBaru = String(formData.get('penyetujuId') ?? '').trim();

  const konten = await prisma.konten.findUnique({
    where: { id },
    select: {
      pembuatId: true,
      penyetujuId: true,
      status: true,
      mediaData: true,
      judul: true,
    },
  });
  if (!konten) return { error: 'Konten tidak ditemukan.' };

  const ringkas = {
    pembuatId: konten.pembuatId,
    penyetujuId: konten.penyetujuId,
    status: konten.status as Status,
  };

  // Cakupan lebih dulu: orang di luar jangkauan tidak boleh tahu bedanya
  // "tidak berhak" dan "tidak ada".
  if (!bolehLihat(ringkas, sayaDari(pengguna))) {
    return { error: 'Anda tidak berhak mengubah konten ini.' };
  }

  const peran = peranTransisi(ringkas, sayaDari(pengguna));
  const pemilik = peran === 'PEMILIK';

  // ==== validasi khusus per aksi ====
  if (aksi === 'AJUKAN') {
    if (!pemilik) return { error: 'Hanya pembuat konten yang dapat mengajukan.' };
    if (!konten.mediaData) return { error: 'Konten belum punya berkas media.' };
    const penyetujuFinal = penyetujuBaru || konten.penyetujuId;
    if (!penyetujuFinal) {
      return {
        error:
          'Penyetuju belum ditentukan. Buka konten, pilih penyetuju, simpan, lalu ajukan.',
      };
    }
  }

  if ((aksi === 'SETUJUI' || aksi === 'MINTA_REVISI') && kartuBolehSetuju(konten, pengguna.id) === false) {
    return { error: 'Konten ini sudah ditugaskan ke penyetuju lain.' };
  }

  if (aksi === 'MINTA_REVISI' && !catatan) {
    return { error: 'Alasan revisi wajib diisi — kreator akan membacanya.' };
  }

  if (aksi === 'JADWALKAN') {
    if (!jadwalMentah) return { error: 'Waktu jadwal wajib diisi.' };
    const t = new Date(jadwalMentah);
    if (Number.isNaN(t.getTime())) return { error: 'Format waktu jadwal tidak dikenali.' };
    if (t.getTime() < Date.now() - 60_000) {
      return { error: 'Waktu jadwal sudah lewat. Pilih waktu setelah sekarang.' };
    }
  }

  // ==== mesin transisi yang memutuskan ====
  const hasil = transisi(ringkas.status, aksi as never, peran);
  if (!hasil.boleh) return { error: hasil.alasan };

  const sekarang = new Date();

  await prisma.konten.update({
    where: { id },
    data: {
      status: hasil.statusBaru,
      ...(aksi === 'AJUKAN'
        ? {
            pengajuId: pengguna.id,
            diajukanAt: sekarang,
            catatanKreator: catatan || null,
            alasanRevisi: null,
            // penyetuju dikunci di sini: setelah ini konten hanya bisa
            // disetujui orang tersebut
            ...(penyetujuBaru ? { penyetujuId: penyetujuBaru } : {}),
          }
        : {}),
      ...(aksi === 'SETUJUI'
        ? { diputusAt: sekarang, catatanPenyetuju: catatan || null, alasanRevisi: null }
        : {}),
      ...(aksi === 'MINTA_REVISI'
        ? { diputusAt: sekarang, alasanRevisi: catatan, jumlahRevisi: { increment: 1 } }
        : {}),
      ...(aksi === 'TARIK' ? { diajukanAt: null, pengajuId: null } : {}),
      ...(aksi === 'JADWALKAN' ? { jadwalAt: new Date(jadwalMentah) } : {}),
      ...(aksi === 'BATAL_JADWAL' ? { jadwalAt: null } : {}),
    },
  });

  await prisma.keputusan.create({
    data: { kontenId: id, aksi, olehId: pengguna.id, catatan: catatan || null },
  });

  await catatAudit({
    penggunaId: pengguna.id,
    aksi: `KONTEN_${aksi}`,
    entitas: 'Konten',
    entitasId: id,
    dataLama: { status: ringkas.status },
    dataBaru: { status: hasil.statusBaru, catatan: catatan || undefined },
  });

  revalidatePath('/');
  revalidatePath(`/konten/${id}`);
  revalidatePath('/persetujuan');

  const pesan: Record<string, string> = {
    AJUKAN: 'Konten diajukan. Penyetuju akan melihatnya di daftar Persetujuan.',
    SETUJUI: 'Konten disetujui. Sekarang dapat dikirim ke platform.',
    MINTA_REVISI: 'Konten dikembalikan ke kreator untuk direvisi.',
    TARIK: 'Pengajuan ditarik. Konten kembali menjadi draft.',
    JADWALKAN: 'Konten dijadwalkan.',
    BATAL_JADWAL: 'Jadwal dibatalkan.',
    ARSIPKAN: 'Konten diarsipkan.',
  };

  return { sukses: true, pesan: pesan[aksi] ?? 'Status konten diperbarui.' };
}

/** Apakah konten ini masih boleh diputuskan oleh pengguna tersebut? */
function kartuBolehSetuju(
  konten: { penyetujuId: string | null },
  penggunaId: string
): boolean {
  return !konten.penyetujuId || konten.penyetujuId === penggunaId;
}

// ===========================================================================
// Pengiriman ke platform
// ===========================================================================

/**
 * Kirim konten yang SUDAH disetujui.
 *
 * Kegagalan platform TIDAK mengembalikan status ke sebelum disetujui — hasil
 * per platform disimpan supaya bisa dicoba ulang tanpa mengulang approval.
 */
export async function kirimKonten(
  _sebelumnya: HasilAksi,
  formData: FormData
): Promise<HasilAksi> {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) return { error: 'Sesi habis. Silakan masuk kembali.' };

  const id = String(formData.get('id') ?? '');
  const konten = await prisma.konten.findUnique({
    where: { id },
    select: {
      pembuatId: true,
      penyetujuId: true,
      status: true,
      mediaData: true,
      mediaMime: true,
      mediaByte: true,
      durasiDetik: true,
      caption: true,
      tujuan: true,
      jenis: true,
      versiMedia: true,
      terkirimAt: true,
    },
  });
  if (!konten) return { error: 'Konten tidak ditemukan.' };

  const ringkas = {
    pembuatId: konten.pembuatId,
    penyetujuId: konten.penyetujuId,
    status: konten.status as Status,
  };
  if (!bolehLihat(ringkas, sayaDari(pengguna))) {
    return { error: 'Anda tidak berhak mengirim konten ini.' };
  }
  if (!konten.mediaData) return { error: 'Konten tidak punya berkas media.' };

  const hasil = transisi(ringkas.status, 'KIRIM', peranTransisi(ringkas, sayaDari(pengguna)));
  if (!hasil.boleh) return { error: hasil.alasan };

  const konfig = bacaKonfig();
  const kirim = await kirimKePlatform(
    {
      kontenId: id,
      tujuan: konten.tujuan as Tujuan,
      caption: konten.caption,
      mediaUrl: urlMedia(id, konten.versiMedia),
      jenis: konten.jenis as 'GAMBAR' | 'VIDEO',
    },
    konfig
  );

  const peta: Record<string, HasilPlatform> = {};
  for (const h of kirim.hasil) peta[h.platform] = h;

  await prisma.konten.update({
    where: { id },
    data: {
      // DIKIRIM hanya kalau SEMUA platform berhasil; kalau sebagian gagal,
      // status tetap DISETUJUI supaya tombol "Kirim" masih masuk akal.
      status: kirim.semuaBerhasil ? 'DIKIRIM' : (konten.status as Status),
      hasilKirim: peta as never,
      terkirimAt: kirim.semuaBerhasil ? new Date() : konten.terkirimAt,
    },
  });

  await prisma.keputusan.create({
    data: {
      kontenId: id,
      aksi: 'KIRIM',
      olehId: pengguna.id,
      catatan: kirim.hasil
        .map((h) => `${h.platform}: ${h.berhasil ? 'berhasil' : 'GAGAL'} — ${h.pesan}`)
        .join(' | '),
    },
  });

  await catatAudit({
    penggunaId: pengguna.id,
    aksi: 'KIRIM_KONTEN',
    entitas: 'Konten',
    entitasId: id,
    dataBaru: {
      modus: konfig.modus,
      hasil: kirim.hasil.map((h) => ({
        platform: h.platform,
        berhasil: h.berhasil,
        idPlatform: h.idPlatform,
      })),
    },
  });

  revalidatePath('/');
  revalidatePath(`/konten/${id}`);

  if (kirim.semuaBerhasil) {
    return {
      sukses: true,
      pesan:
        kirim.modus === 'mock'
          ? 'Disimulasikan terkirim ke semua platform (modus simulasi).'
          : 'Berhasil dikirim ke semua platform.',
    };
  }

  const gagal = kirim.hasil.filter((h) => !h.berhasil).map((h) => h.platform).join(', ');
  return {
    error: `Gagal dikirim ke: ${gagal}. Konten tetap berstatus disetujui — periksa pesan di detail konten, lalu coba kirim lagi.`,
  };
}
