-- CreateTable
CREATE TABLE "ClientRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromClientId" TEXT NOT NULL,
    "toClientId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientRelationship_fromClientId_fkey" FOREIGN KEY ("fromClientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientRelationship_toClientId_fkey" FOREIGN KEY ("toClientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Migrate legacy one-link client data into the new multi-link table.
INSERT INTO "ClientRelationship" ("id", "fromClientId", "toClientId", "relationship", "createdAt")
SELECT
    lower(hex(randomblob(12))),
    "id",
    "linkedToId",
    "relationship",
    "createdAt"
FROM "Client"
WHERE "linkedToId" IS NOT NULL
  AND "linkedToId" != ''
  AND "linkedToId" != "id"
  AND "relationship" IS NOT NULL
  AND "relationship" != '';

-- CreateIndex
CREATE UNIQUE INDEX "ClientRelationship_fromClientId_toClientId_key" ON "ClientRelationship"("fromClientId", "toClientId");

-- CreateIndex
CREATE INDEX "ClientRelationship_fromClientId_idx" ON "ClientRelationship"("fromClientId");

-- CreateIndex
CREATE INDEX "ClientRelationship_toClientId_idx" ON "ClientRelationship"("toClientId");
