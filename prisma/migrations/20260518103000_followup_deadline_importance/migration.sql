-- Add optional structured follow-up scheduling fields.
ALTER TABLE "FollowUp" ADD COLUMN "deadline" DATETIME;
ALTER TABLE "FollowUp" ADD COLUMN "importance" TEXT;

CREATE INDEX "FollowUp_deadline_idx" ON "FollowUp"("deadline");
CREATE INDEX "FollowUp_importance_idx" ON "FollowUp"("importance");
