-- Add optional second policy owner metadata.
ALTER TABLE "Policy" ADD COLUMN "policyOwner2Name" TEXT;
ALTER TABLE "Policy" ADD COLUMN "policyOwner2ClientId" TEXT;
CREATE INDEX "Policy_policyOwner2ClientId_idx" ON "Policy"("policyOwner2ClientId");
