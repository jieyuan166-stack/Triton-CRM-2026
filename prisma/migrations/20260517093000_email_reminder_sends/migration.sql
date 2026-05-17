-- CreateTable
CREATE TABLE "EmailReminderSend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupeKey" TEXT NOT NULL,
    "policyId" TEXT,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stage" TEXT,
    "cycleKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "messageId" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailReminderSend_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmailReminderSend_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailReminderSend_dedupeKey_key" ON "EmailReminderSend"("dedupeKey");

-- CreateIndex
CREATE INDEX "EmailReminderSend_clientId_sentAt_idx" ON "EmailReminderSend"("clientId", "sentAt");

-- CreateIndex
CREATE INDEX "EmailReminderSend_policyId_sentAt_idx" ON "EmailReminderSend"("policyId", "sentAt");

-- CreateIndex
CREATE INDEX "EmailReminderSend_type_cycleKey_idx" ON "EmailReminderSend"("type", "cycleKey");
