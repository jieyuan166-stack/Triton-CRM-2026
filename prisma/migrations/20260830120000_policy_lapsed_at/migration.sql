ALTER TABLE "Policy" ADD COLUMN "lapsedAt" DATETIME;

CREATE INDEX "Policy_lapsedAt_idx" ON "Policy"("lapsedAt");
