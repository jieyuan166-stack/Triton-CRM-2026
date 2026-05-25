ALTER TABLE "Policy" ADD COLUMN "ongoingInvestmentAmount" REAL;
ALTER TABLE "Policy" ADD COLUMN "ongoingInvestmentFrequency" TEXT;
ALTER TABLE "Policy" ADD COLUMN "ongoingInvestmentFrequencyCustom" TEXT;
ALTER TABLE "Policy" ADD COLUMN "ongoingInvestmentStartDate" DATETIME;
ALTER TABLE "Policy" ADD COLUMN "ongoingInvestmentEndDate" DATETIME;
