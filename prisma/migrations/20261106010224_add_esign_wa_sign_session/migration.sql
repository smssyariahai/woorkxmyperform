-- CreateTable
CREATE TABLE "EsignWaSignSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "documentId" TEXT,
    "signerId" TEXT,
    "state" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsignWaSignSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EsignWaSignSession_organizationId_idx" ON "EsignWaSignSession"("organizationId");

-- CreateIndex
CREATE INDEX "EsignWaSignSession_expiresAt_idx" ON "EsignWaSignSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EsignWaSignSession_userId_organizationId_key" ON "EsignWaSignSession"("userId", "organizationId");
