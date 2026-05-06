import { prisma } from "@/lib/db"
import type { Prisma } from "@/app/generated/prisma/client"
import { listTimeSlotsForRange } from "@/lib/services/time-slots"
import {
  getSchedulingPrefs,
  resolveEffortMinutes,
  calculateEffectiveImportance,
  importanceToSortOrder,
  urgencyToSortOrder,
  recomputeSlotUsage,
  type SchedulingPrefs,
} from "@/lib/services/scheduling-helpers"
import { toDateStr, type ResolvedTimeSlot } from "@/lib/services/repeat-expand"

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

/**
 * Build the [startDate, endDate] window in which to look for slots.
 *
 * Window length comes from urgency (asap/soon/sometime/scanAhead). When the
 * task has a dueDate, the window is capped at that date so a "sometime"
 * task with a due date next week never lands in a slot 30 days out.
 */
function dateRangeFromUrgency(
  urgency: string,
  dueDate: Date | null,
  prefs: { asapDays: number; soonDays: number; sometimeDays: number; scanAheadDays: number }
): { startDate: string; endDate: string } {
  const today = new Date()
  const start = toDateStr(today)

  if (urgency === "dated" && dueDate) {
    return { startDate: start, endDate: toDateStr(dueDate) }
  }

  let days: number
  switch (urgency) {
    case "asap":
      days = prefs.asapDays
      break
    case "soon":
      days = prefs.soonDays
      break
    case "sometime":
      days = prefs.sometimeDays
      break
    default:
      days = prefs.scanAheadDays
  }

  let endDate = toDateStr(addDays(today, days))

  if (dueDate) {
    const dueStr = toDateStr(dueDate)
    if (dueStr < endDate) endDate = dueStr
    if (dueStr < start) endDate = start
  }

  return { startDate: start, endDate }
}

/**
 * Materialise a virtual (RepeatPattern-derived) slot into a concrete
 * TimeSlot row. Returns the concrete slot id. No-op for already-concrete
 * slots.
 */
async function materialiseSlot(slot: ResolvedTimeSlot, userId: string): Promise<string> {
  if (!slot.isVirtual) return slot.id
  const created = await prisma.timeSlot.create({
    data: {
      roleId: slot.roleId,
      date: new Date(`${slot.date}T00:00:00Z`),
      startMinutes: slot.startMinutes,
      endMinutes: slot.endMinutes,
      capacityMinutes: slot.capacityMinutes,
      usedMinutes: 0,
      taskCount: 0,
      title: slot.title,
      repeatPatternId: slot.repeatPatternId,
      userId,
    },
  })
  return created.id
}

/**
 * Find the first slot with enough remaining capacity. Two-pass:
 *   1. role-matched slots (preferred)
 *   2. slots whose role is opted in via Role.allowFallbackTasks
 *
 * Slots are already ordered by date asc / startMinutes asc. Roles that have
 * not opted in protect their time from cross-role overflow.
 */
function pickSlot(
  slots: ResolvedTimeSlot[],
  roleId: string,
  effortMinutes: number,
  fallbackRoleIds: Set<string>
): ResolvedTimeSlot | null {
  const fits = (s: ResolvedTimeSlot) => s.capacityMinutes - s.usedMinutes >= effortMinutes
  const matchingRole = slots.find(s => s.roleId === roleId && fits(s))
  if (matchingRole) return matchingRole
  if (fallbackRoleIds.size === 0) return null
  return slots.find(s => fallbackRoleIds.has(s.roleId) && fits(s)) ?? null
}

/** Fetch the user's roles that are opted in to receive fallback tasks. */
async function getFallbackRoleIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.role.findMany({
    where: { userId, allowFallbackTasks: true },
    select: { id: true },
  })
  return new Set(rows.map(r => r.id))
}

async function unassignFromSlot(taskId: string, slotId: string, prefs: SchedulingPrefs): Promise<void> {
  await prisma.$transaction(async tx => {
    await tx.task.update({
      where: { id: taskId },
      data: { timeSlotId: null, scheduleState: "unscheduled" },
    })
    await recomputeSlotUsage(slotId, prefs, tx)
  })
}

async function assignToSlot(
  taskId: string,
  slotId: string,
  scheduleState: "fixed" | "floating",
  prefs: SchedulingPrefs
): Promise<void> {
  await prisma.$transaction(async tx => {
    await tx.task.update({
      where: { id: taskId },
      data: { timeSlotId: slotId, scheduleState },
    })
    await recomputeSlotUsage(slotId, prefs, tx)
  })
}

interface ScheduleResult {
  scheduled: boolean
  taskId: string
  timeSlotId?: string
  date?: string
  scheduleState?: string
  reason?: string
}

export async function scheduleTask(taskId: string, userId: string): Promise<ScheduleResult> {
  const task = await prisma.task.findFirst({
    where: { id: taskId },
    include: {
      project: { select: { id: true, projectImportance: true } },
      role: { select: { id: true } },
    },
  })

  if (!task) {
    return { scheduled: false, taskId, reason: "Task not found" }
  }

  if (task.importance === "undefined_imp") {
    return { scheduled: false, taskId, reason: "Task importance is undefined; set importance before scheduling" }
  }

  if (task.status === "done" || task.status === "cancelled") {
    return { scheduled: false, taskId, reason: `Task status is ${task.status}` }
  }

  const prefs = await getSchedulingPrefs(userId)

  if (task.timeSlotId) {
    await unassignFromSlot(taskId, task.timeSlotId, prefs)
  }

  const projectImportance = task.project?.projectImportance ?? null
  const effectiveImportance = calculateEffectiveImportance(task.importance, projectImportance)
  const effortMins = resolveEffortMinutes(
    { effortMinutes: task.effortMinutes, effortSize: task.effortSize },
    prefs
  )

  const { startDate, endDate } = dateRangeFromUrgency(task.urgency, task.dueDate, prefs)
  const [slots, fallbackRoleIds] = await Promise.all([
    listTimeSlotsForRange(userId, startDate, endDate),
    getFallbackRoleIds(userId),
  ])
  const candidate = pickSlot(slots, task.roleId, effortMins, fallbackRoleIds)

  if (!candidate) {
    await prisma.task.update({
      where: { id: taskId },
      data: { scheduleState: "alert" },
    })
    return {
      scheduled: false,
      taskId,
      scheduleState: "alert",
      reason: `No slot with ${effortMins} minutes of capacity between ${startDate} and ${endDate}`,
    }
  }

  const slotId = await materialiseSlot(candidate, userId)
  const scheduleState: "fixed" | "floating" = effectiveImportance === "core" ? "fixed" : "floating"
  await assignToSlot(taskId, slotId, scheduleState, prefs)

  return { scheduled: true, taskId, timeSlotId: slotId, date: candidate.date, scheduleState }
}

interface SuggestResult {
  found: boolean
  date?: string
  slotId?: string
  reason?: string
}

export async function suggestDate(taskId: string, userId: string): Promise<SuggestResult> {
  const task = await prisma.task.findFirst({
    where: { id: taskId },
    include: {
      project: { select: { id: true, projectImportance: true } },
      role: { select: { id: true } },
    },
  })

  if (!task) return { found: false, reason: "Task not found" }

  if (task.importance === "undefined_imp") {
    return { found: false, reason: "Task importance is undefined" }
  }

  const prefs = await getSchedulingPrefs(userId)
  const effortMins = resolveEffortMinutes(
    { effortMinutes: task.effortMinutes, effortSize: task.effortSize },
    prefs
  )

  const { startDate, endDate } = dateRangeFromUrgency(task.urgency, task.dueDate, prefs)
  const [slots, fallbackRoleIds] = await Promise.all([
    listTimeSlotsForRange(userId, startDate, endDate),
    getFallbackRoleIds(userId),
  ])
  const candidate = pickSlot(slots, task.roleId, effortMins, fallbackRoleIds)

  if (!candidate) {
    return { found: false, reason: `No slot with enough capacity between ${startDate} and ${endDate}` }
  }
  return { found: true, date: candidate.date, slotId: candidate.id }
}

interface RescheduleResult {
  scheduled: string[]
  alerts: string[]
  urgencyEscalated: number
}

interface RescheduleScope {
  /** When set, only tasks currently assigned to this slot are reshuffled. */
  slotId?: string
}

export async function rescheduleAll(userId: string, scope: RescheduleScope = {}): Promise<RescheduleResult> {
  const escalated = scope.slotId ? 0 : await refreshUrgency(userId)

  const taskWhere: Prisma.TaskWhereInput = scope.slotId
    ? { timeSlotId: scope.slotId }
    : {
        importance: { not: "undefined_imp" },
        status: { notIn: ["done", "cancelled"] },
        OR: [
          { project: { userId } },
          { projectId: null, goal: { userId } },
        ],
      }

  const tasks = await prisma.task.findMany({
    where: taskWhere,
    include: {
      project: { select: { id: true, projectImportance: true } },
      role: { select: { id: true } },
    },
  })

  const prefs = await getSchedulingPrefs(userId)

  // Sort by effective importance ASC (core first), urgency ASC (dated/asap
  // first), dueDate ASC, effort ASC. No role grouping — slot matching is
  // handled per-task in pickSlot.
  const sorted = tasks
    .map(t => {
      const pi = t.project?.projectImportance ?? null
      const eff = calculateEffectiveImportance(t.importance, pi)
      const effortMins = resolveEffortMinutes(
        { effortMinutes: t.effortMinutes, effortSize: t.effortSize },
        prefs
      )
      return { task: t, effectiveImportance: eff, effortMins }
    })
    .sort((a, b) => {
      const impCompare = importanceToSortOrder(a.effectiveImportance) - importanceToSortOrder(b.effectiveImportance)
      if (impCompare !== 0) return impCompare
      const urgCompare = urgencyToSortOrder(a.task.urgency) - urgencyToSortOrder(b.task.urgency)
      if (urgCompare !== 0) return urgCompare
      const aDue = a.task.dueDate?.getTime() ?? Number.POSITIVE_INFINITY
      const bDue = b.task.dueDate?.getTime() ?? Number.POSITIVE_INFINITY
      if (aDue !== bDue) return aDue - bDue
      return a.effortMins - b.effortMins
    })

  // Unassign everything in scope so the engine can repack.
  for (const { task } of sorted) {
    if (task.timeSlotId) {
      await unassignFromSlot(task.id, task.timeSlotId, prefs)
    }
  }

  const scheduled: string[] = []
  const alerts: string[] = []
  const fallbackRoleIds = await getFallbackRoleIds(userId)

  for (const { task, effectiveImportance, effortMins } of sorted) {
    const { startDate, endDate } = dateRangeFromUrgency(task.urgency, task.dueDate, prefs)
    const slots = await listTimeSlotsForRange(userId, startDate, endDate)
    const candidate = pickSlot(slots, task.roleId, effortMins, fallbackRoleIds)

    if (!candidate) {
      await prisma.task.update({
        where: { id: task.id },
        data: { scheduleState: "alert" },
      })
      alerts.push(task.id)
      continue
    }

    const slotId = await materialiseSlot(candidate, userId)
    const state: "fixed" | "floating" = effectiveImportance === "core" ? "fixed" : "floating"
    await assignToSlot(task.id, slotId, state, prefs)
    scheduled.push(task.id)
  }

  return { scheduled, alerts, urgencyEscalated: escalated }
}

export async function refreshUrgency(userId: string): Promise<number> {
  const prefs = await getSchedulingPrefs(userId)
  const now = new Date()
  let count = 0

  const tasks = await prisma.task.findMany({
    where: {
      dueDate: { not: null },
      urgency: { notIn: ["dated", "undefined_urg"] },
      status: { notIn: ["done", "cancelled"] },
      OR: [
        { project: { userId } },
        { projectId: null, goal: { userId } },
      ],
    },
  })

  for (const task of tasks) {
    if (!task.dueDate) continue
    const daysUntilDue = Math.ceil((task.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    let newUrgency: string | null = null

    if (daysUntilDue <= prefs.asapDays && task.urgency !== "asap") {
      newUrgency = "asap"
    } else if (daysUntilDue <= prefs.soonDays && task.urgency !== "asap" && task.urgency !== "soon") {
      newUrgency = "soon"
    }

    if (newUrgency) {
      await prisma.task.update({
        where: { id: task.id },
        data: { urgency: newUrgency as "asap" | "soon" },
      })
      count++
    }
  }

  return count
}
