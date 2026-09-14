ALTER TABLE "FollowUp" ADD COLUMN "recurrence" TEXT;
ALTER TABLE "FollowUp" ADD COLUMN "recurrenceSeriesId" TEXT;
ALTER TABLE "FollowUp" ADD COLUMN "reminderLeadDays" INTEGER;
ALTER TABLE "FollowUp" ADD COLUMN "advisorReminderSentAt" DATETIME;

CREATE INDEX "FollowUp_recurrenceSeriesId_idx" ON "FollowUp"("recurrenceSeriesId");
CREATE INDEX "FollowUp_reminderLeadDays_deadline_idx" ON "FollowUp"("reminderLeadDays", "deadline");
