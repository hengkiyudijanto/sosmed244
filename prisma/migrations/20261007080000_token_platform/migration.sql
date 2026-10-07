-- Kredensial platform yang berubah seiring waktu (hasil pembaruan token).
--
-- Kenapa di database: token Meta & TikTok punya masa berlaku, dan pembaruannya
-- menghasilkan token BARU yang harus disimpan supaya dipakai pengiriman
-- berikutnya. Di Vercel filesystem-nya sementara, dan environment variable
-- tidak bisa diubah dari dalam aplikasi yang sedang berjalan.

-- CreateTable
CREATE TABLE "TokenPlatform" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "accessExpiresAt" TIMESTAMP(3),
    "refreshExpiresAt" TIMESTAMP(3),
    "diperbaruiAt" TIMESTAMP(3),
    "galatTerakhir" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenPlatform_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenPlatform_platform_key" ON "TokenPlatform"("platform");
