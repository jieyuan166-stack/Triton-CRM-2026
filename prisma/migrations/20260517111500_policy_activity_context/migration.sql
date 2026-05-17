ALTER TABLE "EmailHistory" ADD COLUMN "policyId" TEXT;
ALTER TABLE "EmailHistory" ADD COLUMN "policyNumber" TEXT;
ALTER TABLE "EmailHistory" ADD COLUMN "policyLabel" TEXT;
ALTER TABLE "EmailHistory" ADD COLUMN "communicationType" TEXT;
CREATE INDEX "EmailHistory_policyId_date_idx" ON "EmailHistory"("policyId", "date");
