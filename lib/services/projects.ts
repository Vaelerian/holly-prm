import { prisma } from "@/lib/db"
import { Actor, ProjectStatus } from "@/app/generated/prisma/client"
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/services/calendar-sync"
import { getOrCreateDefaultGoal } from "@/lib/services/goals"
import type { CreateProjectInput, UpdateProjectInput } from "@/lib/validations/project"

interface ListProjectsOptions {
  status?: string
  roleId?: string
  goalId?: string
  userId: string
}

export async function listProjects(opts: ListProjectsOptions) {
  const where: Record<string, unknown> = {
    OR: [
      { userId: opts.userId },
      { members: { some: { userId: opts.userId } } },
    ],
  }
  if (opts.status) where.status = opts.status as ProjectStatus
  if (opts.roleId) where.roleId = opts.roleId
  if (opts.goalId) where.goalId = opts.goalId

  return prisma.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { tasks: true } },
      tasks: { select: { status: true, isMilestone: true } },
      goal: { select: { id: true, name: true } },
      role: { select: { id: true, name: true } },
    },
  })
}

export async function getProject(id: string, userId: string) {
  return prisma.project.findFirst({
    where: {
      id,
      OR: [
        { userId },
        { members: { some: { userId } } },
      ],
    },
    include: {
      tasks: {
        orderBy: [{ isMilestone: "desc" }, { createdAt: "asc" }],
        include: { actionItems: { orderBy: { createdAt: "asc" } } },
      },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      goal: { select: { id: true, name: true } },
      role: { select: { id: true, name: true } },
    },
  })
}

export async function createProject(data: CreateProjectInput, actor: Actor, userId: string) {
  // Determine goalId - use provided or fall back to default
  let goalId = data.goalId
  if (!goalId) {
    const defaultGoal = await getOrCreateDefaultGoal(userId)
    goalId = defaultGoal.id
  }

  // Look up the goal to derive roleId
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } })
  if (!goal) return null
  const roleId = goal.roleId

  const { goalId: _goalId, ...rest } = data
  const project = await prisma.project.create({
    data: {
      ...rest,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
      goalId,
      roleId,
      userId,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: project.id, action: "create", actor, userId },
  })
  if (project.targetDate) {
    void upsertCalendarEvent("project", project.id, { title: project.title, date: project.targetDate }, userId)
  }
  return project
}

export async function updateProject(id: string, data: UpdateProjectInput, actor: Actor, userId: string) {
  const existing = await prisma.project.findFirst({ where: { id, userId } })
  if (!existing) return null
  const before = existing

  const updateData: Record<string, unknown> = {
    ...data,
    targetDate: data.targetDate !== undefined ? (data.targetDate ? new Date(data.targetDate) : null) : undefined,
  }

  // If goalId is changing, derive new roleId
  let newGoalId: string | undefined
  let newRoleId: string | undefined
  if (data.goalId && data.goalId !== existing.goalId) {
    const goal = await prisma.goal.findFirst({ where: { id: data.goalId, userId } })
    if (!goal) return null
    newGoalId = goal.id
    newRoleId = goal.roleId
    updateData.roleId = newRoleId
  }

  const project = await prisma.project.update({
    where: { id, userId },
    data: updateData,
  })
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: id, action: "update", actor, userId, diff: { before, after: project } },
  })

  // Cascade goalId and roleId to child tasks when goal changes
  if (newGoalId && newRoleId) {
    await prisma.task.updateMany({
      where: { projectId: id },
      data: { goalId: newGoalId, roleId: newRoleId },
    })
  }

  if (project.targetDate) {
    void upsertCalendarEvent("project", project.id, { title: project.title, date: project.targetDate }, userId)
  } else if (data.targetDate === null) {
    void deleteCalendarEvent("project", project.id, userId)
  }
  return project
}

export async function deleteProject(id: string, actor: Actor, userId: string) {
  const existing = await prisma.project.findFirst({ where: { id, userId } })
  if (!existing) return null
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: id, action: "delete", actor, userId },
  })
  void deleteCalendarEvent("project", id, userId)
  return prisma.project.delete({ where: { id, userId } })
}
