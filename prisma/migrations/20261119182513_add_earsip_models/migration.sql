-- CreateTable
CREATE TABLE "ArchiveCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchiveCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveDocument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentNumber" TEXT,
    "documentDate" TIMESTAMP(3),
    "description" TEXT,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "confidentiality" TEXT NOT NULL DEFAULT 'INTERNAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchiveDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArchiveCategory_organizationId_idx" ON "ArchiveCategory"("organizationId");

-- CreateIndex
CREATE INDEX "ArchiveCategory_organizationId_parentId_idx" ON "ArchiveCategory"("organizationId", "parentId");

-- CreateIndex
CREATE INDEX "ArchiveDocument_organizationId_idx" ON "ArchiveDocument"("organizationId");

-- CreateIndex
CREATE INDEX "ArchiveDocument_organizationId_categoryId_idx" ON "ArchiveDocument"("organizationId", "categoryId");

-- CreateIndex
CREATE INDEX "ArchiveDocument_organizationId_status_idx" ON "ArchiveDocument"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ArchiveDocument_organizationId_confidentiality_idx" ON "ArchiveDocument"("organizationId", "confidentiality");

-- CreateIndex
CREATE INDEX "ArchiveDocument_organizationId_uploadedAt_idx" ON "ArchiveDocument"("organizationId", "uploadedAt");

-- CreateIndex
CREATE INDEX "ArchiveDocument_uploaderId_idx" ON "ArchiveDocument"("uploaderId");

-- AddForeignKey
ALTER TABLE "ArchiveCategory" ADD CONSTRAINT "ArchiveCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveCategory" ADD CONSTRAINT "ArchiveCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ArchiveCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveCategory" ADD CONSTRAINT "ArchiveCategory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveDocument" ADD CONSTRAINT "ArchiveDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveDocument" ADD CONSTRAINT "ArchiveDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ArchiveCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveDocument" ADD CONSTRAINT "ArchiveDocument_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

