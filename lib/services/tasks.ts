import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validations/task"

interface ListTasksOptions {
  projectId?: string
  status?: string
  assignedTo?: string
  milestoneOnly?: boolean
}

export async function listTasks(opts: ListTasksOptions) {
  const where: Record<string, unknown> = {}
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

export async function getTask(id: string) {
  return prisma.task.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, title: true } },
      actionItems: { orderBy: { createdAt: "asc" } },
    },
  })
}

export async function createTask(data: CreateTaskInput, actor: Actor) {
  const task = await prisma.task.create({
    data: {
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Task", entityId: task.id, action: "create", actor },
  })
  return task
}

export async function updateTask(id: string, data: UpdateTaskInput, actor: Actor) {
  const before = await prisma.task.findUnique({ where: { id } })
  const task = await prisma.task.update({
    where: { id },
    data: {
      ...data,
      dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Task", entityId: id, action: "update", actor, diff: { before, after: task } },
  })
  return task
}

export async function deleteTask(id: string, actor: Actor) {
  await prisma.auditLog.create({
    data: { entity: "Task", entityId: id, action: "delete", actor },
  })
  return prisma.task.delete({ where: { id } })
}
