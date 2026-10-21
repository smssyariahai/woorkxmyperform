-- CreateTable
CREATE TABLE "OfficeLayout" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfficeLayout_organizationId_idx" ON "OfficeLayout"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeLayout_organizationId_agentId_key" ON "OfficeLayout"("organizationId", "agentId");

-- AddForeignKey
ALTER TABLE "OfficeLayout" ADD CONSTRAINT "OfficeLayout_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeLayout" ADD CONSTRAINT "OfficeLayout_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
