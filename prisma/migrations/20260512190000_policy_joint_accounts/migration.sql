-- Add joint-account metadata to policies. A policy remains owned by clientId;
-- jointWithClientId points at the partner client when applicable.
ALTER TABLE "Policy" ADD COLUMN "isJoint" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Policy" ADD COLUMN "jointWithClientId" TEXT;
CREATE INDEX "Policy_jointWithClientId_idx" ON "Policy"("jointWithClientId");
