-- Add a per-role flag controlling whether the scheduler may fall back into
-- this role's slots for tasks that belong to other roles. Defaults to false
-- so existing work-style roles stay protected; users opt in roles they
-- want to use as a shared overflow (e.g. "General", "Free time").
ALTER TABLE "Role"
ADD COLUMN IF NOT EXISTS "allowFallbackTasks" BOOLEAN NOT NULL DEFAULT false;
