-- Jenis postingan (FEED/REELS/STORY/CAROUSEL) + berkas media dipindah ke tabel sendiri.
--
-- Kenapa satu berkas per baris: carousel butuh 2-10 berkas dalam SATU unggahan,
-- dan story berderet juga beberapa berkas. Urutan disimpan eksplisit karena item
-- pertama carousel menentukan potongan rasio.
--
-- Isi kolom mediaData/mediaMime/... DIPINDAHKAN ke tabel Media lebih dulu, baru
-- kolomnya dihapus: tanpa urutan ini, seluruh berkas yang sudah diunggah hilang.

-- CreateEnum
CREATE TYPE "JenisPosting" AS ENUM ('FEED', 'REELS', 'STORY', 'CAROUSEL');

-- AlterTable
ALTER TABLE "Konten" ADD COLUMN "jenisPosting" "JenisPosting" NOT NULL DEFAULT 'FEED';

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "kontenId" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "jenis" "JenisMedia" NOT NULL,
    "data" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "byte" INTEGER NOT NULL,
    "lebar" INTEGER,
    "tinggi" INTEGER,
    "durasiDetik" INTEGER,
    "versi" INTEGER NOT NULL DEFAULT 1,
    "dilihat" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Media_kontenId_urutan_idx" ON "Media"("kontenId", "urutan");

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_kontenId_fkey" FOREIGN KEY ("kontenId") REFERENCES "Konten"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pindahkan berkas yang sudah ada ke tabel Media (satu baris per konten)
INSERT INTO "Media" ("id", "kontenId", "urutan", "jenis", "data", "mime", "byte", "lebar", "tinggi", "durasiDetik", "versi", "dilihat", "createdAt", "updatedAt")
SELECT
  'migr_' || "id",
  "id",
  0,
  "jenis",
  "mediaData",
  "mediaMime",
  COALESCE("mediaByte", 0),
  "mediaLebar",
  "mediaTinggi",
  "durasiDetik",
  "versiMedia",
  "mediaDilihat",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Konten"
WHERE "mediaData" IS NOT NULL AND "mediaMime" IS NOT NULL;

-- Jenis postingan yang masuk akal untuk data lama:
--   video  -> REELS (video pendek vertikal adalah bentuk paling umum)
--   gambar -> FEED
UPDATE "Konten" SET "jenisPosting" = CASE WHEN "jenis" = 'VIDEO' THEN 'REELS'::"JenisPosting" ELSE 'FEED'::"JenisPosting" END;

-- AlterTable: kolom media lama tidak dipakai lagi
ALTER TABLE "Konten" DROP COLUMN "mediaData",
DROP COLUMN "mediaMime",
DROP COLUMN "mediaByte",
DROP COLUMN "mediaLebar",
DROP COLUMN "mediaTinggi",
DROP COLUMN "durasiDetik";
