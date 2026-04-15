import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/services/calendar-sync"
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validations/task"

interface ListTasksOptions {
  projectId?: string
  status?: string
  assignedTo?: string
  milestoneOnly?: boolean
  userId: string
}

export async function listTasks(opts: ListTasksOptions) {
  const where: Record<string, unknown> = {
    project: {
      OR: [
        { userId: opts.userId },
        { members: { some: { userId: opts.userId } } },
      ],
    },
  }
  if (opts.projectId) where.projectId = opts.projectId
  if (opts.status) where.status = opts.status
  if (opts.assignedTo) where.assignedTo = opts.assignedTo
  if (opts.milestoneOnly) where.isMilestone = true
  return prisma.task.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: { project: { select: { id: true, title: true } } },
  })
}

export async function getTask(id: string, userId: string) {
  return prisma.task.findFirst({
    where: {
      id,
      project: {
        OR: [
          { userId },
          { members: { some: { userId } } },
        ],
      },
    },
    include: {
      project: { select: { id: true, title: true } },
      actionItems: { orderBy: { createdAt: "asc" } },
    },
  })
}

export async function createTask(data: CreateTaskInput, actor: Actor, userId: string) {
  // Verify project access when projectId is provided (owner or member can add tasks)
  if (data.projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: data.projectId,
        OR: [{ userId }, { members: { some: { userId } } }],
      },
    })
    if (!project) return null
  }

  const task = await prisma.task.create({
    data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : null },
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
      project: { OR: [{ userId }, { members: { some: { userId } } }] },
    },
  })
  if (!existing) return null

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...data,
      dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
    },
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
  // Only the project owner can delete tasks
  const existing = await prisma.task.findFirst({
    where: { id, project: { userId } },
  })
  if (!existing) return null

  await prisma.auditLog.create({
    data: { entity: "Task", entityId: id, action: "delete", actor, userId },
  })
  void deleteCalendarEvent("task", id, userId)
  return prisma.task.delete({ where: { id } })
}
