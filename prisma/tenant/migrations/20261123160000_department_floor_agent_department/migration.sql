-- AlterTable
ALTER TABLE "Department" ADD COLUMN "floor" INTEGER;
ALTER TABLE "Department" ADD COLUMN "zone" TEXT;
ALTER TABLE "Department" ADD COLUMN "capacity" INTEGER;
ALTER TABLE "Department" ADD COLUMN "headUserId" TEXT;
ALTER TABLE "Department" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "departmentId" TEXT;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Agent_departmentId_idx" ON "Agent"("departmentId");
