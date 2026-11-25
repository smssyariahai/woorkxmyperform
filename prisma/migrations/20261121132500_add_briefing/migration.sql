-- CreateTable
CREATE TABLE "BriefingSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT NOT NULL DEFAULT '08:00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "durationMinutes" INTEGER NOT NULL DEFAULT 10,
    "preparationMinutes" INTEGER NOT NULL DEFAULT 2,
    "meetingLeaderId" TEXT,
    "participantMode" TEXT NOT NULL DEFAULT 'all',
    "excludedAgentIds" JSONB NOT NULL DEFAULT '[]',
    "autoReturn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BriefingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "meetingLeaderId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BriefingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT,
    "isLeader" BOOLEAN NOT NULL DEFAULT false,
    "initialRoom" TEXT,
    "initialPosition" JSONB,
    "meetingPosition" JSONB,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "arrivedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BriefingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BriefingSettings_organizationId_key" ON "BriefingSettings"("organizationId");

-- CreateIndex
CREATE INDEX "BriefingSession_organizationId_scheduledDate_idx" ON "BriefingSession"("organizationId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "BriefingSession_organizationId_scheduledDate_key" ON "BriefingSession"("organizationId", "scheduledDate");

-- CreateIndex
CREATE INDEX "BriefingParticipant_sessionId_idx" ON "BriefingParticipant"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "BriefingParticipant_sessionId_agentId_key" ON "BriefingParticipant"("sessionId", "agentId");

-- AddForeignKey
ALTER TABLE "BriefingSettings" ADD CONSTRAINT "BriefingSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingSession" ADD CONSTRAINT "BriefingSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingParticipant" ADD CONSTRAINT "BriefingParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BriefingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

