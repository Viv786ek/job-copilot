-- AlterTable
ALTER TABLE "JobPreference" ADD COLUMN     "authorizedCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "openToRelocation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workModes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "lastFetchedAt" TIMESTAMP(3),
ADD COLUMN     "openJobs" INTEGER,
ADD COLUMN     "origin" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "applyUrl" TEXT,
ADD COLUMN     "ats" TEXT,
ADD COLUMN     "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "department" TEXT,
ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "relocation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remoteScope" TEXT,
ADD COLUMN     "sponsorRegister" TEXT,
ADD COLUMN     "visaConfidence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "visaEvidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "visaStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "visaTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Company_atsType_idx" ON "Company"("atsType");

-- CreateIndex
CREATE INDEX "Job_countries_idx" ON "Job" USING GIN ("countries");

-- CreateIndex
CREATE INDEX "Job_visaStatus_idx" ON "Job"("visaStatus");

-- CreateIndex
CREATE INDEX "Job_fingerprint_idx" ON "Job"("fingerprint");

