PRAGMA foreign_keys=OFF;

-- Abort early if the production owner account is missing.
CREATE TEMP TABLE "__migration_guard" ("ownerId" TEXT NOT NULL);
INSERT INTO "__migration_guard" ("ownerId")
SELECT id FROM "User" WHERE lower(email) = 'jieyuan165@gmail.com' LIMIT 1;
DROP TABLE "__migration_guard";

INSERT INTO "User" (id, email, name, passwordHash, role, createdAt, updatedAt)
SELECT
  'admin_tritonwealth',
  'admin@tritonwealth.ca',
  'Admin',
  '$2b$12$/jOW7zk80evoJt21HFNjl.LwiZLeBoHaccJHB6ihH0XskW9pIrVt6',
  'admin',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "User" WHERE lower(email) = 'jieyuan165@gmail.com')
  AND NOT EXISTS (SELECT 1 FROM "User" WHERE lower(email) = 'admin@tritonwealth.ca');

UPDATE "User"
SET role = 'advisor', updatedAt = CURRENT_TIMESTAMP
WHERE lower(email) = 'jieyuan165@gmail.com';

UPDATE "User"
SET role = 'admin', updatedAt = CURRENT_TIMESTAMP
WHERE lower(email) = 'admin@tritonwealth.ca';

-- Client: add owner and preserve every existing client row.
ALTER TABLE "Client" ADD COLUMN "userId" TEXT;
UPDATE "Client"
SET "userId" = (SELECT id FROM "User" WHERE lower(email) = 'jieyuan165@gmail.com' LIMIT 1)
WHERE "userId" IS NULL;

CREATE TABLE "new_Client" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "slug" TEXT,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "streetAddress" TEXT,
  "unit" TEXT,
  "city" TEXT,
  "province" TEXT,
  "postalCode" TEXT,
  "birthday" DATETIME,
  "notes" TEXT,
  "manualTags" TEXT,
  "hiddenTags" TEXT,
  "linkedToId" TEXT,
  "relationship" TEXT,
  "lastBirthdayEmailAt" DATETIME,
  "lastContactedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Client_linkedToId_fkey" FOREIGN KEY ("linkedToId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Client" (
  "id", "userId", "slug", "firstName", "lastName", "email", "phone", "streetAddress", "unit", "city", "province",
  "postalCode", "birthday", "notes", "manualTags", "hiddenTags", "linkedToId", "relationship", "lastBirthdayEmailAt",
  "lastContactedAt", "createdAt", "updatedAt"
)
SELECT
  "id", "userId", "slug", "firstName", "lastName", "email", "phone", "streetAddress", "unit", "city", "province",
  "postalCode", "birthday", "notes", "manualTags", "hiddenTags", "linkedToId", "relationship", "lastBirthdayEmailAt",
  "lastContactedAt", "createdAt", "updatedAt"
FROM "Client";

DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_slug_key" ON "Client"("slug");
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");
CREATE INDEX "Client_userId_idx" ON "Client"("userId");
CREATE INDEX "Client_lastName_firstName_idx" ON "Client"("lastName", "firstName");
CREATE INDEX "Client_province_idx" ON "Client"("province");

-- Policy: direct userId is required for per-user policyNumber uniqueness.
ALTER TABLE "Policy" ADD COLUMN "userId" TEXT;
UPDATE "Policy"
SET "userId" = (
  SELECT "Client"."userId" FROM "Client" WHERE "Client"."id" = "Policy"."clientId" LIMIT 1
)
WHERE "userId" IS NULL;

-- Settings: migrate global settings to jieyuan165@gmail.com.
CREATE TABLE "new_Settings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Settings" ("id", "userId", "data", "updatedAt")
SELECT
  CASE WHEN "id" = 'global' THEN 'settings_' || (SELECT id FROM "User" WHERE lower(email) = 'jieyuan165@gmail.com' LIMIT 1) ELSE "id" END,
  (SELECT id FROM "User" WHERE lower(email) = 'jieyuan165@gmail.com' LIMIT 1),
  "data",
  "updatedAt"
FROM "Settings";

DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
CREATE UNIQUE INDEX "Settings_userId_key" ON "Settings"("userId");

-- Rebuild Policy to replace the old global policyNumber unique constraint.
CREATE TABLE "new_Policy" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "carrier" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "productType" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "policyNumber" TEXT NOT NULL,
  "sumAssured" REAL NOT NULL DEFAULT 0,
  "premium" REAL NOT NULL DEFAULT 0,
  "paymentFrequency" TEXT NOT NULL,
  "paymentTermYears" INTEGER,
  "effectiveDate" DATETIME NOT NULL,
  "premiumDate" TEXT,
  "maturityDate" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'active',
  "isCorporateInsurance" BOOLEAN NOT NULL DEFAULT false,
  "businessName" TEXT,
  "isInvestmentLoan" BOOLEAN NOT NULL DEFAULT false,
  "lender" TEXT,
  "loanAmount" REAL,
  "loanRate" REAL,
  "isJoint" BOOLEAN NOT NULL DEFAULT false,
  "jointWithClientId" TEXT,
  "policyOwnerName" TEXT,
  "policyOwnerClientId" TEXT,
  "policyOwner2Name" TEXT,
  "policyOwner2ClientId" TEXT,
  "insuredPersons" TEXT,
  "lastRenewalEmailAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Policy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Policy_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Policy_jointWithClientId_fkey" FOREIGN KEY ("jointWithClientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Policy" (
  "id", "userId", "clientId", "carrier", "category", "productType", "productName", "policyNumber",
  "sumAssured", "premium", "paymentFrequency", "paymentTermYears", "effectiveDate", "premiumDate", "maturityDate",
  "status", "isCorporateInsurance", "businessName", "isInvestmentLoan", "lender", "loanAmount", "loanRate",
  "isJoint", "jointWithClientId", "policyOwnerName", "policyOwnerClientId", "policyOwner2Name", "policyOwner2ClientId",
  "insuredPersons", "lastRenewalEmailAt", "createdAt", "updatedAt"
)
SELECT
  "id", "userId", "clientId", "carrier", "category", "productType", "productName", "policyNumber",
  "sumAssured", "premium", "paymentFrequency", "paymentTermYears", "effectiveDate", "premiumDate", "maturityDate",
  "status", "isCorporateInsurance", "businessName", "isInvestmentLoan", "lender", "loanAmount", "loanRate",
  "isJoint", "jointWithClientId", "policyOwnerName", "policyOwnerClientId", "policyOwner2Name", "policyOwner2ClientId",
  "insuredPersons", "lastRenewalEmailAt", "createdAt", "updatedAt"
FROM "Policy";

DROP TABLE "Policy";
ALTER TABLE "new_Policy" RENAME TO "Policy";

CREATE UNIQUE INDEX "Policy_userId_policyNumber_key" ON "Policy"("userId", "policyNumber");
CREATE INDEX "Policy_userId_idx" ON "Policy"("userId");
CREATE INDEX "Policy_clientId_idx" ON "Policy"("clientId");
CREATE INDEX "Policy_jointWithClientId_idx" ON "Policy"("jointWithClientId");
CREATE INDEX "Policy_policyOwnerClientId_idx" ON "Policy"("policyOwnerClientId");
CREATE INDEX "Policy_policyOwner2ClientId_idx" ON "Policy"("policyOwner2ClientId");
CREATE INDEX "Policy_status_idx" ON "Policy"("status");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
