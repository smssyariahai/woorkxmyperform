-- CreateTable
CREATE TABLE "EsignDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "originalFilePath" TEXT NOT NULL,
    "finalFilePath" TEXT,
    "originalHash" TEXT NOT NULL,
    "finalHash" TEXT,
    "createdById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "workflowType" TEXT NOT NULL DEFAULT 'SEQUENTIAL',
    "approvalStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "approverId" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsignDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignSigner" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT,
    "signerPhone" TEXT,
    "signerPosition" TEXT,
    "signerDepartment" TEXT,
    "signingOrder" INTEGER NOT NULL,
    "signingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "placementPage" INTEGER,
    "placementX" DOUBLE PRECISION,
    "placementY" DOUBLE PRECISION,
    "placementWidth" DOUBLE PRECISION,
    "placementHeight" DOUBLE PRECISION,
    "accessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,

    CONSTRAINT "EsignSigner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignSignature" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "signatureAsset" TEXT NOT NULL,
    "signatureMethod" TEXT NOT NULL,
    "signatureHash" TEXT NOT NULL,
    "confirmationTimestamp" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "deviceInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EsignSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signaturePath" TEXT,
    "signatureHash" TEXT,
    "pinHash" TEXT,
    "pinUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsignProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "filePath" TEXT,
    "generator" TEXT,
    "placeholders" TEXT NOT NULL DEFAULT '{}',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsignTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignAuditLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "documentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EsignAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsignNotification" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "signerId" TEXT,
    "recipientId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "eventType" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "waMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EsignNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EsignDocument_organizationId_idx" ON "EsignDocument"("organizationId");

-- CreateIndex
CREATE INDEX "EsignDocument_organizationId_status_idx" ON "EsignDocument"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EsignDocument_organizationId_documentNumber_key" ON "EsignDocument"("organizationId", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "EsignSigner_accessToken_key" ON "EsignSigner"("accessToken");

-- CreateIndex
CREATE INDEX "EsignSigner_documentId_idx" ON "EsignSigner"("documentId");

-- CreateIndex
CREATE INDEX "EsignSigner_userId_idx" ON "EsignSigner"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EsignSigner_documentId_userId_key" ON "EsignSigner"("documentId", "userId");

-- CreateIndex
CREATE INDEX "EsignSignature_documentId_idx" ON "EsignSignature"("documentId");

-- CreateIndex
CREATE INDEX "EsignSignature_signerId_idx" ON "EsignSignature"("signerId");

-- CreateIndex
CREATE UNIQUE INDEX "EsignProfile_userId_key" ON "EsignProfile"("userId");

-- CreateIndex
CREATE INDEX "EsignTemplate_organizationId_idx" ON "EsignTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "EsignAuditLog_documentId_createdAt_idx" ON "EsignAuditLog"("documentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EsignNotification_documentId_signerId_eventType_key" ON "EsignNotification"("documentId", "signerId", "eventType");

-- AddForeignKey
ALTER TABLE "EsignDocument" ADD CONSTRAINT "EsignDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignDocument" ADD CONSTRAINT "EsignDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignDocument" ADD CONSTRAINT "EsignDocument_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignSigner" ADD CONSTRAINT "EsignSigner_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EsignDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignSigner" ADD CONSTRAINT "EsignSigner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignSignature" ADD CONSTRAINT "EsignSignature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EsignDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignSignature" ADD CONSTRAINT "EsignSignature_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "EsignSigner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignProfile" ADD CONSTRAINT "EsignProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignTemplate" ADD CONSTRAINT "EsignTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignTemplate" ADD CONSTRAINT "EsignTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignAuditLog" ADD CONSTRAINT "EsignAuditLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EsignDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignAuditLog" ADD CONSTRAINT "EsignAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignNotification" ADD CONSTRAINT "EsignNotification_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EsignDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignNotification" ADD CONSTRAINT "EsignNotification_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "EsignSigner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsignNotification" ADD CONSTRAINT "EsignNotification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
