-- Toggle sistem trial (2026-11-25): BillingSettings.trialEnabled.
-- false = pendaftaran baru tidak bisa memilih trial (Jalur B dipaksa PAID,
-- Jalur A langsung AKTIF). Default true (perilaku lama tidak berubah).
ALTER TABLE "BillingSettings" ADD COLUMN "trialEnabled" BOOLEAN NOT NULL DEFAULT true;
