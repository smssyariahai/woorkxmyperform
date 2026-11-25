-- CreateTable
CREATE TABLE "PrayerTimeSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "latitude" DOUBLE PRECISION NOT NULL DEFAULT -6.2088,
    "longitude" DOUBLE PRECISION NOT NULL DEFAULT 106.8456,
    "cityName" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "calculationMethod" TEXT NOT NULL DEFAULT 'kemenag',
    "asrMethod" TEXT NOT NULL DEFAULT 'shafii',
    "adjustmentMinutes" INTEGER NOT NULL DEFAULT 0,
    "sessionDurationMinutes" INTEGER NOT NULL DEFAULT 10,
    "enableAnimation" BOOLEAN NOT NULL DEFAULT true,
    "autoReturn" BOOLEAN NOT NULL DEFAULT true,
    "excludedAgentIds" JSONB NOT NULL DEFAULT '[]',
    "defaultImamAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrayerTimeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPrayerSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "prayerDate" DATE NOT NULL,
    "fajrTime" TEXT NOT NULL,
    "dhuhrTime" TEXT NOT NULL,
    "asrTime" TEXT NOT NULL,
    "maghribTime" TEXT NOT NULL,
    "ishaTime" TEXT NOT NULL,
    "imsakTime" TEXT,
    "sunriseTime" TEXT,
    "source" TEXT NOT NULL DEFAULT 'kemenag_astronomical',
    "cityName" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPrayerSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "prayerName" TEXT NOT NULL,
    "prayerDate" DATE NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrayerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerSessionParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT,
    "isImam" BOOLEAN NOT NULL DEFAULT false,
    "initialRoom" TEXT,
    "initialPosition" JSONB,
    "prayerPosition" JSONB,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrayerSessionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrayerTimeSettings_organizationId_key" ON "PrayerTimeSettings"("organizationId");

-- CreateIndex
CREATE INDEX "DailyPrayerSchedule_organizationId_prayerDate_idx" ON "DailyPrayerSchedule"("organizationId", "prayerDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPrayerSchedule_organizationId_prayerDate_key" ON "DailyPrayerSchedule"("organizationId", "prayerDate");

-- CreateIndex
CREATE INDEX "PrayerSession_organizationId_prayerDate_idx" ON "PrayerSession"("organizationId", "prayerDate");

-- CreateIndex
CREATE UNIQUE INDEX "PrayerSession_organizationId_prayerDate_prayerName_key" ON "PrayerSession"("organizationId", "prayerDate", "prayerName");

-- CreateIndex
CREATE INDEX "PrayerSessionParticipant_sessionId_idx" ON "PrayerSessionParticipant"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PrayerSessionParticipant_sessionId_agentId_key" ON "PrayerSessionParticipant"("sessionId", "agentId");

-- AddForeignKey
ALTER TABLE "PrayerTimeSettings" ADD CONSTRAINT "PrayerTimeSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPrayerSchedule" ADD CONSTRAINT "DailyPrayerSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerSession" ADD CONSTRAINT "PrayerSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerSessionParticipant" ADD CONSTRAINT "PrayerSessionParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PrayerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

