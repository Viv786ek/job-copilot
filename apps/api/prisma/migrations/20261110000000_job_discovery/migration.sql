-- AlterTable
ALTER TABLE "JobPreference" ADD COLUMN     "discoveryCompletedAt" TIMESTAMP(3),
ADD COLUMN     "experienceLevel" TEXT,
ADD COLUMN     "linkedinUrl" TEXT,
ADD COLUMN     "salaryCurrency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "salaryFloor" INTEGER;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "alsoOn" JSONB,
ADD COLUMN     "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

