-- CreateTable
CREATE TABLE "QuranBookmark" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surahId" INTEGER NOT NULL,
    "surahName" TEXT NOT NULL,
    "surahArabic" TEXT,
    "ayahNumber" INTEGER NOT NULL,
    "ayahArabic" TEXT,
    "ayahTranslation" TEXT,
    "note" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuranBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrayerUserSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imsak" TEXT,
    "subuh" TEXT,
    "terbit" TEXT,
    "dhuha" TEXT,
    "dzuhur" TEXT,
    "ashar" TEXT,
    "maghrib" TEXT,
    "isya" TEXT,
    "preAlarmMinutes" INTEGER,
    "enablePreAlarm" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrayerUserSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuranBookmark_organizationId_userId_idx" ON "QuranBookmark"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "QuranBookmark_userId_surahId_ayahNumber_idx" ON "QuranBookmark"("userId", "surahId", "ayahNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PrayerUserSetting_userId_key" ON "PrayerUserSetting"("userId");

-- CreateIndex
CREATE INDEX "PrayerUserSetting_organizationId_idx" ON "PrayerUserSetting"("organizationId");

-- AddForeignKey
ALTER TABLE "QuranBookmark" ADD CONSTRAINT "QuranBookmark_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuranBookmark" ADD CONSTRAINT "QuranBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerUserSetting" ADD CONSTRAINT "PrayerUserSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrayerUserSetting" ADD CONSTRAINT "PrayerUserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

