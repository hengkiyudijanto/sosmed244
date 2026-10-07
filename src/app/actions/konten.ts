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
import {
  ATURAN_JENIS_POSTING,
  periksaKelayakan,
  transisi,
  type BerkasKonten,
  type JenisPosting,
  type Status,
  type Tujuan,
  JENIS_POSTING,
} from '@/lib/konten/status';
import { BATAS_MEDIA } from '@/lib/konten/media';
import { bacaKonfig } from '@/lib/konten/konfig';
import { buatTokenMedia, urlBerkasPublik } from '@/lib/konten/token-media';
import { kirimKePlatform, type BerkasKirim, type HasilPlatform } from '@/lib/konten/penerbit';

export type HasilAksi = { error?: string; sukses?: boolean; pesan?: string; id?: string };

function sayaDari(p: { id: string; peran: string }): Saya {
  return { id: p.id, peran: p.peran };
}

/**
 * Berkas yang dikirim form: satu baris per berkas.
 *
 * Dikirim sebagai beberapa field bernomor (mediaData0, mediaData1, …) dan bukan
 * satu kolom JSON raksasa, supaya setiap nilai tetap berupa string biasa yang
 * ditangani FormData tanpa parsing tambahan.
 */
type BerkasForm = {
  data: string;
  mime: string;
  byte: number;
  lebar: number | null;
  tinggi: number | null;
  durasiDetik: number | null;
  jenis: 'GAMBAR' | 'VIDEO';
  /** id baris Media yang sudah ada (kalau berkas lama dipertahankan) */
  id?: string;
  /** urutan tampil dari form; server tetap mengurutkan ulang menurut posisi */
};

/** Baca seluruh berkas dari FormData, urut sesuai posisinya di form. */
function bacaBerkasDariForm(formData: FormData): BerkasForm[] {
  const berkas: BerkasForm[] = [];
  for (let i = 0; i < BATAS_MEDIA.maksBerkasSekaliUnggah * 2 && i < 40; i++) {
    const data = formData.get(`mediaData${i}`);
    if (data === null) continue;
    const teks = String(data);
    const idLama = String(formData.get(`mediaId${i}`) ?? '').trim();
    if (!teks && !idLama) continue; // baris kosong (mis. berkas dihapus)

    const mime = String(formData.get(`mediaMime${i}`) ?? '');
    berkas.push({
      id: idLama || undefined,
      data: teks,
      mime,
      byte: Number(formData.get(`mediaByte${i}`) ?? 0) || 0,
      lebar: Number(formData.get(`mediaLebar${i}`) ?? 0) || null,
      tinggi: Number(formData.get(`mediaTinggi${i}`) ?? 0) || null,
      durasiDetik: Number(formData.get(`durasiDetik${i}`) ?? 0) || null,
      jenis:
        mime.startsWith('video/') || String(formData.get(`jenisBerkas${i}`) ?? '') === 'VIDEO'
          ? 'VIDEO'
          : 'GAMBAR',
    });
  }
  return berkas;
}

/** Validasi tiap data URL yang baru diunggah + batas total satu permintaan. */
function periksaDataUrl(berkas: BerkasForm[]): string | null {
  const baru = berkas.filter((b) => b.data.length > 0);
  const total = baru.reduce((a, b) => a + b.data.length, 0);

  for (const b of baru) {
    if (!/^data:(image\/(jpeg|png|webp)|video\/(mp4|quicktime|webm));base64,/.test(b.data)) {
      return 'Format berkas tidak didukung. Gambar JPG/PNG/WebP atau video MP4/MOV.';
    }
    if (b.data.length > BATAS_MEDIA.maksDataUrl) {
      return 'Ada berkas yang terlalu besar untuk disimpan. Kompres dulu berkasnya.';
    }
  }

  if (total > BATAS_MEDIA.maksTotalDataUrl) {
    return `Total berkas ${Math.round(total / 1024 / 1024)} MB melebihi batas satu unggahan (${Math.round(
      BATAS_MEDIA.maksTotalDataUrl / 1024 / 1024
    )} MB). Kurangi jumlah atau ukuran berkasnya.`;
  }
  return null;
}

/**
 * Kelayakan diperiksa DUA kali: sekali pada data yang dikirim form (supaya
 * pesannya sampai ke pengguna), sekali lagi pada data yang benar-benar ada di
 * database (supaya berkas lama yang tidak ikut dikirim form tetap dihitung).
 */
function bentukMasukan(input: {
  tujuan: Tujuan;
  jenisPosting: JenisPosting;
  caption: string;
  berkas: BerkasKonten[];
}) {
  return {
    tujuan: input.tujuan,
    jenisPosting: input.jenisPosting,
    caption: input.caption,
    berkas: input.berkas,
  };
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
  const jenisPosting = String(formData.get('jenisPosting') ?? 'FEED') as JenisPosting;
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
  if (!JENIS_POSTING.includes(jenisPosting)) {
    return { error: 'Jenis postingan tidak dikenal.' };
  }

  // ==== berkas ====
  const berkas = bacaBerkasDariForm(formData);
  const salahData = periksaDataUrl(berkas);
  if (salahData) return { error: salahData };

  // jenis konten diturunkan dari berkas: campuran dianggap VIDEO kalau ada video.
  // (Ini hanya ringkasan berkas utama untuk daftar/dasbor; kebenaran sebenarnya
  // ada di tiap baris Media.)
  const jenis: 'GAMBAR' | 'VIDEO' = berkas.some((b) => b.jenis === 'VIDEO') ? 'VIDEO' : 'GAMBAR';

  // TikTok menolak gambar — dicegah di sini, bukan setelah dikirim. Cek lewat
  // mesin kelayakan supaya pesannya sama dengan yang dilihat di form.
  const masalahAwal = periksaKelayakan(
    bentukMasukan({
      tujuan,
      jenisPosting,
      caption,
      berkas: berkas.map((b) => ({
        jenis: b.jenis,
        mime: b.mime,
        ukuranByte: b.byte,
        durasiDetik: b.durasiDetik,
      })),
    })
  );
  // Hanya masalah "jenis/format" yang menghalangi SIMPAN. Masalah kelengkapan
  // (mis. carousel baru berisi 1 berkas) belum menghalangi — draft boleh belum
  // lengkap, dan itu ditegakkan saat pengajuan/kirim.
  const aturanJenis = ATURAN_JENIS_POSTING;
  const menghalangiSimpan = masalahAwal.filter((m) =>
    /hanya menerima|tidak menerima|tidak didukung|tidak dapat diposting/i.test(m.pesan)
  );
  if (menghalangiSimpan.length > 0) {
    return { error: `${menghalangiSimpan[0].platform}: ${menghalangiSimpan[0].pesan}` };
  }
  void aturanJenis;

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
      select: {
        pembuatId: true,
        penyetujuId: true,
        status: true,
        versiMedia: true,
        media: { select: { id: true } },
      },
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

    // id berkas yang dikirim form harus benar-benar milik konten ini — kalau
    // tidak, seseorang bisa menempelkan berkas konten lain ke kontennya.
    const idSah = new Set(konten.media.map((m) => m.id));
    for (const b of berkas) {
      if (b.id && !idSah.has(b.id)) {
        return { error: 'Ada berkas yang bukan milik konten ini.' };
      }
    }

    const idDipertahankan = berkas.filter((b) => b.id).map((b) => b.id!) as string[];
    const berkasBaru = berkas.filter((b) => !b.id && b.data.length > 0);
    const adaPerubahanBerkas = berkasBaru.length > 0 || idDipertahankan.length !== idSah.size;

    // Berkas yang dibuang dari form dihapus dari database.
    const idDibuang = [...idSah].filter((x) => !idDipertahankan.includes(x));

    // Kelayakan atas KEADAAN AKHIR: berkas lama yang tetap ada + berkas baru,
    // supaya carousel tidak lolos hanya karena berkasnya tidak ikut terkirim.
    const lamaDipertahankan = await prisma.media.findMany({
      where: { id: { in: idDipertahankan } },
      select: { jenis: true, mime: true, byte: true, durasiDetik: true },
    });
    const kelayakanAkhir = periksaKelayakan(
      bentukMasukan({
        tujuan,
        jenisPosting,
        caption,
        berkas: [
          ...lamaDipertahankan.map((m) => ({
            jenis: m.jenis,
            mime: m.mime,
            ukuranByte: m.byte,
            durasiDetik: m.durasiDetik,
          })),
          ...berkasBaru.map((b) => ({
            jenis: b.jenis,
            mime: b.mime,
            ukuranByte: b.byte,
            durasiDetik: b.durasiDetik,
          })),
        ],
      })
    );
    const halanganAkhir = kelayakanAkhir.filter((m) =>
      /hanya menerima|tidak menerima|tidak didukung|tidak dapat diposting/i.test(m.pesan)
    );
    if (halanganAkhir.length > 0) {
      return { error: `${halanganAkhir[0].platform}: ${halanganAkhir[0].pesan}` };
    }

    await prisma.$transaction(async (tx) => {
      if (idDibuang.length > 0) {
        await tx.media.deleteMany({ where: { id: { in: idDibuang } } });
      }

      // Berkas baru dibuat lebih dulu (tanpa urutan final), lalu SEMUA berkas
      // dinomori ulang sesuai posisi di form. Dua langkah ini perlu karena
      // urutan akhir hanya diketahui setelah semua id terkumpul.
      const idBaru: string[] = [];
      for (const b of berkasBaru) {
        const dibuat = await tx.media.create({
          data: {
            kontenId: id,
            urutan: 0,
            jenis: b.jenis,
            data: b.data,
            mime: b.mime,
            byte: b.byte,
            lebar: b.lebar,
            tinggi: b.tinggi,
            durasiDetik: b.durasiDetik,
          },
          select: { id: true },
        });
        idBaru.push(dibuat.id);
      }

      let kursor = 0;
      for (const [posisi, b] of berkas.entries()) {
        const mediaId = b.id ?? idBaru[kursor++];
        const data: Record<string, unknown> = { urutan: posisi };
        // penanda versi naik hanya untuk isi yang berubah: URL ikut berubah,
        // jadi peramban tidak menyajikan berkas lama dari cache
        if (!b.id) data.versi = 1;
        await tx.media.update({ where: { id: mediaId }, data });
      }

      await tx.konten.update({
        where: { id },
        data: {
          judul,
          caption,
          tujuan,
          jenisPosting,
          jenis,
          penyetujuId: penyetujuId || konten.penyetujuId,
          ...(adaPerubahanBerkas
            ? { versiMedia: { increment: 1 }, mediaDilihat: 0 }
            : {}),
        },
      });
    });

    await catatAudit({
      penggunaId: pengguna.id,
      aksi: 'UBAH_KONTEN',
      entitas: 'Konten',
      entitasId: id,
      dataBaru: {
        judul,
        tujuan,
        jenisPosting,
        jenis,
        jumlahBerkas: berkas.length,
        berkasBaru: berkasBaru.length,
        berkasDibuang: idDibuang.length,
      },
    });

    revalidatePath('/');
    revalidatePath(`/konten/${id}`);
    return { sukses: true, pesan: 'Konten tersimpan.', id };
  }

  // ===================== BUAT BARU =====================
  const baru = await prisma.konten.create({
    data: {
      judul,
      caption,
      tujuan,
      jenisPosting,
      jenis,
      status: 'DRAFT',
      pembuatId: pengguna.id,
      penyetujuId: penyetujuId || null,
      brandId: pengguna.brand?.id ?? null,
      media: {
        create: berkas.map((b, i) => ({
          urutan: i,
          jenis: b.jenis,
          data: b.data,
          mime: b.mime,
          byte: b.byte,
          lebar: b.lebar,
          tinggi: b.tinggi,
          durasiDetik: b.durasiDetik,
        })),
      },
    },
  });

  await prisma.keputusan.create({
    data: {
      kontenId: baru.id,
      aksi: 'DIBUAT',
      olehId: pengguna.id,
      catatan: `Konten dibuat sebagai draft (${berkas.length} berkas).`,
    },
  });

  await catatAudit({
    penggunaId: pengguna.id,
    aksi: 'BUAT_KONTEN',
    entitas: 'Konten',
    entitasId: baru.id,
    dataBaru: { judul, jenis, jenisPosting, tujuan, jumlahBerkas: berkas.length },
  });

  revalidatePath('/');
  return { sukses: true, pesan: `Konten "${judul}" dibuat sebagai draft.`, id: baru.id };
}

/** Hapus satu berkas media (konten tetap ada, jadi draft tanpa berkas itu). */
export async function hapusMedia(
  _sebelumnya: HasilAksi,
  formData: FormData
): Promise<HasilAksi> {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) return { error: 'Sesi habis. Silakan masuk kembali.' };

  const id = String(formData.get('id') ?? '');
  const mediaId = String(formData.get('mediaId') ?? '').trim();

  const konten = await prisma.konten.findUnique({
    where: { id },
    select: {
      pembuatId: true,
      penyetujuId: true,
      status: true,
      media: { select: { id: true }, orderBy: { urutan: 'asc' } },
    },
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

  if (mediaId) {
    if (!konten.media.some((m) => m.id === mediaId)) {
      return { error: 'Berkas itu bukan milik konten ini.' };
    }
    await prisma.$transaction(async (tx) => {
      await tx.media.delete({ where: { id: mediaId } });
      // nomori ulang supaya urutan tetap rapat 0,1,2,… (carousel memakai
      // berkas pertama sebagai acuan potongan)
      const sisa = konten.media.filter((m) => m.id !== mediaId);
      for (const [i, m] of sisa.entries()) {
        await tx.media.update({ where: { id: m.id }, data: { urutan: i } });
      }
      await tx.konten.update({
        where: { id },
        data: { versiMedia: { increment: 1 } },
      });
    });
    revalidatePath(`/konten/${id}`);
    return { sukses: true, pesan: 'Berkas dihapus.' };
  }

  // tanpa mediaId: hapus SEMUA berkas (dipakai untuk mengganti seluruh berkas)
  await prisma.$transaction(async (tx) => {
    await tx.media.deleteMany({ where: { kontenId: id } });
    await tx.konten.update({ where: { id }, data: { versiMedia: { increment: 1 } } });
  });

  revalidatePath(`/konten/${id}`);
  return { sukses: true, pesan: 'Semua berkas dihapus. Unggah berkas pengganti, lalu simpan.' };
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
      judul: true,
      tujuan: true,
      jenisPosting: true,
      caption: true,
      media: {
        select: { jenis: true, mime: true, byte: true, durasiDetik: true },
        orderBy: { urutan: 'asc' },
      },
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
    if (konten.media.length === 0) return { error: 'Konten belum punya berkas media.' };
    const penyetujuFinal = penyetujuBaru || konten.penyetujuId;
    if (!penyetujuFinal) {
      return {
        error:
          'Penyetuju belum ditentukan. Buka konten, pilih penyetuju, simpan, lalu ajukan.',
      };
    }

    // Konten yang belum layak TIDAK boleh masuk meja penyetuju: penyetuju tidak
    // bisa memperbaiki media, jadi mengajukannya hanya membuang waktunya.
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
    });
    const menghalangi = masalah.filter((m) => !/akan diabaikan/i.test(m.pesan));
    if (menghalangi.length > 0) {
      return {
        error: `Belum bisa diajukan — ${menghalangi[0].platform}: ${menghalangi[0].pesan}`,
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
      caption: true,
      tujuan: true,
      jenis: true,
      jenisPosting: true,
      versiMedia: true,
      terkirimAt: true,
      media: {
        select: { id: true, jenis: true, mime: true, byte: true, durasiDetik: true, versi: true },
        orderBy: { urutan: 'asc' },
      },
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
  if (konten.media.length === 0) return { error: 'Konten tidak punya berkas media.' };

  const hasil = transisi(ringkas.status, 'KIRIM', peranTransisi(ringkas, sayaDari(pengguna)));
  if (!hasil.boleh) return { error: hasil.alasan };

  // Kelayakan diperiksa LAGI di sini dengan data dari database, bukan dari form:
  // berkas bisa saja berubah setelah disetujui (mis. diminta revisi lalu diubah).
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
  });
  const menghalangi = masalah.filter((m) => !/akan diabaikan/i.test(m.pesan));
  if (menghalangi.length > 0) {
    return {
      error: `Tidak dapat dikirim — ${menghalangi[0].platform}: ${menghalangi[0].pesan}`,
    };
  }

  const konfig = bacaKonfig();

  // ==== URL publik berkas ====
  // Platform (TikTok/Instagram) tidak punya sesi, jadi URL harus memakai token
  // sekali-pakai. Token dibuat SATU PER BERKAS dan hanya berlaku sebentar —
  // lihat src/lib/konten/token-media.ts.
  const basisUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000';

  let berkasKirim: BerkasKirim[];
  try {
    const token = await buatTokenMedia({
      kontenId: id,
      media: konten.media.map((m) => ({ id: m.id })),
    });
    const petaToken = new Map(token.map((t) => [t.mediaId, t.token]));
    berkasKirim = konten.media.map((m) => ({
      url: urlBerkasPublik({
        basisUrl,
        kontenId: id,
        mediaId: m.id,
        token: petaToken.get(m.id)!,
        versi: m.versi,
      }),
      jenis: m.jenis,
      mime: m.mime,
    }));
  } catch (e) {
    console.error('[sosmed] gagal membuat token berkas:', e);
    return {
      error:
        'Gagal menyiapkan tautan berkas untuk platform. Tidak ada yang dikirim — coba lagi sebentar lagi.',
    };
  }

  const kirim = await kirimKePlatform(
    {
      kontenId: id,
      tujuan: konten.tujuan as Tujuan,
      jenisPosting: konten.jenisPosting as JenisPosting,
      caption: konten.caption,
      berkas: berkasKirim,
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
