-- CreateEnum
CREATE TYPE "Peran" AS ENUM ('KREATOR', 'PENYETUJU', 'ADMIN');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('TIKTOK', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "JenisMedia" AS ENUM ('GAMBAR', 'VIDEO');

-- CreateEnum
CREATE TYPE "TujuanPlatform" AS ENUM ('TIKTOK', 'INSTAGRAM', 'KEDUANYA');

-- CreateEnum
CREATE TYPE "StatusKonten" AS ENUM ('DRAFT', 'MENUNGGU', 'REVISI', 'DISETUJUI', 'DIJADWALKAN', 'DIKIRIM', 'DIARSIPKAN');

-- CreateTable
CREATE TABLE "Pengguna" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "peran" "Peran" NOT NULL DEFAULT 'KREATOR',
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "harusGantiPassword" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "brandId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pengguna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sesi" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "penggunaId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sesi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "keterangan" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AkunPlatform" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "namaAkun" TEXT NOT NULL,
    "idPlatform" TEXT,
    "terhubung" BOOLEAN NOT NULL DEFAULT false,
    "keterangan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AkunPlatform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Konten" (
    "id" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "jenis" "JenisMedia" NOT NULL,
    "tujuan" "TujuanPlatform" NOT NULL DEFAULT 'KEDUANYA',
    "status" "StatusKonten" NOT NULL DEFAULT 'DRAFT',
    "mediaData" TEXT,
    "mediaMime" TEXT,
    "mediaByte" INTEGER,
    "mediaLebar" INTEGER,
    "mediaTinggi" INTEGER,
    "durasiDetik" INTEGER,
    "mediaDilihat" INTEGER NOT NULL DEFAULT 0,
    "versiMedia" INTEGER NOT NULL DEFAULT 1,
    "catatanKreator" TEXT,
    "alasanRevisi" TEXT,
    "catatanPenyetuju" TEXT,
    "jumlahRevisi" INTEGER NOT NULL DEFAULT 0,
    "pembuatId" TEXT NOT NULL,
    "penyetujuId" TEXT,
    "pengajuId" TEXT,
    "brandId" TEXT,
    "diajukanAt" TIMESTAMP(3),
    "diputusAt" TIMESTAMP(3),
    "jadwalAt" TIMESTAMP(3),
    "hasilKirim" JSONB,
    "terkirimAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Konten_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Keputusan" (
    "id" TEXT NOT NULL,
    "kontenId" TEXT NOT NULL,
    "aksi" TEXT NOT NULL,
    "catatan" TEXT,
    "olehId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Keputusan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "penggunaId" TEXT,
    "aksi" TEXT NOT NULL,
    "entitas" TEXT,
    "entitasId" TEXT,
    "dataLama" JSONB,
    "dataBaru" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pengguna_email_key" ON "Pengguna"("email");

-- CreateIndex
CREATE INDEX "Pengguna_peran_idx" ON "Pengguna"("peran");

-- CreateIndex
CREATE INDEX "Pengguna_brandId_idx" ON "Pengguna"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Sesi_tokenHash_key" ON "Sesi"("tokenHash");

-- CreateIndex
CREATE INDEX "Sesi_penggunaId_idx" ON "Sesi"("penggunaId");

-- CreateIndex
CREATE INDEX "Sesi_expiresAt_idx" ON "Sesi"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_kode_key" ON "Brand"("kode");

-- CreateIndex
CREATE INDEX "Brand_kode_idx" ON "Brand"("kode");

-- CreateIndex
CREATE INDEX "AkunPlatform_platform_idx" ON "AkunPlatform"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "AkunPlatform_platform_namaAkun_key" ON "AkunPlatform"("platform", "namaAkun");

-- CreateIndex
CREATE INDEX "Konten_status_idx" ON "Konten"("status");

-- CreateIndex
CREATE INDEX "Konten_pembuatId_idx" ON "Konten"("pembuatId");

-- CreateIndex
CREATE INDEX "Konten_penyetujuId_idx" ON "Konten"("penyetujuId");

-- CreateIndex
CREATE INDEX "Konten_jadwalAt_idx" ON "Konten"("jadwalAt");

-- CreateIndex
CREATE INDEX "Konten_createdAt_idx" ON "Konten"("createdAt");

-- CreateIndex
CREATE INDEX "Konten_brandId_idx" ON "Konten"("brandId");

-- CreateIndex
CREATE INDEX "Keputusan_kontenId_idx" ON "Keputusan"("kontenId");

-- CreateIndex
CREATE INDEX "Keputusan_createdAt_idx" ON "Keputusan"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_penggunaId_idx" ON "AuditLog"("penggunaId");

-- CreateIndex
CREATE INDEX "AuditLog_aksi_idx" ON "AuditLog"("aksi");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Pengguna" ADD CONSTRAINT "Pengguna_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sesi" ADD CONSTRAINT "Sesi_penggunaId_fkey" FOREIGN KEY ("penggunaId") REFERENCES "Pengguna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Konten" ADD CONSTRAINT "Konten_pembuatId_fkey" FOREIGN KEY ("pembuatId") REFERENCES "Pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Konten" ADD CONSTRAINT "Konten_penyetujuId_fkey" FOREIGN KEY ("penyetujuId") REFERENCES "Pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Konten" ADD CONSTRAINT "Konten_pengajuId_fkey" FOREIGN KEY ("pengajuId") REFERENCES "Pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Konten" ADD CONSTRAINT "Konten_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Keputusan" ADD CONSTRAINT "Keputusan_kontenId_fkey" FOREIGN KEY ("kontenId") REFERENCES "Konten"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Keputusan" ADD CONSTRAINT "Keputusan_olehId_fkey" FOREIGN KEY ("olehId") REFERENCES "Pengguna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_penggunaId_fkey" FOREIGN KEY ("penggunaId") REFERENCES "Pengguna"("id") ON DELETE SET NULL ON UPDATE CASCADE;
