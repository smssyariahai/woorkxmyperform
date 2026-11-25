-- Fase 4 Alur Pendaftaran Tenant Baru (Bab 5.5/7.4/7.5): siklus hidup
-- langganan di master DB. Ditulis dengan tangan 2026-11-24.
-- Kolom baru di Subscription + tabel riwayat SubscriptionStatusLog +
-- backfill: TRIAL bila trialEndsAt masih di masa depan, selain itu AKTIF
-- (default kolom sudah AKTIF; `status` lama dibiarkan apa adanya).

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "lifecycleStatus" TEXT NOT NULL DEFAULT 'AKTIF';
ALTER TABLE "Subscription" ADD COLUMN "previousLifecycleStatus" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "lifecycleReason" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "lifecycleChangedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "lifecycleChangedByUserId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "currentPeriodEndsAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "retentionStartsAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "retentionEndsAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "deletionConfirmedByUserId" TEXT;

-- Backfill: langganan yang trial-nya masih berjalan -> TRIAL.
UPDATE "Subscription" SET "lifecycleStatus" = 'TRIAL' WHERE "trialEndsAt" > CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "SubscriptionStatusLog" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionStatusLog_subscriptionId_idx" ON "SubscriptionStatusLog"("subscriptionId");
CREATE INDEX "SubscriptionStatusLog_tenantId_idx" ON "SubscriptionStatusLog"("tenantId");
