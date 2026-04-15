-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('ongoing', 'completable');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('active', 'completed', 'archived');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "colour" TEXT NOT NULL DEFAULT '#6366F1',
    "icon" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "goalType" "GoalType" NOT NULL DEFAULT 'ongoing',
    "status" "GoalStatus" NOT NULL DEFAULT 'active',
    "targetDate" TIMESTAMP(3),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Make Task.projectId optional
ALTER TABLE "Task" ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable: Add roleId and goalId to Task
ALTER TABLE "Task" ADD COLUMN "roleId" TEXT;
ALTER TABLE "Task" ADD COLUMN "goalId" TEXT;

-- AlterTable: Add roleId and goalId to Project
ALTER TABLE "Project" ADD COLUMN "roleId" TEXT;
ALTER TABLE "Project" ADD COLUMN "goalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Role_userId_name_key" ON "Role"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Goal_roleId_name_key" ON "Goal"("roleId", "name");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: create default Role for each user
INSERT INTO "Role" ("id", "name", "description", "colour", "icon", "isDefault", "sortOrder", "userId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  'Unassigned',
  '',
  '#6366F1',
  '',
  true,
  0,
  u."id",
  NOW(),
  NOW()
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "Role" r WHERE r."userId" = u."id" AND r."isDefault" = true
);

-- Backfill: create default Goal for each default Role
INSERT INTO "Goal" ("id", "roleId", "name", "description", "goalType", "status", "isDefault", "sortOrder", "userId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  r."id",
  'General',
  '',
  'ongoing',
  'active',
  true,
  0,
  r."userId",
  NOW(),
  NOW()
FROM "Role" r
WHERE r."isDefault" = true
AND NOT EXISTS (
  SELECT 1 FROM "Goal" g WHERE g."roleId" = r."id" AND g."isDefault" = true
);

-- Backfill: set roleId and goalId on existing Projects
UPDATE "Project" p
SET "roleId" = r."id", "goalId" = g."id"
FROM "Role" r
JOIN "Goal" g ON g."roleId" = r."id" AND g."isDefault" = true
WHERE r."userId" = p."userId"
AND r."isDefault" = true
AND p."roleId" IS NULL;

-- Backfill: set roleId and goalId on existing Tasks (via their project)
UPDATE "Task" t
SET "roleId" = p."roleId", "goalId" = p."goalId"
FROM "Project" p
WHERE p."id" = t."projectId"
AND t."roleId" IS NULL;

-- Backfill: tasks without projects (orphans) - assign to user's default goal
-- This handles edge cases where projectId is already null
UPDATE "Task" t
SET "roleId" = r."id", "goalId" = g."id"
FROM "Role" r
JOIN "Goal" g ON g."roleId" = r."id" AND g."isDefault" = true
WHERE t."roleId" IS NULL
AND r."isDefault" = true;

-- Now enforce NOT NULL on roleId and goalId
ALTER TABLE "Project" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "goalId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "goalId" SET NOT NULL;
