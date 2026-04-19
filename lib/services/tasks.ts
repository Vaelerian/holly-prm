import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/services/calendar-sync"
import { getOrCreateDefaultGoal } from "@/lib/services/goals"
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validations/task"

interface ListTasksOptions {
  projectId?: string
  roleId?: string
  goalId?: string
  status?: string
  assignedTo?: string
  milestoneOnly?: boolean
  includeSlot?: boolean
  userId: string
}

export async function listTasks(opts: ListTasksOptions) {
  const where: Record<string, unknown> = {}

  if (opts.projectId) {
    // When filtering by project, use project-based access control
    where.projectId = opts.projectId
    where.project = {
      OR: [
        { userId: opts.userId },
        { members: { some: { userId: opts.userId } } },
        { visibility: "shared" },
      ],
    }
  } else {
    // Tasks can belong to a project OR be directly under a goal
    where.OR = [
      { project: { OR: [{ userId: opts.userId }, { members: { some: { userId: opts.userId } } }, { visibility: "shared" }] } },
      { projectId: null, goal: { userId: opts.userId } },
    ]
  }

  if (opts.roleId) where.roleId = opts.roleId
  if (opts.goalId) where.goalId = opts.goalId
  if (opts.status) where.status = opts.status
  if (opts.assignedTo) where.assignedTo = opts.assignedTo
  if (opts.milestoneOnly) where.isMilestone = true

  return prisma.task.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      project: { select: { id: true, title: true } },
      goal: { select: { id: true, name: true } },
      role: { select: { id: true, name: true, colour: true } },
      actionItems: { orderBy: { createdAt: "asc" as const } },
      assignedToUser: { select: { id: true, name: true } },
      ...(opts.includeSlot ? {
        timeSlot: { select: { id: true, date: true, startMinutes: true, endMinutes: true, title: true } },
      } : {}),
    },
  })
}

export async function getTask(id: string, userId: string) {
  return prisma.task.findFirst({
    where: {
      id,
      OR: [
        { project: { OR: [{ userId }, { members: { some: { userId } } }, { visibility: "shared" }] } },
        { projectId: null, goal: { userId } },
      ],
    },
    include: {
      project: { select: { id: true, title: true } },
      goal: { select: { id: true, name: true } },
      role: { select: { id: true, name: true } },
      actionItems: { orderBy: { createdAt: "asc" } },
      assignedToUser: { select: { id: true, name: true } },
    },
  })
}

export async function createTask(data: CreateTaskInput, actor: Actor, userId: string) {
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

  // Verify project access when projectId is provided
  if (data.projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: data.projectId,
        OR: [{ userId }, { members: { some: { userId } } }, { visibility: "shared" }],
      },
    })
    if (!project) return null

    // Validate that the project's goal matches the task's goal
    if (project.goalId && project.goalId !== goalId) {
      return null
    }
  }

  const { goalId: _goalId, ...rest } = data
  const task = await prisma.task.create({
    data: {
      ...rest,
      projectId: data.projectId || null,
      goalId,
      roleId,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Task", entityId: task.id, action: "create", actor, userId },
  })
  if (task.dueDate) {
    void upsertCalendarEvent("task", task.id, { title: task.title, date: task.dueDate }, userId)
  }
  return task
}

export async function updateTask(id: string, data: UpdateTaskInput, actor: Actor, userId: string) {
  const existing = await prisma.task.findFirst({
    where: {
      id,
      OR: [
        { project: { OR: [{ userId }, { members: { some: { userId } } }, { visibility: "shared" }] } },
        { projectId: null, goal: { userId } },
      ],
    },
  })
  if (!existing) return null

  // If goalId is changing, derive new roleId
  const updateData: Record<string, unknown> = {
    ...data,
    dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
  }

  if (data.goalId && data.goalId !== existing.goalId) {
    const goal = await prisma.goal.findFirst({ where: { id: data.goalId, userId } })
    if (!goal) return null
    updateData.roleId = goal.roleId

    // If task has a project, validate the goal matches
    if (existing.projectId) {
      const project = await prisma.project.findFirst({ where: { id: existing.projectId } })
      if (project && project.goalId && project.goalId !== data.goalId) {
        return null
      }
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data: updateData,
  })
  await prisma.auditLog.create({
    data: { entity: "Task", entityId: id, action: "update", actor, userId, diff: { before: existing, after: task } },
  })
  if (task.dueDate) {
    void upsertCalendarEvent("task", task.id, { title: task.title, date: task.dueDate }, userId)
  } else if (data.dueDate === null) {
    void deleteCalendarEvent("task", task.id, userId)
  }
  return task
}

export async function deleteTask(id: string, actor: Actor, userId: string) {
  // Owner can delete: project owner, member, shared project, or goal owner when no project
  const existing = await prisma.task.findFirst({
    where: {
      id,
      OR: [
        { project: { OR: [{ userId }, { members: { some: { userId } } }, { visibility: "shared" }] } },
        { projectId: null, goal: { userId } },
      ],
    },
  })
  if (!existing) return null

  await prisma.auditLog.create({
    data: { entity: "Task", entityId: id, action: "delete", actor, userId },
  })
  void deleteCalendarEvent("task", id, userId)
  return prisma.task.delete({ where: { id } })
}
