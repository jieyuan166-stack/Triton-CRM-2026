-- Email uniqueness is scoped to the advisor/user, not global across the CRM.
-- This allows different advisors to manage the same client email independently.
DROP INDEX IF EXISTS "Client_email_key";
CREATE UNIQUE INDEX "Client_userId_email_key" ON "Client"("userId", "email");
