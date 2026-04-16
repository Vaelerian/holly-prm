import { prisma } from "@/lib/db"
import { listTimeSlotsForRange } from "@/lib/services/time-slots"
import {
  getSchedulingPrefs,
  resolveEffortMinutes,
  calculateEffectiveImportance,
  importanceToSortOrder,
  urgencyToSortOrder,
} from "@/lib/services/scheduling-helpers"
import { toDateStr } from "@/lib/services/repeat-expand"

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

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

  return { startDate: start, endDate: toDateStr(addDays(today, days)) }
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
  const projectImportance = task.project?.projectImportance ?? null
  const effectiveImportance = calculateEffectiveImportance(task.importance, projectImportance)
  const effortMins = resolveEffortMinutes(
    { effortMinutes: task.effortMinutes, effortSize: task.effortSize },
    prefs
  )

  const { startDate, endDate } = dateRangeFromUrgency(task.urgency, task.dueDate, prefs)
  const slots = await listTimeSlotsForRange(userId, startDate, endDate)

  // Filter to matching role and find first with capacity
  const roleSlots = slots.filter(s => s.roleId === task.roleId)

  for (const slot of roleSlots) {
    const remaining = slot.capacityMinutes - slot.usedMinutes
    if (remaining >= effortMins) {
      let slotId = slot.id

      // Materialise virtual slot
      if (slot.isVirtual) {
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
        slotId = created.id
      }

      const scheduleState = effectiveImportance === "core" ? "fixed" : "floating"

      await prisma.timeSlot.update({
        where: { id: slotId },
        data: {
          usedMinutes: { increment: effortMins },
          taskCount: { increment: 1 },
        },
      })

      await prisma.task.update({
        where: { id: taskId },
        data: { timeSlotId: slotId, scheduleState },
      })

      return { scheduled: true, taskId, timeSlotId: slotId, date: slot.date, scheduleState }
    }
  }

  // No slot found - set alert state
  await prisma.task.update({
    where: { id: taskId },
    data: { scheduleState: "alert" },
  })

  return {
    scheduled: false,
    taskId,
    scheduleState: "alert",
    reason: `No slot with ${effortMins} minutes of capacity found for role ${task.roleId} between ${startDate} and ${endDate}`,
  }
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
  const slots = await listTimeSlotsForRange(userId, startDate, endDate)
  const roleSlots = slots.filter(s => s.roleId === task.roleId)

  for (const slot of roleSlots) {
    const remaining = slot.capacityMinutes - slot.usedMinutes
    if (remaining >= effortMins) {
      return { found: true, date: slot.date, slotId: slot.id }
    }
  }

  return { found: false, reason: `No slot with enough capacity between ${startDate} and ${endDate}` }
}

interface RescheduleResult {
  scheduled: string[]
  alerts: string[]
  urgencyEscalated: number
}

export async function rescheduleAll(userId: string): Promise<RescheduleResult> {
  const escalated = await refreshUrgency(userId)

  // Get all schedulable tasks
  const tasks = await prisma.task.findMany({
    where: {
      importance: { not: "undefined_imp" },
      status: { notIn: ["done", "cancelled"] },
      OR: [
        { project: { userId } },
        { projectId: null, goal: { userId } },
      ],
    },
    include: {
      project: { select: { id: true, projectImportance: true } },
      role: { select: { id: true } },
    },
  })

  const prefs = await getSchedulingPrefs(userId)

  // Sort by roleId ASC, effective importance ASC (core=1 first), urgency ASC, effort ASC
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
      const roleCompare = a.task.roleId.localeCompare(b.task.roleId)
      if (roleCompare !== 0) return roleCompare
      const impCompare = importanceToSortOrder(a.effectiveImportance) - importanceToSortOrder(b.effectiveImportance)
      if (impCompare !== 0) return impCompare
      const urgCompare = urgencyToSortOrder(a.task.urgency) - urgencyToSortOrder(b.task.urgency)
      if (urgCompare !== 0) return urgCompare
      return a.effortMins - b.effortMins
    })

  // Unassign all currently scheduled tasks
  for (const { task } of sorted) {
    if (task.timeSlotId) {
      const effortMins = resolveEffortMinutes(
        { effortMinutes: task.effortMinutes, effortSize: task.effortSize },
        prefs
      )
      await prisma.timeSlot.update({
        where: { id: task.timeSlotId },
        data: {
          usedMinutes: { decrement: effortMins },
          taskCount: { decrement: 1 },
        },
      })
      await prisma.task.update({
        where: { id: task.task.id },
        data: { timeSlotId: null, scheduleState: "unscheduled" },
      })
    }
  }

  // Re-assign each in priority order
  const scheduled: string[] = []
  const alerts: string[] = []

  for (const { task, effectiveImportance, effortMins } of sorted) {
    const { startDate, endDate } = dateRangeFromUrgency(task.urgency, task.dueDate, prefs)
    const slots = await listTimeSlotsForRange(userId, startDate, endDate)
    const roleSlots = slots.filter(s => s.roleId === task.roleId)

    let assigned = false
    for (const slot of roleSlots) {
      const remaining = slot.capacityMinutes - slot.usedMinutes
      if (remaining >= effortMins) {
        let slotId = slot.id

        if (slot.isVirtual) {
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
          slotId = created.id
        }

        const scheduleState = effectiveImportance === "core" ? "fixed" : "floating"

        await prisma.timeSlot.update({
          where: { id: slotId },
          data: {
            usedMinutes: { increment: effortMins },
            taskCount: { increment: 1 },
          },
        })

        await prisma.task.update({
          where: { id: task.id },
          data: { timeSlotId: slotId, scheduleState },
        })

        scheduled.push(task.id)
        assigned = true
        break
      }
    }

    if (!assigned) {
      await prisma.task.update({
        where: { id: task.id },
        data: { scheduleState: "alert" },
      })
      alerts.push(task.id)
    }
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
