import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from './db';
import type { Peran } from './konten/akses';

/**
 * Autentikasi: email + password, sesi berbasis cookie.
 *
 * Keputusan yang dipegang:
 *  - Password selalu di-hash (bcrypt). Tidak ada plaintext di mana pun.
 *  - Token sesi disimpan sebagai HASH di database. Kalau database bocor, token
 *    yang ada di dalamnya tidak bisa dipakai untuk masuk.
 *  - Cookie httpOnly + secure di produksi, jadi JavaScript di peramban tidak
 *    bisa membacanya.
 */

const NAMA_COOKIE = 'sosmed244_sesi';
const UMUR_SESI_HARI = 7;

// ===========================================================================
// Password
// ===========================================================================

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function verifikasiPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Aturan kekuatan password. Sengaja tidak terlalu kaku supaya orang tidak
 * menuliskannya di kertas — tapi cukup untuk menolak yang terlalu lemah.
 */
export function validasiPassword(pw: string): string | null {
  if (pw.length < 8) return 'Password minimal 8 karakter';
  if (!/[a-z]/.test(pw)) return 'Password harus mengandung huruf kecil';
  if (!/[A-Z]/.test(pw)) return 'Password harus mengandung huruf besar';
  if (!/[0-9]/.test(pw)) return 'Password harus mengandung angka';
  return null;
}

// ===========================================================================
// Sesi
// ===========================================================================

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function buatSesi(
  penggunaId: string,
  meta?: { ip?: string; userAgent?: string }
): Promise<void> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + UMUR_SESI_HARI * 24 * 60 * 60 * 1000);

  await prisma.sesi.create({
    data: {
      tokenHash: hashToken(token),
      penggunaId,
      expiresAt,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    },
  });

  const jar = await cookies();
  jar.set(NAMA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export type PenggunaSesi = {
  id: string;
  email: string;
  nama: string;
  peran: Peran;
  harusGantiPassword: boolean;
  brand: { id: string; nama: string; kode: string } | null;
};

/** Ambil pengguna dari sesi aktif, atau null kalau tidak ada / kedaluwarsa. */
export async function penggunaDariSesi(): Promise<PenggunaSesi | null> {
  const jar = await cookies();
  const token = jar.get(NAMA_COOKIE)?.value;
  if (!token) return null;

  const sesi = await prisma.sesi.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      pengguna: {
        include: { brand: { select: { id: true, nama: true, kode: true } } },
      },
    },
  });

  if (!sesi || sesi.revokedAt || sesi.expiresAt < new Date()) return null;
  if (!sesi.pengguna.aktif) return null;

  const p = sesi.pengguna;
  return {
    id: p.id,
    email: p.email,
    nama: p.nama,
    peran: p.peran,
    harusGantiPassword: p.harusGantiPassword,
    brand: p.brand,
  };
}

export async function hapusSesi(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(NAMA_COOKIE)?.value;
  if (token) {
    await prisma.sesi.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(NAMA_COOKIE);
}

// ===========================================================================
// Audit
// ===========================================================================

/**
 * Catat aksi ke audit log.
 * Gagal mencatat TIDAK boleh menggagalkan aksi utamanya — audit itu penting,
 * tapi menolak simpan konten karena log gagal lebih merugikan pemakai.
 */
export async function catatAudit(data: {
  penggunaId?: string;
  aksi: string;
  entitas?: string;
  entitasId?: string;
  dataLama?: unknown;
  dataBaru?: unknown;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        penggunaId: data.penggunaId,
        aksi: data.aksi,
        entitas: data.entitas,
        entitasId: data.entitasId,
        dataLama: data.dataLama as never,
        dataBaru: data.dataBaru as never,
        ip: data.ip,
        userAgent: data.userAgent,
      },
    });
  } catch (e) {
    console.error('[audit] gagal mencatat:', e);
  }
}
