ALTER TABLE "FollowUp" ADD COLUMN "completedAt" DATETIME;

CREATE INDEX "FollowUp_completedAt_idx" ON "FollowUp"("completedAt");
