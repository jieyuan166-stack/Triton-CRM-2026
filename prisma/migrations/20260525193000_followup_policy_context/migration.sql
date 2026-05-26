ALTER TABLE "FollowUp" ADD COLUMN "policyId" TEXT;
ALTER TABLE "FollowUp" ADD COLUMN "policyNumber" TEXT;
ALTER TABLE "FollowUp" ADD COLUMN "policyLabel" TEXT;

CREATE INDEX "FollowUp_policyId_idx" ON "FollowUp"("policyId");
