-- Phase 6: pemetaan org legacy -> tenant (dipakai filter skip cron legacy
-- pass + lookup rollback). Ditulis dengan tangan 2026-11-23 (Tahap 1);
-- BELUM di-apply ke woork_master (parent yang akan apply).
ALTER TABLE "Tenant" ADD COLUMN "legacyOrganizationId" TEXT;
CREATE UNIQUE INDEX "Tenant_legacyOrganizationId_key" ON "Tenant"("legacyOrganizationId");
