-- Drop the stray vaultPath column.
-- Earlier drafts of the VaultConfig schema had a NOT NULL vaultPath column
-- that was removed before phase 5 shipped, but some databases still have
-- it. Prisma's INSERT no longer references the column, so it blocks every
-- create with a null constraint violation. IF EXISTS keeps this safe on
-- databases where the column is already gone.
ALTER TABLE "VaultConfig" DROP COLUMN IF EXISTS "vaultPath";
