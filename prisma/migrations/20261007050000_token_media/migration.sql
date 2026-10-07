-- Token sekali-pakai untuk berkas media: dipakai platform (TikTok/Instagram)
-- saat menarik berkas dari URL publik, karena platform tidak punya sesi login.
--
-- Token disimpan sebagai HASH (seperti token sesi): kalau database bocor, isinya
-- tidak bisa dipakai menarik berkas organisasi.

-- CreateTable
CREATE TABLE "TokenMedia" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "kontenId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "jumlahPakai" INTEGER NOT NULL DEFAULT 0,
    "maksPakai" INTEGER NOT NULL DEFAULT 2,
    "untukKirim" BOOLEAN NOT NULL DEFAULT true,
    "dipakaiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenMedia_tokenHash_key" ON "TokenMedia"("tokenHash");
CREATE INDEX "TokenMedia_mediaId_idx" ON "TokenMedia"("mediaId");
CREATE INDEX "TokenMedia_kontenId_idx" ON "TokenMedia"("kontenId");
CREATE INDEX "TokenMedia_expiresAt_idx" ON "TokenMedia"("expiresAt");

-- AddForeignKey
ALTER TABLE "TokenMedia" ADD CONSTRAINT "TokenMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
