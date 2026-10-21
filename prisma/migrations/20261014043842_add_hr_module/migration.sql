-- CreateTable
CREATE TABLE "HrVacancy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'PKWTT',
    "quota" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "description" TEXT,
    "salaryMin" DOUBLE PRECISION,
    "salaryMax" DOUBLE PRECISION,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrVacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrCandidate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vacancyId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "birthDate" TIMESTAMP(3),
    "education" TEXT,
    "experience" TEXT,
    "cvUrl" TEXT,
    "source" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'LAMARAN',
    "rating" INTEGER,
    "notes" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrEmployee" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "birthDate" TIMESTAMP(3),
    "position" TEXT NOT NULL,
    "department" TEXT,
    "joinDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    "candidateId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrContract" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "contractNo" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PKWTT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "probationEnd" TIMESTAMP(3),
    "salary" DOUBLE PRECISION,
    "position" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    "fileUrl" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HrVacancy_organizationId_idx" ON "HrVacancy"("organizationId");

-- CreateIndex
CREATE INDEX "HrVacancy_organizationId_status_idx" ON "HrVacancy"("organizationId", "status");

-- CreateIndex
CREATE INDEX "HrCandidate_organizationId_idx" ON "HrCandidate"("organizationId");

-- CreateIndex
CREATE INDEX "HrCandidate_organizationId_stage_idx" ON "HrCandidate"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "HrCandidate_vacancyId_idx" ON "HrCandidate"("vacancyId");

-- CreateIndex
CREATE UNIQUE INDEX "HrEmployee_candidateId_key" ON "HrEmployee"("candidateId");

-- CreateIndex
CREATE INDEX "HrEmployee_organizationId_idx" ON "HrEmployee"("organizationId");

-- CreateIndex
CREATE INDEX "HrEmployee_organizationId_status_idx" ON "HrEmployee"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HrEmployee_organizationId_employeeNo_key" ON "HrEmployee"("organizationId", "employeeNo");

-- CreateIndex
CREATE INDEX "HrContract_organizationId_idx" ON "HrContract"("organizationId");

-- CreateIndex
CREATE INDEX "HrContract_employeeId_idx" ON "HrContract"("employeeId");

-- CreateIndex
CREATE INDEX "HrContract_organizationId_status_idx" ON "HrContract"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HrContract_organizationId_contractNo_key" ON "HrContract"("organizationId", "contractNo");

-- AddForeignKey
ALTER TABLE "HrVacancy" ADD CONSTRAINT "HrVacancy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrVacancy" ADD CONSTRAINT "HrVacancy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrCandidate" ADD CONSTRAINT "HrCandidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrCandidate" ADD CONSTRAINT "HrCandidate_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "HrVacancy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrCandidate" ADD CONSTRAINT "HrCandidate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrEmployee" ADD CONSTRAINT "HrEmployee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrEmployee" ADD CONSTRAINT "HrEmployee_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "HrCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrEmployee" ADD CONSTRAINT "HrEmployee_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrContract" ADD CONSTRAINT "HrContract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrContract" ADD CONSTRAINT "HrContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "HrEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrContract" ADD CONSTRAINT "HrContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
