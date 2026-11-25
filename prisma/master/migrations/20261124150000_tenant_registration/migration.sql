-- Fase 2 Alur Pendaftaran Tenant Baru (Bab 7.1 Jalur B): catatan pendaftaran
-- + dokumen verifikasi di master DB. Ditulis dengan tangan 2026-11-24.
-- Pendaftaran TIDAK membuat tenant/akun — provisioning terjadi di Fase 3
-- saat Master menyetujui (memakai ulang registerCompany).
-- CreateTable
CREATE TABLE "TenantRegistration" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "legalEntityType" TEXT NOT NULL,
    "businessField" TEXT NOT NULL,
    "companyAddress" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "companyPhone" TEXT NOT NULL,
    "picName" TEXT NOT NULL,
    "picPosition" TEXT NOT NULL,
    "picEmail" TEXT NOT NULL,
    "picPhone" TEXT NOT NULL,
    "nib" TEXT,
    "userTierId" TEXT,
    "storageTierId" TEXT,
    "moduleKeys" TEXT[] NOT NULL DEFAULT '{}',
    "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "startChoice" TEXT NOT NULL DEFAULT 'TRIAL',
    "packageSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "selfAssessmentJson" TEXT NOT NULL DEFAULT '{}',
    "npwpStatus" TEXT NOT NULL DEFAULT 'HAS_NPWP',
    "npwpStatement" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "statusToken" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantRegistration_statusToken_key" ON "TenantRegistration"("statusToken");
CREATE INDEX "TenantRegistration_status_idx" ON "TenantRegistration"("status");
CREATE INDEX "TenantRegistration_picEmail_idx" ON "TenantRegistration"("picEmail");
CREATE INDEX "TenantRegistration_nib_idx" ON "TenantRegistration"("nib");

-- CreateTable
CREATE TABLE "TenantRegistrationDocument" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "docSubtype" TEXT,
    "fileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantRegistrationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantRegistrationDocument_registrationId_idx" ON "TenantRegistrationDocument"("registrationId");

-- AddForeignKey
ALTER TABLE "TenantRegistrationDocument" ADD CONSTRAINT "TenantRegistrationDocument_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "TenantRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
