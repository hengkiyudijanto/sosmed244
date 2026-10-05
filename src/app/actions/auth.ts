'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  buatSesi,
  catatAudit,
  hapusSesi,
  hashPassword,
  penggunaDariSesi,
  validasiPassword,
  verifikasiPassword,
} from '@/lib/auth';

export type HasilLogin = { error?: string };

const skemaLogin = z.object({
  email: z.string().trim().min(1, 'Email wajib diisi').email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

export async function masuk(
  _sebelumnya: HasilLogin,
  formData: FormData
): Promise<HasilLogin> {
  const parsed = skemaLogin.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { email, password } = parsed.data;
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
  const userAgent = h.get('user-agent') ?? undefined;

  const pengguna = await prisma.pengguna.findUnique({
    where: { email: email.toLowerCase() },
  });

  // Pesan gagal disamakan untuk "email tidak terdaftar" dan "password salah",
  // supaya tidak bisa dipakai menebak email mana yang terdaftar.
  const PESAN_GAGAL = 'Email atau password salah';

  if (!pengguna) {
    await catatAudit({ aksi: 'LOGIN_GAGAL', entitas: 'Pengguna', dataBaru: { email }, ip, userAgent });
    return { error: PESAN_GAGAL };
  }

  if (!pengguna.aktif) return { error: 'Akun tidak aktif. Hubungi administrator.' };

  const cocok = await verifikasiPassword(password, pengguna.passwordHash);
  if (!cocok) {
    await catatAudit({
      penggunaId: pengguna.id,
      aksi: 'LOGIN_GAGAL',
      entitas: 'Pengguna',
      entitasId: pengguna.id,
      ip,
      userAgent,
    });
    return { error: PESAN_GAGAL };
  }

  await buatSesi(pengguna.id, { ip, userAgent });
  await prisma.pengguna.update({
    where: { id: pengguna.id },
    data: { lastLoginAt: new Date() },
  });
  await catatAudit({
    penggunaId: pengguna.id,
    aksi: 'LOGIN',
    entitas: 'Pengguna',
    entitasId: pengguna.id,
    ip,
    userAgent,
  });

  if (pengguna.harusGantiPassword) redirect('/ubah-password');
  redirect('/');
}

export async function keluar(): Promise<void> {
  const pengguna = await penggunaDariSesi();
  if (pengguna) {
    await catatAudit({
      penggunaId: pengguna.id,
      aksi: 'LOGOUT',
      entitas: 'Pengguna',
      entitasId: pengguna.id,
    });
  }
  await hapusSesi();
  redirect('/masuk');
}

export type HasilUbahPassword = { error?: string; sukses?: boolean; pesan?: string };

export async function ubahPassword(
  _sebelumnya: HasilUbahPassword,
  formData: FormData
): Promise<HasilUbahPassword> {
  const pengguna = await penggunaDariSesi();
  if (!pengguna) return { error: 'Sesi habis. Silakan masuk kembali.' };

  const lama = String(formData.get('lama') ?? '');
  const baru = String(formData.get('baru') ?? '');
  const ulang = String(formData.get('ulang') ?? '');

  if (!lama || !baru) return { error: 'Password lama dan baru wajib diisi.' };
  if (baru !== ulang) return { error: 'Konfirmasi password tidak sama.' };

  const lemah = validasiPassword(baru);
  if (lemah) return { error: lemah };

  const db = await prisma.pengguna.findUnique({
    where: { id: pengguna.id },
    select: { passwordHash: true },
  });
  if (!db) return { error: 'Akun tidak ditemukan.' };

  if (!(await verifikasiPassword(lama, db.passwordHash))) {
    return { error: 'Password lama tidak sesuai.' };
  }
  if (await verifikasiPassword(baru, db.passwordHash)) {
    return { error: 'Password baru sama dengan yang lama. Pilih yang berbeda.' };
  }

  await prisma.pengguna.update({
    where: { id: pengguna.id },
    data: { passwordHash: await hashPassword(baru), harusGantiPassword: false },
  });

  await catatAudit({
    penggunaId: pengguna.id,
    aksi: 'UBAH_PASSWORD',
    entitas: 'Pengguna',
    entitasId: pengguna.id,
  });

  return { sukses: true, pesan: 'Password berhasil diubah.' };
}
