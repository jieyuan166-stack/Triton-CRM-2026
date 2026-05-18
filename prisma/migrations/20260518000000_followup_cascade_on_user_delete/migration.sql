-- Allow deleting a User to cascade through FollowUp.createdBy.
-- Previously this constraint was ON DELETE RESTRICT, which made the
-- admin "delete user" flow fail whenever the user had ever created
-- a follow-up record. SQLite cannot ALTER a foreign-key clause in
-- place, so the standard Prisma pattern is rebuild + copy + rename.

PRAGMA foreign_keys=OFF;

CREATE TABLE "new_FollowUp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FollowUp_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_FollowUp" ("id", "clientId", "createdById", "type", "date", "summary", "details", "createdAt")
SELECT "id", "clientId", "createdById", "type", "date", "summary", "details", "createdAt"
FROM "FollowUp";

DROP TABLE "FollowUp";
ALTER TABLE "new_FollowUp" RENAME TO "FollowUp";

CREATE INDEX "FollowUp_clientId_date_idx" ON "FollowUp"("clientId", "date");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
