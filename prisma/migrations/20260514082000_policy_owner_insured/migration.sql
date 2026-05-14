-- Add policy owner and insured person metadata.
ALTER TABLE "Policy" ADD COLUMN "policyOwnerName" TEXT;
ALTER TABLE "Policy" ADD COLUMN "policyOwnerClientId" TEXT;
ALTER TABLE "Policy" ADD COLUMN "insuredPersons" TEXT;
CREATE INDEX "Policy_policyOwnerClientId_idx" ON "Policy"("policyOwnerClientId");
