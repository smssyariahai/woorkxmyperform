-- CreateTable
CREATE TABLE "BotConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "systemPrompt" TEXT,
    "creditBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BotConfig_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "BotUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "amount" INTEGER NOT NULL,
    "model" TEXT,
    "error" TEXT,
    CONSTRAINT "BotUsage_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "BotUsage" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- CreateTable
CREATE TABLE "TopUpRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "requestedById" TEXT NOT NULL,
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TopUpRequest_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "BotConfig_organizationId_key" ON "BotConfig"("organizationId");
-- CreateIndex
CREATE UNIQUE INDEX "CreditLedger_reference_key" ON "CreditLedger"("reference");
-- CreateIndex
CREATE INDEX "CreditLedger_organizationId_createdAt_idx" ON "CreditLedger"("organizationId", "createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "BotUsage_messageId_key" ON "BotUsage"("messageId");
-- CreateIndex
CREATE INDEX "BotUsage_organizationId_createdAt_idx" ON "BotUsage"("organizationId", "createdAt");
-- CreateIndex
CREATE INDEX "TopUpRequest_organizationId_status_idx" ON "TopUpRequest"("organizationId", "status");
-- AddForeignKey
ALTER TABLE "BotConfig" ADD CONSTRAINT "BotConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "BotUsage" ADD CONSTRAINT "BotUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TopUpRequest" ADD CONSTRAINT "TopUpRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
