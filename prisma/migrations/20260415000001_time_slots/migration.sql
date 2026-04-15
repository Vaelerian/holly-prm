-- CreateEnum
CREATE TYPE "RepeatType" AS ENUM ('daily', 'weekly', 'monthly_by_date', 'monthly_by_day', 'yearly_by_date', 'yearly_by_day');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('modified', 'skipped');

-- CreateTable
CREATE TABLE "TimeSlot" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "capacityMinutes" INTEGER NOT NULL,
    "usedMinutes" INTEGER NOT NULL DEFAULT 0,
    "taskCount" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL DEFAULT '',
    "repeatPatternId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepeatPattern" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "repeatType" "RepeatType" NOT NULL,
    "intervalValue" INTEGER NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "dayPattern" JSONB NOT NULL DEFAULT '{}',
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepeatPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepeatException" (
    "id" TEXT NOT NULL,
    "repeatPatternId" TEXT NOT NULL,
    "exceptionDate" TIMESTAMP(3) NOT NULL,
    "exceptionType" "ExceptionType" NOT NULL,
    "modifiedStartMinutes" INTEGER,
    "modifiedEndMinutes" INTEGER,
    "modifiedTitle" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepeatException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeSlot_userId_date_idx" ON "TimeSlot"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RepeatException_repeatPatternId_exceptionDate_key" ON "RepeatException"("repeatPatternId", "exceptionDate");

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_repeatPatternId_fkey" FOREIGN KEY ("repeatPatternId") REFERENCES "RepeatPattern"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeSlot" ADD CONSTRAINT "TimeSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepeatPattern" ADD CONSTRAINT "RepeatPattern_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepeatPattern" ADD CONSTRAINT "RepeatPattern_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepeatException" ADD CONSTRAINT "RepeatException_repeatPatternId_fkey" FOREIGN KEY ("repeatPatternId") REFERENCES "RepeatPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepeatException" ADD CONSTRAINT "RepeatException_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
