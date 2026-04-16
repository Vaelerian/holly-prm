-- CreateEnum
CREATE TYPE "Importance" AS ENUM ('undefined_imp', 'core', 'step', 'bonus');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('undefined_urg', 'dated', 'asap', 'soon', 'sometime');

-- CreateEnum
CREATE TYPE "EffortSize" AS ENUM ('undefined_size', 'minutes', 'hour', 'half_day', 'day', 'project_size', 'milestone');

-- CreateEnum
CREATE TYPE "ScheduleState" AS ENUM ('unscheduled', 'floating', 'fixed', 'waiting', 'alert');

-- CreateEnum
CREATE TYPE "ProjectImportance" AS ENUM ('more', 'same', 'less');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "importance" "Importance" NOT NULL DEFAULT 'undefined_imp',
ADD COLUMN "urgency" "Urgency" NOT NULL DEFAULT 'undefined_urg',
ADD COLUMN "effortSize" "EffortSize" NOT NULL DEFAULT 'undefined_size',
ADD COLUMN "effortMinutes" INTEGER,
ADD COLUMN "scheduleState" "ScheduleState" NOT NULL DEFAULT 'unscheduled',
ADD COLUMN "timeSlotId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "projectImportance" "ProjectImportance" NOT NULL DEFAULT 'same';

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "TimeSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
