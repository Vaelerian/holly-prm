import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import { redis } from "@/lib/redis"

export async function getBriefing(userId: string) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)
  const fourteenDaysFromNow = new Date()
  fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14)
  const sevenDaysFromNow = new Date()
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
  sevenDaysFromNow.setHours(23, 59, 59, 999)
  const thirtyDaysFromNow = new Date()
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

  const [
    overdueContacts,
    pendingFollowUps,
    openActionItems,
    openProjectsCount,
    tasksDueTodayCount,
    upcomingMilestones,
    myActionItems,
    candidateContacts,
    recentInteractions,
    activeProjects,
    tasksThisWeek,
    goalsNearingTarget,
    taskStatusGroups,
  ] = await Promise.all([
    prisma.contact.findMany({
      where: { userId, interactionFreqDays: { not: null }, OR: [{ healthScore: { lt: 100 } }, { lastInteraction: null }] },
      orderBy: { healthScore: "asc" },
      take: 10,
    }),
    prisma.interaction.findMany({
      where: { userId, followUpRequired: true, followUpCompleted: false },
      orderBy: { followUpDate: "asc" },
      take: 20,
      include: { contact: { select: { id: true, name: true } } },
    }),
    prisma.actionItem.findMany({
      where: { userId, status: "todo" },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 20,
    }),
    prisma.project.count({
      where: { userId, status: { in: ["planning", "active"] } },
    }),
    prisma.task.count({
      where: {
        project: { OR: [{ userId }, { members: { some: { userId } } }] },
        dueDate: { gte: todayStart, lte: todayEnd },
        status: { notIn: ["done", "cancelled"] },
      },
    }),
    prisma.task.findMany({
      where: {
        project: { OR: [{ userId }, { members: { some: { userId } } }] },
        isMilestone: true,
        status: { notIn: ["done", "cancelled"] },
        dueDate: { gte: todayStart, lte: fourteenDaysFromNow },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { project: { select: { id: true, title: true } } },
    }),
    prisma.actionItem.findMany({
      where: { userId, assignedTo: Actor.ian, status: "todo" },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 10,
      include: {
        interaction: {
          select: { id: true, contact: { select: { id: true, name: true } } },
        },
        task: {
          select: { id: true, title: true, projectId: true },
        },
      },
    }),
    // Contacts with a frequency target and full health (not yet overdue), for candidate filtering
    prisma.contact.findMany({
      where: { userId, interactionFreqDays: { not: null }, healthScore: 100, lastInteraction: { not: null } },
      select: { id: true, name: true, lastInteraction: true, interactionFreqDays: true },
    }),
    // Last 5 interactions with full text
    prisma.interaction.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
      take: 5,
      include: { contact: { select: { id: true, name: true } } },
    }),
    // Active projects with task status breakdown
    prisma.project.findMany({
      where: { userId, status: { in: ["planning", "active"] } },
      select: {
        id: true,
        title: true,
        status: true,
        targetDate: true,
        tasks: { select: { status: true } },
      },
    }),
    // Tasks due in the next 7 days (excluding today's, which we already
    // surface separately)
    prisma.task.findMany({
      where: {
        project: { OR: [{ userId }, { members: { some: { userId } } }] },
        dueDate: { gt: todayEnd, lte: sevenDaysFromNow },
        status: { notIn: ["done", "cancelled"] },
      },
      orderBy: { dueDate: "asc" },
      take: 50,
      select: {
        id: true,
        title: true,
        dueDate: true,
        status: true,
        isMilestone: true,
        projectId: true,
      },
    }),
    // Completable goals with a target date within 30 days
    prisma.goal.findMany({
      where: {
        userId,
        goalType: "completable",
        status: "active",
        targetDate: { not: null, lte: thirtyDaysFromNow },
      },
      orderBy: { targetDate: "asc" },
      take: 10,
      select: {
        id: true,
        name: true,
        targetDate: true,
        role: { select: { name: true, colour: true } },
      },
    }),
    // Task status breakdown across the user's accessible tasks
    prisma.task.groupBy({
      by: ["status"],
      where: { project: { OR: [{ userId }, { members: { some: { userId } } }] } },
      _count: { _all: true },
    }),
  ])

  // Read Gmail cache (populated by cron)
  let recentEmails: unknown[] = []
  try {
    const cached = await redis.get("gmail:recent")
    if (cached) recentEmails = JSON.parse(cached)
  } catch {
    // Redis unavailable or invalid JSON - proceed with empty array
  }

  // Read vault sync cache (populated by cron)
  let vaultUpdates: unknown[] = []
  try {
    const vaultCached = await redis.get("vault:sync:latest")
    if (vaultCached) {
      const parsed = JSON.parse(vaultCached)
      vaultUpdates = parsed.updatedNotes ?? []
    }
  } catch {
    // Redis unavailable or invalid JSON - proceed with empty array
  }

  // Read scheduling alerts cache (populated by cron)
  let scheduleAlerts: unknown[] = []
  try {
    const cached = await redis.get(`schedule:results:${userId}`)
    if (cached) {
      const parsed = JSON.parse(cached)
      const alertTaskIds: string[] = parsed.alerts ?? []
      if (alertTaskIds.length > 0) {
        const alertTasks = await prisma.task.findMany({
          where: { id: { in: alertTaskIds } },
          select: { id: true, title: true, urgency: true, importance: true },
        })
        scheduleAlerts = alertTasks.map(t => ({
          taskId: t.id,
          title: t.title,
          reason: `Could not find a time slot (${t.urgency}, ${t.importance})`,
        }))
      }
    }
  } catch {
    // proceed with empty
  }

  const now = new Date()
  const followUpCandidates = candidateContacts.filter(c => {
    const daysSince = (now.getTime() - c.lastInteraction!.getTime()) / (1000 * 60 * 60 * 24)
    return daysSince > c.interactionFreqDays! * 0.8
  })

  const projectHealth = activeProjects
    .map(p => ({
      id: p.id,
      title: p.title,
      status: p.status,
      targetDate: p.targetDate,
      tasksTotal: p.tasks.length,
      tasksCompleted: p.tasks.filter(t => t.status === "done").length,
      percentComplete:
        p.tasks.length > 0
          ? Math.round((p.tasks.filter(t => t.status === "done").length / p.tasks.length) * 100)
          : 0,
    }))
    // Most-progressed (or earliest-due) first so the dashboard surfaces the
    // projects closest to closing out at the top.
    .sort((a, b) => b.percentComplete - a.percentComplete)

  const goalsNearingCompletion = goalsNearingTarget.map(g => {
    const days = Math.ceil((g.targetDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return {
      id: g.id,
      name: g.name,
      targetDate: g.targetDate,
      daysRemaining: days,
      role: g.role,
    }
  })

  // Normalise the groupBy result into a fixed shape so the UI does not have
  // to handle missing keys.
  const taskMix = {
    todo: 0,
    in_progress: 0,
    done: 0,
    blocked: 0,
    cancelled: 0,
  } as Record<string, number>
  for (const row of taskStatusGroups) {
    if (row.status in taskMix) taskMix[row.status] = row._count._all
  }
  const taskTotal = Object.values(taskMix).reduce((a, b) => a + b, 0)

  return {
    overdueContacts,
    pendingFollowUps,
    openActionItems,
    openProjectsCount,
    tasksDueTodayCount,
    tasksThisWeek,
    upcomingMilestones,
    myActionItems,
    followUpCandidates,
    recentInteractions,
    projectHealth,
    goalsNearingCompletion,
    taskMix,
    taskTotal,
    recentEmails,
    vaultUpdates,
    scheduleAlerts,
    generatedAt: new Date(),
  }
}
