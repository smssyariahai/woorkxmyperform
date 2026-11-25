-- Fase 7 Alur Pendaftaran Tenant Baru (§7.8): pengumuman Master → tenant.
-- Ditulis dengan tangan 2026-11-24.
-- Isi pengumuman di master (PlatformAnnouncement) + status terkirim per
-- tenant (PlatformAnnouncementDelivery — satu-satunya sumber kebenaran
-- untuk Master; JANGAN membaca baris Announcement di DB tenant, §7.8.3).
-- Baris Announcement di DB tenant dibuat saat publish (fan-out).

-- CreateTable
CREATE TABLE "PlatformAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "category" TEXT NOT NULL DEFAULT 'announcement',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "targetType" TEXT NOT NULL,
    "targetJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "batchId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAnnouncement_batchId_key" ON "PlatformAnnouncement"("batchId");
CREATE INDEX "PlatformAnnouncement_status_idx" ON "PlatformAnnouncement"("status");

-- CreateTable
CREATE TABLE "PlatformAnnouncementDelivery" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantCode" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "tenantAnnouncementId" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "emailStatus" TEXT NOT NULL DEFAULT 'not_requested',
    "emailSent" INTEGER NOT NULL DEFAULT 0,
    "emailFailed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAnnouncementDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAnnouncementDelivery_announcementId_tenantId_key" ON "PlatformAnnouncementDelivery"("announcementId", "tenantId");
CREATE INDEX "PlatformAnnouncementDelivery_announcementId_idx" ON "PlatformAnnouncementDelivery"("announcementId");
CREATE INDEX "PlatformAnnouncementDelivery_tenantId_idx" ON "PlatformAnnouncementDelivery"("tenantId");
