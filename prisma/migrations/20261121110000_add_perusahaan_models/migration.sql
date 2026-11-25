-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'Indonesia',
ADD COLUMN     "district" TEXT,
ADD COLUMN     "entityForm" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "profileCompletedAt" TIMESTAMP(3),
ADD COLUMN     "profileStatus" TEXT NOT NULL DEFAULT 'BELUM_LENGKAP',
ADD COLUMN     "province" TEXT,
ADD COLUMN     "village" TEXT;

-- CreateTable
CREATE TABLE "CompanyTax" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "npwp15" TEXT,
    "npwp16" TEXT,
    "taxDate" TIMESTAMP(3),
    "taxpayerName" TEXT,
    "isTaxpayer" BOOLEAN NOT NULL DEFAULT false,
    "taxIdNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "label" TEXT,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalSize" INTEGER NOT NULL,
    "compressedSize" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DIAJUKAN',
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifyNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyTax_organizationId_key" ON "CompanyTax"("organizationId");

-- CreateIndex
CREATE INDEX "CompanyTax_organizationId_idx" ON "CompanyTax"("organizationId");

-- CreateIndex
CREATE INDEX "CompanyDocument_organizationId_idx" ON "CompanyDocument"("organizationId");

-- CreateIndex
CREATE INDEX "CompanyDocument_organizationId_docType_idx" ON "CompanyDocument"("organizationId", "docType");

-- CreateIndex
CREATE INDEX "CompanyDocument_organizationId_status_idx" ON "CompanyDocument"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CompanyDocument_uploadedById_idx" ON "CompanyDocument"("uploadedById");

-- AddForeignKey
ALTER TABLE "CompanyTax" ADD CONSTRAINT "CompanyTax_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

