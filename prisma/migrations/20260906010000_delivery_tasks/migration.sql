CREATE TABLE "EmailDeliveryTask" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL, "type" TEXT NOT NULL,
  "clientId" TEXT, "policyId" TEXT, "cycleKey" TEXT NOT NULL, "stage" TEXT,
  "status" TEXT NOT NULL DEFAULT 'sending', "messageId" TEXT, "errorCode" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" DATETIME,
  CONSTRAINT "EmailDeliveryTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmailDeliveryTask_dedupeKey_key" ON "EmailDeliveryTask"("dedupeKey");
CREATE INDEX "EmailDeliveryTask_userId_startedAt_idx" ON "EmailDeliveryTask"("userId", "startedAt");
CREATE TABLE "AutomationRun" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL, "finishedAt" DATETIME, "lastSuccessAt" DATETIME,
  "sent" INTEGER NOT NULL DEFAULT 0, "skipped" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0, "review" INTEGER NOT NULL DEFAULT 0,
  "reasons" TEXT NOT NULL DEFAULT '{}',
  CONSTRAINT "AutomationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AutomationRun_userId_kind_key" ON "AutomationRun"("userId", "kind");
