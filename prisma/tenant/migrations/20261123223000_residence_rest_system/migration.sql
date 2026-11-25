-- Fase 5a (WOORK STAFF RESIDENCE §15): model mess + sistem istirahat agent.
-- Ditulis dengan tangan 2026-11-23 dari `prisma migrate diff --script`
-- (divalidasi: diff ulang setelah migrasi ini = kosong).
-- Posisi kasur TIDAK diduplikat ke DB (bedIndex 0–15 kunci ke
-- residenceBeds() di office3d-layout.ts). Satu agent ↔ satu bed aktif
-- ditegakkan @@unique(agentId) + @@unique(bedId) di Assignment.
-- Partial unique index di bawah bukan dari Prisma (Prisma tak bisa
-- partial unique): maksimal 1 sesi RESTING per agent, riwayat
-- COMPLETED/CANCELLED tetap boleh ganda.

-- CreateTable
CREATE TABLE "Residence" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Residence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResidenceRoom" (
    "id" TEXT NOT NULL,
    "residenceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floorNumber" INTEGER NOT NULL DEFAULT 2,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResidenceRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResidenceBed" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "bedCode" TEXT NOT NULL,
    "bedIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResidenceBed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentResidenceAssignment" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "residenceId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentResidenceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRestSchedule" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "divisionId" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "scheduleType" TEXT NOT NULL DEFAULT 'NIGHT',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRestSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRestSession" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RESTING',
    "source" TEXT NOT NULL DEFAULT 'SCHEDULE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRestSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Residence_status_idx" ON "Residence"("status");

-- CreateIndex
CREATE INDEX "ResidenceRoom_residenceId_idx" ON "ResidenceRoom"("residenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ResidenceRoom_residenceId_name_key" ON "ResidenceRoom"("residenceId", "name");

-- CreateIndex
CREATE INDEX "ResidenceBed_roomId_idx" ON "ResidenceBed"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "ResidenceBed_roomId_bedCode_key" ON "ResidenceBed"("roomId", "bedCode");

-- CreateIndex
CREATE UNIQUE INDEX "ResidenceBed_roomId_bedIndex_key" ON "ResidenceBed"("roomId", "bedIndex");

-- CreateIndex
CREATE INDEX "AgentResidenceAssignment_residenceId_idx" ON "AgentResidenceAssignment"("residenceId");

-- CreateIndex
CREATE INDEX "AgentResidenceAssignment_roomId_idx" ON "AgentResidenceAssignment"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentResidenceAssignment_agentId_key" ON "AgentResidenceAssignment"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentResidenceAssignment_bedId_key" ON "AgentResidenceAssignment"("bedId");

-- CreateIndex
CREATE INDEX "AgentRestSchedule_agentId_idx" ON "AgentRestSchedule"("agentId");

-- CreateIndex
CREATE INDEX "AgentRestSchedule_divisionId_idx" ON "AgentRestSchedule"("divisionId");

-- CreateIndex
CREATE INDEX "AgentRestSession_agentId_idx" ON "AgentRestSession"("agentId");

-- CreateIndex
CREATE INDEX "AgentRestSession_bedId_idx" ON "AgentRestSession"("bedId");

-- CreateIndex
CREATE INDEX "AgentRestSession_status_idx" ON "AgentRestSession"("status");

-- AddForeignKey
ALTER TABLE "ResidenceRoom" ADD CONSTRAINT "ResidenceRoom_residenceId_fkey" FOREIGN KEY ("residenceId") REFERENCES "Residence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidenceBed" ADD CONSTRAINT "ResidenceBed_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ResidenceRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentResidenceAssignment" ADD CONSTRAINT "AgentResidenceAssignment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentResidenceAssignment" ADD CONSTRAINT "AgentResidenceAssignment_residenceId_fkey" FOREIGN KEY ("residenceId") REFERENCES "Residence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentResidenceAssignment" ADD CONSTRAINT "AgentResidenceAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ResidenceRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentResidenceAssignment" ADD CONSTRAINT "AgentResidenceAssignment_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "ResidenceBed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRestSchedule" ADD CONSTRAINT "AgentRestSchedule_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRestSchedule" ADD CONSTRAINT "AgentRestSchedule_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRestSession" ADD CONSTRAINT "AgentRestSession_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRestSession" ADD CONSTRAINT "AgentRestSession_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "ResidenceBed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (partial unique — idempotensi sesi istirahat, desain §1)
CREATE UNIQUE INDEX "AgentRestSession_agentId_resting_key" ON "AgentRestSession"("agentId") WHERE "status" = 'RESTING';

