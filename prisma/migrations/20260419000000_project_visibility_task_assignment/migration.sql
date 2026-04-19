-- CreateEnum
CREATE TYPE "ProjectVisibility" AS ENUM ('personal', 'shared');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "visibility" "ProjectVisibility" NOT NULL DEFAULT 'personal';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "assignedToUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
