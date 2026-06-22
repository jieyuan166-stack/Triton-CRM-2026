-- Client email addresses are contact details, not identities.
-- Multiple clients can share a household, corporate, or placeholder email.
DROP INDEX IF EXISTS "Client_userId_email_key";
CREATE INDEX IF NOT EXISTS "Client_userId_email_idx" ON "Client"("userId", "email");
