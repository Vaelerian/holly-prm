-- Per-user Obsidian vault access.
-- The single VaultConfig row stays as the system-wide config. Each User now has
-- a vaultAccess level controlling whether they can read or write the vault.
-- Admin users (gated by ADMIN_EMAIL at runtime) always have full access.

-- 1. Create the access enum.
DO $$ BEGIN
  CREATE TYPE "VaultAccess" AS ENUM ('none', 'read', 'readwrite');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add vaultAccess to User. Default 'none' so no existing user accidentally gains access.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "vaultAccess" "VaultAccess" NOT NULL DEFAULT 'none';

-- 3. If a VaultConfig row is currently tied to a user, give that user readwrite
--    so their existing access level is preserved across the schema change.
UPDATE "User"
SET "vaultAccess" = 'readwrite'
WHERE "id" IN (
  SELECT "userId" FROM "VaultConfig" WHERE "userId" IS NOT NULL
);

-- 4. Detach VaultConfig from any single user. There can only be one row.
ALTER TABLE "VaultConfig" DROP CONSTRAINT IF EXISTS "VaultConfig_userId_fkey";
DROP INDEX IF EXISTS "VaultConfig_userId_key";
ALTER TABLE "VaultConfig" DROP COLUMN IF EXISTS "userId";
