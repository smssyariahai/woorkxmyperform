-- CreateTable
CREATE TABLE "TalTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isAdditional" BOOLEAN NOT NULL DEFAULT false,
    "originalTaskId" TEXT,
    "taskDate" DATE,
    "taskTime" TEXT,
    "weekNumber" INTEGER,
    "weekYear" INTEGER,
    "month" INTEGER,
    "year" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "parentTitle" TEXT,
    "category" TEXT NOT NULL DEFAULT 'non_result',
    "targetValue" DOUBLE PRECISION,
    "targetUnit" TEXT,
    "targetCustomUnit" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "assignedTo" JSONB NOT NULL DEFAULT '[]',
    "assignedUserEmails" JSONB NOT NULL DEFAULT '[]',
    "assignedUsers" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'todo',
    "notes" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "actualValue" DOUBLE PRECISION,
    "blockerCategory" TEXT,
    "blockerDescription" TEXT,
    "blockerReportedAt" TIMESTAMP(3),
    "isRolledOver" BOOLEAN NOT NULL DEFAULT false,
    "rolloverAction" TEXT,
    "rolloverTargetDate" DATE,
    "rolloverTargetWeek" INTEGER,
    "rolloverTargetYear" INTEGER,
    "rolloverTargetMonth" INTEGER,
    "cancelNotes" TEXT,
    "enableReminder" BOOLEAN NOT NULL DEFAULT false,
    "reminderType" TEXT,
    "reminderMinutesBefore" INTEGER,
    "reminderTime" TEXT,
    "reminderLastTriggeredAt" TIMESTAMP(3),
    "orderNo" INTEGER,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalRoutineTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryTag" TEXT,
    "color" TEXT,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "template" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalRoutineTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalMonthlyLock" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalMonthlyLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalLockReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isPlanLocked" BOOLEAN NOT NULL DEFAULT false,
    "planLockedAt" TIMESTAMP(3),
    "isReported" BOOLEAN NOT NULL DEFAULT false,
    "reportedAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalLockReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalCuti" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cutiDate" DATE NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalCuti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalHoliday" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "holidayDate" DATE NOT NULL,
    "name" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalBadge" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadgeProgress" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBadgeProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTrophy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTrophy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalDeadlineSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalDeadlineSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalUserObligation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT,
    "userName" TEXT,
    "daily" BOOLEAN NOT NULL DEFAULT true,
    "weekly" BOOLEAN NOT NULL DEFAULT true,
    "monthly" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalUserObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalTeamVisibility" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalTeamVisibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalAuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "actionType" TEXT NOT NULL,
    "actionTitle" TEXT NOT NULL DEFAULT '',
    "adminEmail" TEXT NOT NULL DEFAULT '',
    "adminName" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "targetSummary" TEXT NOT NULL DEFAULT '',
    "affectedCount" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TalTask_organizationId_userId_year_month_idx" ON "TalTask"("organizationId", "userId", "year", "month");

-- CreateIndex
CREATE INDEX "TalTask_organizationId_userId_taskDate_idx" ON "TalTask"("organizationId", "userId", "taskDate");

-- CreateIndex
CREATE INDEX "TalTask_organizationId_userId_weekYear_weekNumber_idx" ON "TalTask"("organizationId", "userId", "weekYear", "weekNumber");

-- CreateIndex
CREATE INDEX "TalTask_organizationId_status_idx" ON "TalTask"("organizationId", "status");

-- CreateIndex
CREATE INDEX "TalRoutineTemplate_organizationId_userId_idx" ON "TalRoutineTemplate"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "TalRoutineTemplate_organizationId_isPreset_idx" ON "TalRoutineTemplate"("organizationId", "isPreset");

-- CreateIndex
CREATE INDEX "TalMonthlyLock_organizationId_year_month_idx" ON "TalMonthlyLock"("organizationId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "TalMonthlyLock_organizationId_userId_year_month_key" ON "TalMonthlyLock"("organizationId", "userId", "year", "month");

-- CreateIndex
CREATE INDEX "TalLockReport_organizationId_userId_scope_idx" ON "TalLockReport"("organizationId", "userId", "scope");

-- CreateIndex
CREATE INDEX "TalLockReport_organizationId_scope_scopeKey_idx" ON "TalLockReport"("organizationId", "scope", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "TalLockReport_organizationId_scope_scopeKey_userId_key" ON "TalLockReport"("organizationId", "scope", "scopeKey", "userId");

-- CreateIndex
CREATE INDEX "TalCuti_organizationId_cutiDate_idx" ON "TalCuti"("organizationId", "cutiDate");

-- CreateIndex
CREATE UNIQUE INDEX "TalCuti_organizationId_userId_cutiDate_key" ON "TalCuti"("organizationId", "userId", "cutiDate");

-- CreateIndex
CREATE INDEX "TalHoliday_organizationId_idx" ON "TalHoliday"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TalHoliday_organizationId_holidayDate_key" ON "TalHoliday"("organizationId", "holidayDate");

-- CreateIndex
CREATE INDEX "TalBadge_organizationId_idx" ON "TalBadge"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TalBadge_organizationId_badgeId_key" ON "TalBadge"("organizationId", "badgeId");

-- CreateIndex
CREATE INDEX "UserBadgeProgress_organizationId_userId_seasonYear_idx" ON "UserBadgeProgress"("organizationId", "userId", "seasonYear");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadgeProgress_organizationId_userId_badgeId_seasonYear_key" ON "UserBadgeProgress"("organizationId", "userId", "badgeId", "seasonYear");

-- CreateIndex
CREATE INDEX "UserTrophy_organizationId_userId_createdAt_idx" ON "UserTrophy"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TalSetting_organizationId_key_key" ON "TalSetting"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TalDeadlineSetting_organizationId_key" ON "TalDeadlineSetting"("organizationId");

-- CreateIndex
CREATE INDEX "TalUserObligation_organizationId_idx" ON "TalUserObligation"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TalUserObligation_organizationId_userId_key" ON "TalUserObligation"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "TalTeamVisibility_organizationId_viewerId_idx" ON "TalTeamVisibility"("organizationId", "viewerId");

-- CreateIndex
CREATE INDEX "TalTeamVisibility_organizationId_targetId_idx" ON "TalTeamVisibility"("organizationId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "TalTeamVisibility_organizationId_viewerId_targetId_key" ON "TalTeamVisibility"("organizationId", "viewerId", "targetId");

-- CreateIndex
CREATE INDEX "TalAuditLog_organizationId_createdAt_idx" ON "TalAuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "TalAuditLog_organizationId_actionType_idx" ON "TalAuditLog"("organizationId", "actionType");

-- AddForeignKey
ALTER TABLE "TalTask" ADD CONSTRAINT "TalTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalTask" ADD CONSTRAINT "TalTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalTask" ADD CONSTRAINT "TalTask_originalTaskId_fkey" FOREIGN KEY ("originalTaskId") REFERENCES "TalTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalTask" ADD CONSTRAINT "TalTask_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TalTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalRoutineTemplate" ADD CONSTRAINT "TalRoutineTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalRoutineTemplate" ADD CONSTRAINT "TalRoutineTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalMonthlyLock" ADD CONSTRAINT "TalMonthlyLock_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalMonthlyLock" ADD CONSTRAINT "TalMonthlyLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalLockReport" ADD CONSTRAINT "TalLockReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalLockReport" ADD CONSTRAINT "TalLockReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalCuti" ADD CONSTRAINT "TalCuti_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalCuti" ADD CONSTRAINT "TalCuti_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalHoliday" ADD CONSTRAINT "TalHoliday_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalBadge" ADD CONSTRAINT "TalBadge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadgeProgress" ADD CONSTRAINT "UserBadgeProgress_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadgeProgress" ADD CONSTRAINT "UserBadgeProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTrophy" ADD CONSTRAINT "UserTrophy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTrophy" ADD CONSTRAINT "UserTrophy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalSetting" ADD CONSTRAINT "TalSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalDeadlineSetting" ADD CONSTRAINT "TalDeadlineSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalUserObligation" ADD CONSTRAINT "TalUserObligation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalUserObligation" ADD CONSTRAINT "TalUserObligation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalTeamVisibility" ADD CONSTRAINT "TalTeamVisibility_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalTeamVisibility" ADD CONSTRAINT "TalTeamVisibility_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalTeamVisibility" ADD CONSTRAINT "TalTeamVisibility_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalTeamVisibility" ADD CONSTRAINT "TalTeamVisibility_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalAuditLog" ADD CONSTRAINT "TalAuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalAuditLog" ADD CONSTRAINT "TalAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

