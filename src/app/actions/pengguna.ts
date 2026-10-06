'use server';

/**
 * Server action untuk kelola pengguna (khusus peran yang punya `kelola_pengguna`).
 *
 * Aturan yang dipegang:
 *  1. Setiap action memanggil `wajibKemampuan` DULU — menyembunyikan tombol bukan
 *     pengamanan, action bisa dipanggil langsung lewat POST.
 *  2. Admin TIDAK bisa menonaktifkan, menurunkan peran, atau menghapus dirinya
 *     sendiri. Tanpa aturan ini, satu klik bisa mengunci seluruh aplikasi karena
 *     tidak ada lagi yang berperan admin.
 *  3. Admin terakhir juga tidak bisa dinonaktifkan/dihapus — dijaga di server.
 *  4. Password selalu di-hash; tidak pernah disimpan atau dikembalikan apa adanya.
 */

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { penggunaDariSesi, catatAudit, hashPassword, validasiPassword } from '@/lib/auth';
import { wajibKemampuan, PERAN, type Peran } from '@/lib/konten/akses';

export type HasilAksi = {
  error?: string;
  sukses?: boolean;
  pesan?: string;
  /** password sementara yang dibuat server — ditampilkan SEKALI ke admin */
  passwordSementara?: string;
};

/** Panjang password sementara yang dibuat otomatis. */
const PANJANG_PW_SEMENTARA = 12;

/**
 * Membuat password sementara yang mudah dibacakan lewat telepon tetapi tetap
 * memenuhi syarat (huruf besar, huruf kecil, angka).
 *
 * Huruf yang mudah tertukar (I, l, 1, O, 0) sengaja dihindari — password ini
 * akan dibacakan atau ditulis di kertas.
 */
function buatPasswordSementara(): string {
  const hurufKecil = 'abcdefghjkmnpqrstuvwxyz'; // tanpa i, l, o
  const hurufBesar = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // tanpa I, O
  const angka = '23456789'; // tanpa 0, 1
  const semua = hurufKecil + hurufBesar + angka;

  const ambil = (kumpulan: string) => kumpulan[Math.floor(Math.random() * kumpulan.length)];
  const inti = Array.from({ length: PANJANG_PW_SEMENTARA - 3 }, () => ambil(semua));

  // pastikan memenuhi syarat minimal, lalu acak urutannya
  const wajib = [ambil(hurufKecil), ambil(hurufBesar), ambil(angka)];
  const gabung = [...inti, ...wajib];
  for (let i = gabung.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [gabung[i], gabung[j]] = [gabung[j], gabung[i]];
  }

  const hasil = gabung.join('');
  // jaring pengaman: kalau karena kebetulan tidak memenuhi syarat, ulangi
  return validasiPassword(hasil) === null ? hasil : buatPasswordSementara();
}

/** Berapa admin aktif yang tersisa (selain id yang dikecualikan)? */
async function adminAktifLain(kecualiId: string): Promise<number> {
  return prisma.pengguna.count({
    where: { peran: 'ADMIN', aktif: true, id: { not: kecualiId } },
  });
}

/** Validasi masukan dasar yang dipakai bersama oleh tambah & ubah. */
function validasiMasukan(nama: string, email: string): string | null {
  if (nama.trim().length < 3) return 'Nama minimal 3 karakter.';
  if (nama.length > 80) return 'Nama maksimal 80 karakter.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Format email tidak valid.';
  if (email.length > 120) return 'Email maksimal 120 karakter.';
  return null;
}

// ===========================================================================
// Tambah pengguna
// ===========================================================================

export async function tambahPengguna(
  _sebelumnya: HasilAksi,
  formData: FormData
): Promise<HasilAksi> {
  const saya = await penggunaDariSesi();
  const tolak = wajibKemampuan(saya, 'kelola_pengguna');
  if (tolak || !saya) return { error: tolak ?? 'Sesi habis.' };

  const nama = String(formData.get('nama') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const peran = String(formData.get('peran') ?? 'KREATOR');
  const brandId = String(formData.get('brandId') ?? '').trim();
  const passwordMentah = String(formData.get('password') ?? '').trim();

  const salah = validasiMasukan(nama, email);
  if (salah) return { error: salah };
  if (!PERAN.includes(peran as Peran)) return { error: 'Peran tidak dikenal.' };

  const ada = await prisma.pengguna.findUnique({ where: { email }, select: { id: true } });
  if (ada) return { error: `Email ${email} sudah dipakai akun lain.` };

  // password: pakai yang diisi admin, atau buatkan otomatis
  let password = passwordMentah;
  let dibuatOtomatis = false;
  if (!password) {
    password = buatPasswordSementara();
    dibuatOtomatis = true;
  } else {
    const lemah = validasiPassword(password);
    if (lemah) return { error: lemah };
  }

  const baru = await prisma.pengguna.create({
    data: {
      nama,
      email,
      peran: peran as Peran,
      passwordHash: await hashPassword(password),
      brandId: brandId || null,
      // akun baru WAJIB mengganti password saat login pertama — termasuk yang
      // passwordnya dibuat admin. Ini mencegah password yang diketahui orang
      // lain dipakai terus.
      harusGantiPassword: true,
    },
  });

  await catatAudit({
    penggunaId: saya.id,
    aksi: 'TAMBAH_PENGGUNA',
    entitas: 'Pengguna',
    entitasId: baru.id,
    dataBaru: { nama, email, peran, passwordDibuatOtomatis: dibuatOtomatis },
  });

  revalidatePath('/pengguna');
  revalidatePath('/audit');

  return {
    sukses: true,
    pesan: `Akun ${nama} dibuat. Wajib mengganti password saat login pertama.`,
    // ditampilkan SEKALI ke admin supaya bisa disampaikan; tidak disimpan di mana pun
    ...(dibuatOtomatis ? { passwordSementara: password } : {}),
  };
}

// ===========================================================================
// Ubah pengguna (nama, email, peran, brand, status aktif)
// ===========================================================================

export async function ubahPengguna(
  _sebelumnya: HasilAksi,
  formData: FormData
): Promise<HasilAksi> {
  const saya = await penggunaDariSesi();
  const tolak = wajibKemampuan(saya, 'kelola_pengguna');
  if (tolak || !saya) return { error: tolak ?? 'Sesi habis.' };

  const id = String(formData.get('id') ?? '');
  const nama = String(formData.get('nama') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const peran = String(formData.get('peran') ?? '');
  const brandId = String(formData.get('brandId') ?? '').trim();
  const aktif = formData.get('aktif') === 'on';

  const salah = validasiMasukan(nama, email);
  if (salah) return { error: salah };
  if (!PERAN.includes(peran as Peran)) return { error: 'Peran tidak dikenal.' };

  const target = await prisma.pengguna.findUnique({
    where: { id },
    select: { id: true, nama: true, email: true, peran: true, aktif: true },
  });
  if (!target) return { error: 'Pengguna tidak ditemukan.' };

  const untukDiriSendiri = target.id === saya.id;

  // ==== penjagaan terhadap diri sendiri ====
  if (untukDiriSendiri && !aktif) {
    return { error: 'Anda tidak dapat menonaktifkan akun Anda sendiri.' };
  }
  if (untukDiriSendiri && peran !== target.peran) {
    return { error: 'Anda tidak dapat mengubah peran Anda sendiri — minta admin lain melakukannya.' };
  }

  // ==== penjagaan admin terakhir ====
  const adminLain = await adminAktifLain(target.id);
  const targetAdminAktif = target.peran === 'ADMIN' && target.aktif;
  const akanKehilanganAdmin =
    targetAdminAktif && (peran !== 'ADMIN' || !aktif);

  if (akanKehilanganAdmin && adminLain === 0) {
    return {
      error:
        'Ini satu-satunya administrator aktif. Menurunkan peran atau menonaktifkannya akan mengunci pengaturan aplikasi. Tambahkan admin lain dulu.',
    };
  }

  // ==== email tidak boleh bentrok ====
  if (email !== target.email) {
    const bentrok = await prisma.pengguna.findUnique({ where: { email }, select: { id: true } });
    if (bentrok && bentrok.id !== target.id) {
      return { error: `Email ${email} sudah dipakai akun lain.` };
    }
  }

  await prisma.pengguna.update({
    where: { id },
    data: { nama, email, peran: peran as Peran, aktif, brandId: brandId || null },
  });

  // kalau akun dinonaktifkan, sesi aktifnya dicabut supaya tidak bisa dipakai lagi
  if (target.aktif && !aktif) {
    await prisma.sesi.updateMany({
      where: { penggunaId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await catatAudit({
    penggunaId: saya.id,
    aksi: 'UBAH_PENGGUNA',
    entitas: 'Pengguna',
    entitasId: id,
    dataLama: { nama: target.nama, peran: target.peran, aktif: target.aktif },
    dataBaru: { nama, peran, aktif },
  });

  revalidatePath('/pengguna');
  revalidatePath('/audit');

  const catatanNonaktif = target.aktif && !aktif ? ' Sesi aktifnya sudah dicabut.' : '';
  return { sukses: true, pesan: `Perubahan untuk ${nama} disimpan.${catatanNonaktif}` };
}

// ===========================================================================
// Reset password
// ===========================================================================

export async function resetPassword(
  _sebelumnya: HasilAksi,
  formData: FormData
): Promise<HasilAksi> {
  const saya = await penggunaDariSesi();
  const tolak = wajibKemampuan(saya, 'kelola_pengguna');
  if (tolak || !saya) return { error: tolak ?? 'Sesi habis.' };

  const id = String(formData.get('id') ?? '');
  const passwordBaru = String(formData.get('password') ?? '').trim();

  const target = await prisma.pengguna.findUnique({
    where: { id },
    select: { id: true, nama: true, email: true },
  });
  if (!target) return { error: 'Pengguna tidak ditemukan.' };

  let password = passwordBaru;
  let dibuatOtomatis = false;
  if (!password) {
    password = buatPasswordSementara();
    dibuatOtomatis = true;
  } else {
    const lemah = validasiPassword(password);
    if (lemah) return { error: lemah };
  }

  await prisma.pengguna.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(password),
      // wajib diganti saat login berikutnya
      harusGantiPassword: true,
    },
  });

  // semua sesi lama dicabut: kalau password direset karena akun diduga dipakai
  // orang lain, sesi lama harus mati
  const dicabut = await prisma.sesi.updateMany({
    where: { penggunaId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await catatAudit({
    penggunaId: saya.id,
    aksi: 'RESET_PASSWORD',
    entitas: 'Pengguna',
    entitasId: id,
    dataBaru: { email: target.email, dibuatOtomatis, sesiDicabut: dicabut.count },
  });

  revalidatePath('/pengguna');
  revalidatePath('/audit');

  return {
    sukses: true,
    pesan: `Password ${target.nama} direset. ${
      dicabut.count > 0 ? `${dicabut.count} sesi lama dicabut. ` : ''
    }Wajib diganti saat login berikutnya.`,
    ...(dibuatOtomatis ? { passwordSementara: password } : {}),
  };
}

// ===========================================================================
// Hapus pengguna
// ===========================================================================

export async function hapusPengguna(
  _sebelumnya: HasilAksi,
  formData: FormData
): Promise<HasilAksi> {
  const saya = await penggunaDariSesi();
  const tolak = wajibKemampuan(saya, 'kelola_pengguna');
  if (tolak || !saya) return { error: tolak ?? 'Sesi habis.' };

  const id = String(formData.get('id') ?? '');
  const target = await prisma.pengguna.findUnique({
    where: { id },
    select: {
      id: true,
      nama: true,
      email: true,
      peran: true,
      aktif: true,
      _count: { select: { kontenDibuat: true, keputusan: true } },
    },
  });
  if (!target) return { error: 'Pengguna tidak ditemukan.' };

  if (target.id === saya.id) {
    return { error: 'Anda tidak dapat menghapus akun Anda sendiri.' };
  }

  // admin terakhir tidak boleh hilang
  if (target.peran === 'ADMIN' && target.aktif && (await adminAktifLain(target.id)) === 0) {
    return { error: 'Ini satu-satunya administrator aktif dan tidak dapat dihapus.' };
  }

  /**
   * Pengguna yang sudah punya jejak (konten atau keputusan) TIDAK dihapus,
   * melainkan dinonaktifkan. Alasannya: menghapusnya akan memutus relasi
   * `Konten.pembuatId` dan `Keputusan.olehId`, sehingga riwayat approval
   * kehilangan pelakunya — jejak yang justru dibutuhkan untuk audit.
   */
  const punyaJejak = target._count.kontenDibuat > 0 || target._count.keputusan > 0;

  if (punyaJejak) {
    await prisma.pengguna.update({
      where: { id },
      data: { aktif: false },
    });
    await prisma.sesi.updateMany({
      where: { penggunaId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await catatAudit({
      penggunaId: saya.id,
      aksi: 'NONAKTIFKAN_PENGGUNA',
      entitas: 'Pengguna',
      entitasId: id,
      dataLama: { email: target.email, aktif: true },
      dataBaru: {
        aktif: false,
        alasan: 'Dinonaktifkan, bukan dihapus, karena punya riwayat konten/keputusan',
      },
    });

    revalidatePath('/pengguna');
    revalidatePath('/audit');

    return {
      sukses: true,
      pesan:
        `${target.nama} tidak dihapus melainkan dinonaktifkan, karena punya ` +
        `${target._count.kontenDibuat} konten dan ${target._count.keputusan} keputusan. ` +
        'Menghapusnya akan membuat riwayat approval kehilangan pelakunya.',
    };
  }

  // belum punya jejak: aman dihapus
  await prisma.sesi.deleteMany({ where: { penggunaId: id } });
  await prisma.pengguna.delete({ where: { id } });

  await catatAudit({
    penggunaId: saya.id,
    aksi: 'HAPUS_PENGGUNA',
    entitas: 'Pengguna',
    entitasId: id,
    dataLama: { nama: target.nama, email: target.email, peran: target.peran },
  });

  revalidatePath('/pengguna');
  revalidatePath('/audit');

  return { sukses: true, pesan: `Akun ${target.nama} dihapus.` };
}

// ===========================================================================
// Data untuk form
// ===========================================================================

/** Daftar brand untuk pilihan di form. */
export async function daftarBrand(): Promise<{ id: string; nama: string; kode: string }[]> {
  return prisma.brand.findMany({
    where: { aktif: true },
    select: { id: true, nama: true, kode: true },
    orderBy: { nama: 'asc' },
  });
}
