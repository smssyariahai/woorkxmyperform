-- Fase 6 Alur Pendaftaran Tenant Baru (§9.5): rekonsiliasi pembayaran di master DB.
-- Ditulis dengan tangan 2026-11-24.
-- Kolom baru SubscriptionInvoice (purpose, itemsJson, isManual, manualReason,
-- manualByUserId, catalogBaseAmount, packageSnapshotJson, creditApplied,
-- paidBank, paidMutationId) + tabel rekening penampung (BankReceivingAccount,
-- seed 6 bank dengan nomor rekening KOSONG — Master yang mengisi) + berkas
-- rekening koran (BankStatement) + mutasi (BankMutation) + saldo kredit
-- (SubscriptionCredit) + pelunasan manual (ManualSettlement) + laporan
-- tenant (TenantPaymentReport).

-- AlterTable
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'RENEWAL';
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "itemsJson" TEXT;
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "isManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "manualReason" TEXT;
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "manualByUserId" TEXT;
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "catalogBaseAmount" INTEGER;
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "packageSnapshotJson" TEXT;
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "creditApplied" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "paidBank" TEXT;
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "paidMutationId" TEXT;

-- CreateTable
CREATE TABLE "BankReceivingAccount" (
    "id" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL DEFAULT '',
    "accountHolderName" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankReceivingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankReceivingAccount_bankCode_key" ON "BankReceivingAccount"("bankCode");

-- Seed 6 rekening penampung (nomor rekening KOSONG — Master yang mengisi).
INSERT INTO "BankReceivingAccount" ("id", "bankCode", "bankName", "accountNumber", "accountHolderName", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
  ('f6bank-mandiri', 'MANDIRI', 'Bank Mandiri', '', '', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('f6bank-bri', 'BRI', 'Bank BRI', '', '', true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('f6bank-bni', 'BNI', 'Bank BNI', '', '', true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('f6bank-bca', 'BCA', 'Bank BCA', '', '', true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('f6bank-permata', 'PERMATA', 'Bank Permata', '', '', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('f6bank-bsi', 'BSI', 'Bank Syariah Indonesia', '', '', true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("bankCode") DO NOTHING;

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "queuedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadMethod" TEXT NOT NULL DEFAULT 'CSV_UPLOAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankStatement_bankCode_idx" ON "BankStatement"("bankCode");

-- CreateTable
CREATE TABLE "BankMutation" (
    "id" TEXT NOT NULL,
    "statementId" TEXT,
    "bankCode" TEXT NOT NULL,
    "valueDate" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "matchedInvoiceId" TEXT,
    "tenantId" TEXT,
    "resolutionNote" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankMutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankMutation_bankCode_valueDate_idx" ON "BankMutation"("bankCode", "valueDate");
CREATE INDEX "BankMutation_amount_idx" ON "BankMutation"("amount");
CREATE INDEX "BankMutation_status_idx" ON "BankMutation"("status");
CREATE INDEX "BankMutation_tenantId_idx" ON "BankMutation"("tenantId");

-- CreateTable
CREATE TABLE "SubscriptionCredit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionCredit_tenantId_key" ON "SubscriptionCredit"("tenantId");

-- CreateTable
CREATE TABLE "ManualSettlement" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "amountReceived" INTEGER NOT NULL,
    "invoiceTotal" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "handling" TEXT NOT NULL,
    "followUpInvoiceId" TEXT,
    "proofMutationId" TEXT,
    "proofNote" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualSettlement_invoiceId_idx" ON "ManualSettlement"("invoiceId");
CREATE INDEX "ManualSettlement_tenantId_idx" ON "ManualSettlement"("tenantId");

-- CreateTable
CREATE TABLE "TenantPaymentReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "bankCode" TEXT NOT NULL,
    "transferDate" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "proofPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedByUserId" TEXT,
    "resolveNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPaymentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantPaymentReport_tenantId_idx" ON "TenantPaymentReport"("tenantId");
CREATE INDEX "TenantPaymentReport_status_idx" ON "TenantPaymentReport"("status");
