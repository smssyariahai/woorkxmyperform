-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "sourceModule" TEXT,
    "sourceRecordId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "meetingLink" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'COMPANY',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "recurrenceRule" TEXT,
    "recurrenceParentId" TEXT,
    "recurrenceOriginalStartAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarAttendee" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "responseStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarReminder" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minutesBefore" INTEGER NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSyncLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "eventId" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarUserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "defaultView" TEXT NOT NULL DEFAULT 'month',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "firstDayOfWeek" INTEGER NOT NULL DEFAULT 1,
    "workingHours" JSONB NOT NULL DEFAULT '{}',
    "notificationPreferences" JSONB NOT NULL DEFAULT '{}',
    "visibleCalendars" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarUserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEvent_organizationId_startAt_idx" ON "CalendarEvent"("organizationId", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_organizationId_status_idx" ON "CalendarEvent"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CalendarEvent_createdById_idx" ON "CalendarEvent"("createdById");

-- CreateIndex
CREATE INDEX "CalendarEvent_recurrenceParentId_idx" ON "CalendarEvent"("recurrenceParentId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_sourceModule_sourceRecordId_key" ON "CalendarEvent"("sourceModule", "sourceRecordId");

-- CreateIndex
CREATE INDEX "CalendarAttendee_userId_idx" ON "CalendarAttendee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarAttendee_eventId_userId_key" ON "CalendarAttendee"("eventId", "userId");

-- CreateIndex
CREATE INDEX "CalendarReminder_remindAt_deliveryStatus_idx" ON "CalendarReminder"("remindAt", "deliveryStatus");

-- CreateIndex
CREATE INDEX "CalendarReminder_userId_idx" ON "CalendarReminder"("userId");

-- CreateIndex
CREATE INDEX "CalendarSyncLog_sourceModule_sourceRecordId_idx" ON "CalendarSyncLog"("sourceModule", "sourceRecordId");

-- CreateIndex
CREATE INDEX "CalendarSyncLog_organizationId_lastSyncedAt_idx" ON "CalendarSyncLog"("organizationId", "lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarUserPreference_userId_organizationId_key" ON "CalendarUserPreference"("userId", "organizationId");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_recurrenceParentId_fkey" FOREIGN KEY ("recurrenceParentId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarAttendee" ADD CONSTRAINT "CalendarAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarAttendee" ADD CONSTRAINT "CalendarAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarReminder" ADD CONSTRAINT "CalendarReminder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarReminder" ADD CONSTRAINT "CalendarReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncLog" ADD CONSTRAINT "CalendarSyncLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSyncLog" ADD CONSTRAINT "CalendarSyncLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarUserPreference" ADD CONSTRAINT "CalendarUserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarUserPreference" ADD CONSTRAINT "CalendarUserPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

