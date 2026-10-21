-- CreateTable
CREATE TABLE "ReplyTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Umum',
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReplyTemplate_organizationId_idx" ON "ReplyTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "ReplyTemplate_organizationId_isActive_idx" ON "ReplyTemplate"("organizationId", "isActive");

-- AddForeignKey
ALTER TABLE "ReplyTemplate" ADD CONSTRAINT "ReplyTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyTemplate" ADD CONSTRAINT "ReplyTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
