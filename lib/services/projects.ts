import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import type { CreateProjectInput, UpdateProjectInput } from "@/lib/validations/project"

interface ListProjectsOptions {
  status?: string
}

export async function listProjects(opts: ListProjectsOptions) {
  const where: Record<string, unknown> = {}
  if (opts.status) where.status = opts.status
  return prisma.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { tasks: true } },
      tasks: { select: { status: true } },
    },
  })
}

export async function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: [{ isMilestone: "desc" }, { createdAt: "asc" }],
        include: { actionItems: { orderBy: { createdAt: "asc" } } },
      },
    },
  })
}

export async function createProject(data: CreateProjectInput, actor: Actor) {
  const project = await prisma.project.create({
    data: {
      ...data,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: project.id, action: "create", actor },
  })
  return project
}

export async function updateProject(id: string, data: UpdateProjectInput, actor: Actor) {
  const project = await prisma.project.update({
    where: { id },
    data: {
      ...data,
      targetDate: data.targetDate !== undefined ? (data.targetDate ? new Date(data.targetDate) : null) : undefined,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: id, action: "update", actor },
  })
  return project
}

export async function deleteProject(id: string, actor: Actor) {
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: id, action: "delete", actor },
  })
  return prisma.project.delete({ where: { id } })
}
