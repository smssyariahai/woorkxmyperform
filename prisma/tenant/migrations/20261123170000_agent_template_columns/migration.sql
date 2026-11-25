-- Fase 4 (WOORK VIRTUAL OFFICE 3.0 §13): kolom instance katalog di Agent.
-- Ditulis dengan tangan 2026-11-23; String polos TANPA FK lintas DB
-- (pola Opsi A — template hidup di master DB, instance di tenant DB).
-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "templateSlug" TEXT;
ALTER TABLE "Agent" ADD COLUMN "templateVersion" TEXT;

-- CreateIndex
CREATE INDEX "Agent_templateSlug_idx" ON "Agent"("templateSlug");
