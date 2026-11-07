-- AlterTable
ALTER TABLE "User" ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "gender" TEXT,
    "maritalStatus" TEXT,
    "bloodType" TEXT,
    "religion" TEXT,
    "nik" TEXT,
    "ktpAddress" TEXT,
    "postalCode" TEXT,
    "homeAddress" TEXT,
    "docAccessLevel" TEXT DEFAULT 'INTERNAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFamilyContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "occupation" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFamilyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEmployment" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "companyName" TEXT,
    "employeeId" TEXT,
    "organizationName" TEXT,
    "position" TEXT,
    "jobLevel" TEXT,
    "employmentStatus" TEXT,
    "branch" TEXT,
    "joinDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "grade" TEXT,
    "classLevel" TEXT,
    "managerId" TEXT,
    "approvalApproverId" TEXT,
    "approvalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEmployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEducation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "degree" TEXT,
    "name" TEXT,
    "institution" TEXT,
    "fieldOfStudy" TEXT,
    "grade" TEXT,
    "startYear" INTEGER,
    "endYear" INTEGER,
    "expiryDate" TIMESTAMP(3),
    "cost" INTEGER,
    "activity" TEXT,
    "hasCertificate" BOOLEAN NOT NULL DEFAULT false,
    "certificatePath" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserEducation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWorkExperience" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "startYear" INTEGER,
    "endYear" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWorkExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCustomFieldDef" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCustomFieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCustomValue" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "fieldDefId" TEXT NOT NULL,
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCustomValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserModuleAccess" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserModuleAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "UserProfile_nik_idx" ON "UserProfile"("nik");

-- CreateIndex
CREATE INDEX "UserFamilyContact_userId_idx" ON "UserFamilyContact"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserEmployment_membershipId_key" ON "UserEmployment"("membershipId");

-- CreateIndex
CREATE INDEX "UserEmployment_employeeId_idx" ON "UserEmployment"("employeeId");

-- CreateIndex
CREATE INDEX "UserEducation_userId_idx" ON "UserEducation"("userId");

-- CreateIndex
CREATE INDEX "UserWorkExperience_userId_idx" ON "UserWorkExperience"("userId");

-- CreateIndex
CREATE INDEX "UserCustomFieldDef_organizationId_idx" ON "UserCustomFieldDef"("organizationId");

-- CreateIndex
CREATE INDEX "UserCustomValue_membershipId_idx" ON "UserCustomValue"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCustomValue_membershipId_fieldDefId_key" ON "UserCustomValue"("membershipId", "fieldDefId");

-- CreateIndex
CREATE INDEX "UserModuleAccess_membershipId_idx" ON "UserModuleAccess"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "UserModuleAccess_membershipId_moduleKey_key" ON "UserModuleAccess"("membershipId", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFamilyContact" ADD CONSTRAINT "UserFamilyContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEmployment" ADD CONSTRAINT "UserEmployment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEmployment" ADD CONSTRAINT "UserEmployment_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEmployment" ADD CONSTRAINT "UserEmployment_approvalApproverId_fkey" FOREIGN KEY ("approvalApproverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEducation" ADD CONSTRAINT "UserEducation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWorkExperience" ADD CONSTRAINT "UserWorkExperience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomFieldDef" ADD CONSTRAINT "UserCustomFieldDef_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomValue" ADD CONSTRAINT "UserCustomValue_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomValue" ADD CONSTRAINT "UserCustomValue_fieldDefId_fkey" FOREIGN KEY ("fieldDefId") REFERENCES "UserCustomFieldDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserModuleAccess" ADD CONSTRAINT "UserModuleAccess_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

