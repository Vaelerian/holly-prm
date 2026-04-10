import { prisma } from "@/lib/db"

export async function getHealthAnalytics(days: number) {
  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - days)

  const contacts = await prisma.contact.findMany({
    where: { interactionFreqDays: { not: null } },
    select: { id: true, name: true, healthScore: true, lastInteraction: true, interactionFreqDays: true },
    orderBy: { healthScore: "asc" },
  })

  // Find the most recent health score for each contact from before the window
  const auditLogs = await prisma.auditLog.findMany({
    where: { entity: "Contact", action: "update", occurredAt: { lt: windowStart } },
    orderBy: { occurredAt: "desc" },
  })

  const historicalScores = new Map<string, number>()
  for (const log of auditLogs) {
    if (historicalScores.has(log.entityId)) continue
    const diff = log.diff as { after?: { healthScore?: number } } | null
    if (diff?.after?.healthScore !== undefined) {
      historicalScores.set(log.entityId, diff.after.healthScore)
    }
  }

  const now = new Date()
  return {
    window: days,
    contacts: contacts.map(c => {
      const previousScore = historicalScores.get(c.id)
      const trend =
        previousScore === undefined
          ? "insufficient_data"
          : c.healthScore > previousScore
          ? "improving"
          : c.healthScore < previousScore
          ? "declining"
          : "stable"
      const daysSinceLastInteraction = c.lastInteraction
        ? Math.floor((now.getTime() - c.lastInteraction.getTime()) / (1000 * 60 * 60 * 24))
        : null
      return {
        id: c.id,
        name: c.name,
        currentScore: c.healthScore,
        previousScore: previousScore ?? null,
        trend,
        daysSinceLastInteraction,
        frequencyTargetDays: c.interactionFreqDays,
      }
    }),
  }
}

export async function getVelocityAnalytics(days: number) {
  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - days)

  const projects = await prisma.project.findMany({
    where: { status: { in: ["planning", "active", "on_hold"] } },
    select: {
      id: true,
      title: true,
      status: true,
      tasks: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  // Tasks that transitioned to "done" within the window
  const taskLogs = await prisma.auditLog.findMany({
    where: { entity: "Task", action: "update", occurredAt: { gte: windowStart } },
  })
  const completedInWindowIds = new Set<string>()
  for (const log of taskLogs) {
    const diff = log.diff as { after?: { status?: string } } | null
    if (diff?.after?.status === "done") completedInWindowIds.add(log.entityId)
  }

  const weeksInWindow = days / 7

  return {
    window: days,
    projects: projects.map(p => {
      const tasksTotal = p.tasks.length
      const tasksCompleted = p.tasks.filter(t => t.status === "done").length
      const completedInWindow = p.tasks.filter(t => completedInWindowIds.has(t.id)).length
      const weeklyRate =
        weeksInWindow > 0
          ? Math.round((completedInWindow / weeksInWindow) * 100) / 100
          : 0
      const remaining = tasksTotal - tasksCompleted
      const projectedCompletionDate =
        weeklyRate > 0
          ? new Date(Date.now() + (remaining / weeklyRate) * 7 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0]
          : null
      return {
        id: p.id,
        title: p.title,
        status: p.status,
        tasksTotal,
        tasksCompleted,
        completedInWindow,
        weeklyRate,
        projectedCompletionDate,
      }
    }),
  }
}

export async function getCompletionAnalytics(days: number) {
  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - days)

  const actionItemLogs = await prisma.auditLog.findMany({
    where: { entity: "ActionItem", action: "update", occurredAt: { gte: windowStart } },
    orderBy: { occurredAt: "asc" },
  })

  const completedLogs = actionItemLogs.filter(log => {
    const diff = log.diff as { after?: { status?: string } } | null
    return diff?.after?.status === "done"
  })

  const completedItemIds = [...new Set(completedLogs.map(l => l.entityId))]
  const completedItems =
    completedItemIds.length > 0
      ? await prisma.actionItem.findMany({
          where: { id: { in: completedItemIds } },
          select: { id: true, assignedTo: true },
        })
      : []

  const assigneeMap = new Map(completedItems.map(i => [i.id, i.assignedTo]))

  const overdueItems = await prisma.actionItem.findMany({
    where: { status: "todo", dueDate: { gte: windowStart, lt: new Date() } },
    select: { id: true, assignedTo: true },
  })

  const doneIan = completedItems.filter(i => i.assignedTo === "ian").length
  const doneHolly = completedItems.filter(i => i.assignedTo === "holly").length
  const overdueIan = overdueItems.filter(i => i.assignedTo === "ian").length
  const overdueHolly = overdueItems.filter(i => i.assignedTo === "holly").length
  const totalIan = doneIan + overdueIan
  const totalHolly = doneHolly + overdueHolly

  // 8 weeks, most recent first
  const byWeek = Array.from({ length: 8 }, (_, i) => {
    const weekEnd = new Date()
    weekEnd.setDate(weekEnd.getDate() - i * 7)
    weekEnd.setHours(23, 59, 59, 999)
    const weekStart = new Date(weekEnd)
    weekStart.setDate(weekStart.getDate() - 6)
    weekStart.setHours(0, 0, 0, 0)

    const weekLogs = completedLogs.filter(
      l => l.occurredAt >= weekStart && l.occurredAt <= weekEnd
    )
    return {
      weekStart: weekStart.toISOString().split("T")[0],
      ian: weekLogs.filter(l => assigneeMap.get(l.entityId) === "ian").length,
      holly: weekLogs.filter(l => assigneeMap.get(l.entityId) === "holly").length,
    }
  })

  return {
    window: days,
    rates: {
      ian: totalIan > 0 ? Math.round((doneIan / totalIan) * 100) / 100 : 0,
      holly: totalHolly > 0 ? Math.round((doneHolly / totalHolly) * 100) / 100 : 0,
    },
    byWeek,
  }
}
