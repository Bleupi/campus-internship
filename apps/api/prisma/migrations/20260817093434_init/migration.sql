-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'ADMIN', 'REFERENT');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('INCOMPLETE', 'PENDING_VALIDATION', 'VALID', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Promotion" AS ENUM ('L2', 'L3');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('ID_PHOTO', 'INSURANCE_CERTIFICATE');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('DRAFT', 'PENDING', 'VALIDATED', 'REFUSED');

-- CreateEnum
CREATE TYPE "Semester" AS ENUM ('S1', 'S2');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "roles" "Role"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "personalEmail" TEXT,
    "promotion" "Promotion" NOT NULL,
    "profileStatus" "ProfileStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "profileYear" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferentAssignment" (
    "id" TEXT NOT NULL,
    "schoolYear" TEXT NOT NULL,
    "semester" "Semester" NOT NULL,
    "mandatory" BOOLEAN NOT NULL,
    "referentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileObject" (
    "id" TEXT NOT NULL,
    "type" "FileType" NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "studentProfileId" TEXT NOT NULL,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostOrganism" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "structureType" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostOrganism_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tutor" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "phone" TEXT,
    "acceptsPhoneContact" BOOLEAN NOT NULL DEFAULT false,
    "organismId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tutor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'DRAFT',
    "schoolYear" TEXT NOT NULL,
    "semester" "Semester" NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "service" TEXT,
    "projectType" TEXT,
    "motivation" TEXT,
    "refusalReason" TEXT,
    "studentId" TEXT NOT NULL,
    "organismId" TEXT,
    "tutorId" TEXT,
    "snapshot" JSONB,
    "snapshotVersion" INTEGER,
    "parentStageId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagePeriod" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganismStructureType" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "OrganismStructureType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "AdminSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferentProfile_userId_key" ON "ReferentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferentAssignment_studentId_schoolYear_semester_mandatory_key" ON "ReferentAssignment"("studentId", "schoolYear", "semester", "mandatory");

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_bucketKey_key" ON "FileObject"("bucketKey");

-- CreateIndex
CREATE INDEX "Stage_status_idx" ON "Stage"("status");

-- CreateIndex
CREATE INDEX "Stage_studentId_idx" ON "Stage"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganismStructureType_label_key" ON "OrganismStructureType"("label");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSetting_key_key" ON "AdminSetting"("key");

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferentProfile" ADD CONSTRAINT "ReferentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferentAssignment" ADD CONSTRAINT "ReferentAssignment_referentId_fkey" FOREIGN KEY ("referentId") REFERENCES "ReferentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferentAssignment" ADD CONSTRAINT "ReferentAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tutor" ADD CONSTRAINT "Tutor_organismId_fkey" FOREIGN KEY ("organismId") REFERENCES "HostOrganism"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_organismId_fkey" FOREIGN KEY ("organismId") REFERENCES "HostOrganism"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "Tutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_parentStageId_fkey" FOREIGN KEY ("parentStageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagePeriod" ADD CONSTRAINT "StagePeriod_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
