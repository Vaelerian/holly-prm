import { prisma } from "@/lib/db"
import type { CreateTimeSlotInput, UpdateTimeSlotInput } from "@/lib/validations/time-slot"
import { expandPattern, toDateStr, type ResolvedTimeSlot } from "@/lib/services/repeat-expand"

/**
 * List all time slots (concrete + virtual from repeat patterns) for a date range.
 */
export async function listTimeSlotsForRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<ResolvedTimeSlot[]> {
  const rangeStart = new Date(`${startDate}T00:00:00Z`)
  const rangeEnd = new Date(`${endDate}T23:59:59Z`)

  // Fetch concrete time slots
  const concreteSlots = await prisma.timeSlot.findMany({
    where: {
      userId,
      date: { gte: rangeStart, lte: rangeEnd },
    },
    orderBy: [{ date: "asc" }, { startMinutes: "asc" }],
  })

  // Fetch repeat patterns that could produce dates in this range
  const patterns = await prisma.repeatPattern.findMany({
    where: {
      userId,
      startDate: { lte: rangeEnd },
      OR: [
        { endDate: null },
        { endDate: { gte: rangeStart } },
      ],
    },
    include: { exceptions: true },
  })

  // Expand patterns into virtual slots
  const virtualSlots: ResolvedTimeSlot[] = []
  // Track which pattern+date combos are already materialised
  const materialisedKeys = new Set(
    concreteSlots
      .filter(s => s.repeatPatternId)
      .map(s => `${s.repeatPatternId}:${toDateStr(s.date)}`)
  )

  for (const pattern of patterns) {
    const expanded = expandPattern(
      {
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
      },
      rangeStart,
      rangeEnd,
      pattern.exceptions.map(ex => ({
        id: ex.id,
        repeatPatternId: ex.repeatPatternId,
        exceptionDate: ex.exceptionDate,
        exceptionType: ex.exceptionType,
        modifiedStartMinutes: ex.modifiedStartMinutes,
        modifiedEndMinutes: ex.modifiedEndMinutes,
        modifiedTitle: ex.modifiedTitle,
      }))
    )

    // Filter out already-materialised instances
    for (const slot of expanded) {
      const key = `${pattern.id}:${slot.date}`
      if (!materialisedKeys.has(key)) {
        virtualSlots.push(slot)
      }
    }
  }

  // Convert concrete slots to ResolvedTimeSlot format
  const resolved: ResolvedTimeSlot[] = concreteSlots.map(s => ({
    id: s.id,
    roleId: s.roleId,
    date: toDateStr(s.date),
    startMinutes: s.startMinutes,
    endMinutes: s.endMinutes,
    capacityMinutes: s.capacityMinutes,
    usedMinutes: s.usedMinutes,
    taskCount: s.taskCount,
    title: s.title,
    isVirtual: false,
    repeatPatternId: s.repeatPatternId,
  }))

  // Merge and sort
  const all = [...resolved, ...virtualSlots]
  all.sort((a, b) => {
    if (a.date < b.date) return -1
    if (a.date > b.date) return 1
    return a.startMinutes - b.startMinutes
  })

  return all
}

/**
 * Create a concrete time slot.
 */
export async function createTimeSlot(data: CreateTimeSlotInput, userId: string) {
  // Validate role ownership
  const role = await prisma.role.findFirst({
    where: { id: data.roleId, userId },
  })
  if (!role) {
    throw new Error("Role not found or not owned by user")
  }

  const capacityMinutes = data.endMinutes - data.startMinutes

  return prisma.timeSlot.create({
    data: {
      roleId: data.roleId,
      date: new Date(`${data.date}T00:00:00Z`),
      startMinutes: data.startMinutes,
      endMinutes: data.endMinutes,
      capacityMinutes,
      title: data.title ?? "",
      userId,
    },
  })
}

/**
 * Update a concrete time slot.
 */
export async function updateTimeSlot(id: string, data: UpdateTimeSlotInput, userId: string) {
  const existing = await prisma.timeSlot.findFirst({
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

  // Recalculate capacity if times change
  const startMinutes = data.startMinutes ?? existing.startMinutes
  const endMinutes = data.endMinutes ?? existing.endMinutes
  const capacityMinutes = endMinutes - startMinutes

  return prisma.timeSlot.update({
    where: { id },
    data: {
      ...data,
      capacityMinutes,
    },
  })
}

/**
 * Delete a concrete time slot.
 */
export async function deleteTimeSlot(id: string, userId: string) {
  const existing = await prisma.timeSlot.findFirst({
    where: { id, userId },
  })
  if (!existing) return null

  if (existing.taskCount > 0) {
    throw new Error("Cannot delete a time slot with assigned tasks")
  }

  return prisma.timeSlot.delete({ where: { id } })
}
