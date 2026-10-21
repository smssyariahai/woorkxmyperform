-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "subdomain" TEXT,
ADD COLUMN "description" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_subdomain_key" ON "Organization"("subdomain");
