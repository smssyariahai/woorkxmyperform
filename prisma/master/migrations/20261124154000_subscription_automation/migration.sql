-- Fase 5 Alur Pendaftaran Tenant Baru (§7.7): otomasi langganan di master DB.
-- Ditulis dengan tangan 2026-11-24.
-- Kolom graceEndsAt di Subscription + tabel invoice perpanjangan
-- (SubscriptionInvoice) + log tindakan otomatis (SubscriptionAutoActionLog)
-- + pengaturan otomasi satu baris (SubscriptionAutomationSettings, seed
-- default di dalam migrasi ini — migrasi harus mandiri).

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "graceEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SubscriptionInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "ppnAmount" INTEGER NOT NULL,
    "uniqueCode" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Belum Dibayar',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidAmount" INTEGER,
    "replacedByInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_number_key" ON "SubscriptionInvoice"("number");
CREATE INDEX "SubscriptionInvoice_tenantId_idx" ON "SubscriptionInvoice"("tenantId");
CREATE INDEX "SubscriptionInvoice_subscriptionId_idx" ON "SubscriptionInvoice"("subscriptionId");
CREATE INDEX "SubscriptionInvoice_status_idx" ON "SubscriptionInvoice"("status");
CREATE INDEX "SubscriptionInvoice_validUntil_idx" ON "SubscriptionInvoice"("validUntil");

-- CreateTable
CREATE TABLE "SubscriptionAutoActionLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "reason" TEXT NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "actorUserId" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionAutoActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionAutoActionLog_tenantId_createdAt_idx" ON "SubscriptionAutoActionLog"("tenantId", "createdAt");
CREATE INDEX "SubscriptionAutoActionLog_subscriptionId_idx" ON "SubscriptionAutoActionLog"("subscriptionId");

-- CreateTable
CREATE TABLE "SubscriptionAutomationSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "graceDays" INTEGER NOT NULL DEFAULT 14,
    "invoiceLeadDays" INTEGER NOT NULL DEFAULT 7,
    "reminderDaysBeforeGraceEnd" TEXT NOT NULL DEFAULT '[7,3,1]',
    "retentionReminderDaysBefore" INTEGER NOT NULL DEFAULT 7,
    "automationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionAutomationSettings_pkey" PRIMARY KEY ("id")
);

-- Seed baris default (idempotent — migrasi harus mandiri, tanpa script seed).
INSERT INTO "SubscriptionAutomationSettings"
  ("id", "graceDays", "invoiceLeadDays", "reminderDaysBeforeGraceEnd", "retentionReminderDaysBefore", "automationEnabled", "updatedAt")
VALUES ('default', 14, 7, '[7,3,1]', 7, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
