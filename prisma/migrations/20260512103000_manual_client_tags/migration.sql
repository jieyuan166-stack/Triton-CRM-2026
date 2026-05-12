-- Add advisor-controlled tag overrides.
ALTER TABLE "Client" ADD COLUMN "manualTags" TEXT;
ALTER TABLE "Client" ADD COLUMN "hiddenTags" TEXT;
