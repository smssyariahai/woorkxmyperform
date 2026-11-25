-- Fase 1 Alur Pendaftaran Tenant Baru (Bab 9.1-9.4): katalog paket & harga
-- di master DB. Ditulis dengan tangan 2026-11-24. Harga = DATA (bisa diubah
-- Master lewat UI Paket & Harga), bukan konstanta di kode.
-- CreateTable
CREATE TABLE "PackageUserTier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxUsers" INTEGER,
    "monthlyPrice" INTEGER,
    "yearlyPrice" INTEGER,
    "isCustomPrice" BOOLEAN NOT NULL DEFAULT false,
    "minStorageGb" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageUserTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackageUserTier_name_key" ON "PackageUserTier"("name");
CREATE INDEX "PackageUserTier_status_idx" ON "PackageUserTier"("status");
CREATE INDEX "PackageUserTier_sortOrder_idx" ON "PackageUserTier"("sortOrder");

-- CreateTable
CREATE TABLE "PackageStorageTier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacityGb" INTEGER,
    "monthlyPrice" INTEGER,
    "yearlyPrice" INTEGER,
    "isCustomPrice" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageStorageTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackageStorageTier_name_key" ON "PackageStorageTier"("name");
CREATE INDEX "PackageStorageTier_status_idx" ON "PackageStorageTier"("status");
CREATE INDEX "PackageStorageTier_sortOrder_idx" ON "PackageStorageTier"("sortOrder");

-- CreateTable
CREATE TABLE "PackageModulePrice" (
    "id" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyPrice" INTEGER NOT NULL,
    "yearlyPrice" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageModulePrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackageModulePrice_moduleKey_key" ON "PackageModulePrice"("moduleKey");
CREATE INDEX "PackageModulePrice_status_idx" ON "PackageModulePrice"("status");

-- CreateTable
CREATE TABLE "BillingSettings" (
    "id" TEXT NOT NULL,
    "ppnRateBps" INTEGER NOT NULL DEFAULT 1100,
    "invoiceValidityHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSettings_pkey" PRIMARY KEY ("id")
);

-- AlterTable (Subscription: rujukan paket + salinan harga/batas saat
-- berlangganan. String polos tanpa FK Prisma, konsisten pola Opsi A;
-- dipakai Fase 2/3/5. Baris tenant yang sudah ada tidak berubah.)
ALTER TABLE "Subscription" ADD COLUMN "userTierId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "storageTierId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "moduleKeys" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Subscription" ADD COLUMN "packageSnapshotJson" TEXT NOT NULL DEFAULT '{}';
