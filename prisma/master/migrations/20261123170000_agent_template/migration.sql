-- Fase 4 (WOORK VIRTUAL OFFICE 3.0 §12-13): katalog global template AI-agent
-- dari repo msitarzewski/agency-agents (MIT, AgentLand Contributors 2025).
-- Ditulis dengan tangan 2026-11-23; template = data global di master DB,
-- instance per tenant = Agent.templateSlug/templateVersion di skema tenant.
-- CreateTable
CREATE TABLE "AgentTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "expertise" TEXT NOT NULL DEFAULT '',
    "personality" TEXT NOT NULL DEFAULT '',
    "systemInstructions" TEXT NOT NULL DEFAULT '',
    "deliverables" TEXT NOT NULL DEFAULT '[]',
    "workflows" TEXT NOT NULL DEFAULT '[]',
    "requiredTools" TEXT,
    "suggestedDepartment" TEXT,
    "suggestedFloor" INTEGER,
    "templateVersion" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentTemplate_slug_key" ON "AgentTemplate"("slug");

-- CreateIndex
CREATE INDEX "AgentTemplate_category_idx" ON "AgentTemplate"("category");

-- CreateIndex
CREATE INDEX "AgentTemplate_isActive_idx" ON "AgentTemplate"("isActive");
