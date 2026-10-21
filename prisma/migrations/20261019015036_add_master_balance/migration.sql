-- CreateTable
CREATE TABLE "MasterBalance" (
    "id" TEXT NOT NULL DEFAULT 'master',
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterLedger" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT,
    "organizationId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MasterLedger_reference_key" ON "MasterLedger"("reference");

-- CreateIndex
CREATE INDEX "MasterLedger_createdAt_idx" ON "MasterLedger"("createdAt");

-- CreateIndex
CREATE INDEX "MasterLedger_organizationId_createdAt_idx" ON "MasterLedger"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "MasterLedger" ADD CONSTRAINT "MasterLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
