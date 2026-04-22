-- Reconcile VaultConfig schema drift.
-- Earlier forms of 20260410000004_phase5_vault shipped with a different column
-- set, so some databases are missing columns the current Prisma client expects.
-- Each ADD COLUMN IF NOT EXISTS is a no-op where the column already exists.
-- Empty-string defaults are provided for NOT NULL columns that have no schema
-- default so the ALTER succeeds on populated tables; application writes still
-- supply real values via the Prisma client.

ALTER TABLE "VaultConfig"
  ADD COLUMN IF NOT EXISTS "couchDbUrl" TEXT NOT NULL DEFAULT 'http://localhost:5984';

ALTER TABLE "VaultConfig"
  ADD COLUMN IF NOT EXISTS "couchDbDatabase" TEXT NOT NULL DEFAULT 'obsidian';

ALTER TABLE "VaultConfig"
  ADD COLUMN IF NOT EXISTS "couchDbUsername" TEXT NOT NULL DEFAULT '';

ALTER TABLE "VaultConfig"
  ADD COLUMN IF NOT EXISTS "couchDbPassword" TEXT NOT NULL DEFAULT '';

ALTER TABLE "VaultConfig"
  ADD COLUMN IF NOT EXISTS "e2ePassphrase" TEXT NOT NULL DEFAULT '';

ALTER TABLE "VaultConfig"
  ADD COLUMN IF NOT EXISTS "workdayCron" TEXT NOT NULL DEFAULT '0 * * * 1-5';

ALTER TABLE "VaultConfig"
  ADD COLUMN IF NOT EXISTS "weekendCron" TEXT NOT NULL DEFAULT '0 */4 * * 0,6';

ALTER TABLE "VaultConfig"
  ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP(3);

ALTER TABLE "VaultConfig"
  ADD COLUMN IF NOT EXISTS "lastSeq" TEXT NOT NULL DEFAULT '0';

ALTER TABLE "VaultConfig"
  ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "VaultConfig"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "VaultConfig"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "VaultConfig"
  ADD COLUMN IF NOT EXISTS "userId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "VaultConfig_userId_key" ON "VaultConfig"("userId");
