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
        tasks: { select: { status: true } },
      },
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

  const now = new Date()
  const followUpCandidates = candidateContacts.filter(c => {
    const daysSince = (now.getTime() - c.lastInteraction!.getTime()) / (1000 * 60 * 60 * 24)
    return daysSince > c.interactionFreqDays! * 0.8
  })

  const projectHealth = activeProjects.map(p => ({
    id: p.id,
    title: p.title,
    status: p.status,
    tasksTotal: p.tasks.length,
    tasksCompleted: p.tasks.filter(t => t.status === "done").length,
    percentComplete:
      p.tasks.length > 0
        ? Math.round((p.tasks.filter(t => t.status === "done").length / p.tasks.length) * 100)
        : 0,
  }))

  return {
    overdueContacts,
    pendingFollowUps,
    openActionItems,
    openProjectsCount,
    tasksDueTodayCount,
    upcomingMilestones,
    myActionItems,
    followUpCandidates,
    recentInteractions,
    projectHealth,
    recentEmails,
    vaultUpdates,
    generatedAt: new Date(),
  }
}
