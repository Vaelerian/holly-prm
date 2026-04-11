import { prisma } from "@/lib/db"
import { Actor, ProjectStatus } from "@/app/generated/prisma/client"
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/services/calendar-sync"
import type { CreateProjectInput, UpdateProjectInput } from "@/lib/validations/project"

interface ListProjectsOptions {
  status?: string
  userId: string
}

export async function listProjects(opts: ListProjectsOptions) {
  const statusWhere = opts.status ? { status: opts.status as ProjectStatus } : {}
  return prisma.project.findMany({
    where: {
      ...statusWhere,
      OR: [
        { userId: opts.userId },
        { members: { some: { userId: opts.userId } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { tasks: true } },
      tasks: { select: { status: true, isMilestone: true } },
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
    },
  })
}

export async function createProject(data: CreateProjectInput, actor: Actor, userId: string) {
  const project = await prisma.project.create({
    data: {
      ...data,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
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
  const project = await prisma.project.update({
    where: { id, userId },
    data: {
      ...data,
      targetDate: data.targetDate !== undefined ? (data.targetDate ? new Date(data.targetDate) : null) : undefined,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: id, action: "update", actor, userId, diff: { before, after: project } },
  })
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
