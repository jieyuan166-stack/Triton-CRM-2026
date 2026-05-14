-- Add nullable slugs first so existing production clients can be backfilled safely.
ALTER TABLE "Client" ADD COLUMN "slug" TEXT;

CREATE UNIQUE INDEX "Client_slug_key" ON "Client"("slug");
