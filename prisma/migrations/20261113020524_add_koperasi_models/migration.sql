-- CreateTable
CREATE TABLE "KoperasiAnggota" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cabang" TEXT NOT NULL DEFAULT '',
    "nik" TEXT NOT NULL,
    "namaLengkap" TEXT NOT NULL,
    "tempatLahir" TEXT NOT NULL DEFAULT '',
    "tanggalLahir" DATE,
    "jenisKelamin" TEXT NOT NULL DEFAULT '',
    "alamatKtp" TEXT NOT NULL DEFAULT '',
    "noHp" TEXT NOT NULL DEFAULT '',
    "namaIbuKandung" TEXT NOT NULL DEFAULT '',
    "pekerjaan" TEXT NOT NULL DEFAULT '',
    "statusPerkawinan" TEXT NOT NULL DEFAULT '',
    "penghasilanBulanan" TEXT NOT NULL DEFAULT '',
    "tujuanKeanggotaan" TEXT NOT NULL DEFAULT '',
    "fotoKtpPath" TEXT NOT NULL DEFAULT '',
    "fotoAnggotaPath" TEXT NOT NULL DEFAULT '',
    "tandaTanganPath" TEXT NOT NULL DEFAULT '',
    "setujuMobileBanking" BOOLEAN NOT NULL DEFAULT false,
    "setujuPernyataan" BOOLEAN NOT NULL DEFAULT false,
    "hasSimpanan" BOOLEAN NOT NULL DEFAULT false,
    "hasPinjaman" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KoperasiAnggota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KoperasiSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KoperasiSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KoperasiAnggota_organizationId_namaLengkap_idx" ON "KoperasiAnggota"("organizationId", "namaLengkap");

-- CreateIndex
CREATE INDEX "KoperasiAnggota_organizationId_cabang_idx" ON "KoperasiAnggota"("organizationId", "cabang");

-- CreateIndex
CREATE UNIQUE INDEX "KoperasiAnggota_organizationId_nik_key" ON "KoperasiAnggota"("organizationId", "nik");

-- CreateIndex
CREATE UNIQUE INDEX "KoperasiSetting_organizationId_key_key" ON "KoperasiSetting"("organizationId", "key");

-- AddForeignKey
ALTER TABLE "KoperasiAnggota" ADD CONSTRAINT "KoperasiAnggota_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KoperasiSetting" ADD CONSTRAINT "KoperasiSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

