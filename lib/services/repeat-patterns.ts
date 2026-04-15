import { prisma } from "@/lib/db"
import type {
  CreateRepeatPatternInput,
  UpdateRepeatPatternInput,
  ModifyInstanceInput,
} from "@/lib/validations/repeat-pattern"
import { isValidInstanceDate, toDateStr } from "@/lib/services/repeat-expand"

/**
 * Create a new repeat pattern.
 */
export async function createRepeatPattern(data: CreateRepeatPatternInput, userId: string) {
  // Validate role ownership
  const role = await prisma.role.findFirst({
    where: { id: data.roleId, userId },
  })
  if (!role) {
    throw new Error("Role not found or not owned by user")
  }

  return prisma.repeatPattern.create({
    data: {
      roleId: data.roleId,
      repeatType: data.repeatType,
      intervalValue: data.intervalValue ?? 1,
      startDate: new Date(`${data.startDate}T00:00:00Z`),
      endDate: data.endDate ? new Date(`${data.endDate}T00:00:00Z`) : null,
      dayPattern: data.dayPattern ?? {},
      startMinutes: data.startMinutes,
      endMinutes: data.endMinutes,
      title: data.title ?? "",
      userId,
    },
  })
}

/**
 * Update an existing repeat pattern.
 */
export async function updateRepeatPattern(
  id: string,
  data: UpdateRepeatPatternInput,
  userId: string
) {
  const existing = await prisma.repeatPattern.findFirst({
    where: { id, userId },
  })
  if (!existing) return null

  // If role is being changed, validate ownership
  if (data.roleId) {
    const role = await prisma.role.findFirst({
      where: { id: data.roleId, userId },
    })
    if (!role) {
      throw new Error("Role not found or not owned by user")
    }
  }

  const updateData: Record<string, unknown> = { ...data }
  if (data.startDate) {
    updateData.startDate = new Date(`${data.startDate}T00:00:00Z`)
  }
  if (data.endDate !== undefined) {
    updateData.endDate = data.endDate ? new Date(`${data.endDate}T00:00:00Z`) : null
  }

  return prisma.repeatPattern.update({
    where: { id },
    data: updateData,
  })
}

/**
 * Delete a repeat pattern.
 * scope "all" deletes the pattern entirely.
 * scope "future" sets endDate to today.
 */
export async function deleteRepeatPattern(
  id: string,
  scope: "all" | "future",
  userId: string
) {
  const existing = await prisma.repeatPattern.findFirst({
    where: { id, userId },
  })
  if (!existing) return null

  if (scope === "all") {
    return prisma.repeatPattern.delete({ where: { id } })
  }

  // scope === "future": set endDate to today
  const today = toDateStr(new Date())
  return prisma.repeatPattern.update({
    where: { id },
    data: { endDate: new Date(`${today}T00:00:00Z`) },
  })
}

/**
 * Modify a single instance of a repeat pattern by creating/updating an exception.
 */
export async function modifyRepeatInstance(
  patternId: string,
  dateStr: string,
  data: ModifyInstanceInput,
  userId: string
) {
  const pattern = await prisma.repeatPattern.findFirst({
    where: { id: patternId, userId },
  })
  if (!pattern) {
    throw new Error("Pattern not found or not owned by user")
  }

  // Validate date is a valid instance
  const targetDate = new Date(`${dateStr}T00:00:00Z`)
  const patternData = {
    id: pattern.id,
    roleId: pattern.roleId,
    repeatType: pattern.repeatType,
    intervalValue: pattern.intervalValue,
    startDate: pattern.startDate,
    endDate: pattern.endDate,
    dayPattern: pattern.dayPattern as Record<string, unknown>,
    startMinutes: pattern.startMinutes,
    endMinutes: pattern.endMinutes,
    title: pattern.title,
    userId: pattern.userId,
  }

  if (!isValidInstanceDate(patternData, targetDate)) {
    throw new Error("Date is not a valid instance of this pattern")
  }

  return prisma.repeatException.upsert({
    where: {
      repeatPatternId_exceptionDate: {
        repeatPatternId: patternId,
        exceptionDate: targetDate,
      },
    },
    create: {
      repeatPatternId: patternId,
      exceptionDate: targetDate,
      exceptionType: "modified",
      modifiedStartMinutes: data.startMinutes ?? null,
      modifiedEndMinutes: data.endMinutes ?? null,
      modifiedTitle: data.title ?? null,
      userId,
    },
    update: {
      exceptionType: "modified",
      modifiedStartMinutes: data.startMinutes ?? null,
      modifiedEndMinutes: data.endMinutes ?? null,
      modifiedTitle: data.title ?? null,
    },
  })
}

/**
 * Skip a single instance of a repeat pattern.
 */
export async function skipRepeatInstance(
  patternId: string,
  dateStr: string,
  userId: string
) {
  const pattern = await prisma.repeatPattern.findFirst({
    where: { id: patternId, userId },
  })
  if (!pattern) {
    throw new Error("Pattern not found or not owned by user")
  }

  const targetDate = new Date(`${dateStr}T00:00:00Z`)
  const patternData = {
    id: pattern.id,
    roleId: pattern.roleId,
    repeatType: pattern.repeatType,
    intervalValue: pattern.intervalValue,
    startDate: pattern.startDate,
    endDate: pattern.endDate,
    dayPattern: pattern.dayPattern as Record<string, unknown>,
    startMinutes: pattern.startMinutes,
    endMinutes: pattern.endMinutes,
    title: pattern.title,
    userId: pattern.userId,
  }

  if (!isValidInstanceDate(patternData, targetDate)) {
    throw new Error("Date is not a valid instance of this pattern")
  }

  // Check if there is a materialised slot with tasks
  const materialisedSlot = await prisma.timeSlot.findFirst({
    where: {
      repeatPatternId: patternId,
      date: targetDate,
      userId,
    },
  })
  if (materialisedSlot && materialisedSlot.taskCount > 0) {
    throw new Error("Cannot skip an instance with assigned tasks")
  }

  return prisma.repeatException.upsert({
    where: {
      repeatPatternId_exceptionDate: {
        repeatPatternId: patternId,
        exceptionDate: targetDate,
      },
    },
    create: {
      repeatPatternId: patternId,
      exceptionDate: targetDate,
      exceptionType: "skipped",
      userId,
    },
    update: {
      exceptionType: "skipped",
      modifiedStartMinutes: null,
      modifiedEndMinutes: null,
      modifiedTitle: null,
    },
  })
}
