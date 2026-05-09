-- Track when goals, projects, tasks and action items reached a "done" state so
-- the active lists can hide items completed in earlier weeks while keeping the
-- current week's wins visible. The Completed page reads off this column.

ALTER TABLE "Goal"       ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "Project"    ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "Task"       ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "ActionItem" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

-- Backfill existing terminal-state rows so they don't reappear on the active
-- list after the migration. Goal/Project carry updatedAt; Task/ActionItem only
-- have createdAt, so we use that as the best available proxy.
UPDATE "Goal"       SET "completedAt" = "updatedAt" WHERE "status" = 'completed' AND "completedAt" IS NULL;
UPDATE "Project"    SET "completedAt" = "updatedAt" WHERE "status" = 'done'      AND "completedAt" IS NULL;
UPDATE "Task"       SET "completedAt" = "createdAt" WHERE "status" = 'done'      AND "completedAt" IS NULL;
UPDATE "ActionItem" SET "completedAt" = "createdAt" WHERE "status" = 'done'      AND "completedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Goal_completedAt_idx"       ON "Goal"       ("completedAt");
CREATE INDEX IF NOT EXISTS "Project_completedAt_idx"    ON "Project"    ("completedAt");
CREATE INDEX IF NOT EXISTS "Task_completedAt_idx"       ON "Task"       ("completedAt");
CREATE INDEX IF NOT EXISTS "ActionItem_completedAt_idx" ON "ActionItem" ("completedAt");
