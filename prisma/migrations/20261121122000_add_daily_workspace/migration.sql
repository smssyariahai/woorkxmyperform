-- CreateTable
CREATE TABLE "DailyWorkNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWorkNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWorkspacePreference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "layoutConfiguration" JSONB NOT NULL DEFAULT '{}',
    "visibleWidgets" JSONB NOT NULL DEFAULT '[]',
    "widgetOrder" JSONB NOT NULL DEFAULT '[]',
    "quickActions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWorkspacePreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyWorkNote_organizationId_userId_idx" ON "DailyWorkNote"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWorkNote_organizationId_userId_date_key" ON "DailyWorkNote"("organizationId", "userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWorkspacePreference_organizationId_userId_key" ON "DailyWorkspacePreference"("organizationId", "userId");

-- AddForeignKey
ALTER TABLE "DailyWorkNote" ADD CONSTRAINT "DailyWorkNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkNote" ADD CONSTRAINT "DailyWorkNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkspacePreference" ADD CONSTRAINT "DailyWorkspacePreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkspacePreference" ADD CONSTRAINT "DailyWorkspacePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

