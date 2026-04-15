import { prisma } from "@/lib/db"
import type { CreateGoalInput, UpdateGoalInput } from "@/lib/validations/goal"

export async function listGoals(userId: string, roleId?: string) {
  const where: Record<string, unknown> = { userId }
  if (roleId) where.roleId = roleId

  return prisma.goal.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { projects: true, tasks: true } },
    },
  })
}

export async function getGoal(id: string, userId: string) {
  return prisma.goal.findFirst({
    where: { id, userId },
    include: {
      role: true,
      projects: { orderBy: { createdAt: "desc" } },
      tasks: {
        where: { projectId: null },
        orderBy: { createdAt: "asc" },
      },
    },
  })
}

export async function createGoal(data: CreateGoalInput, userId: string) {
  return prisma.goal.create({
    data: {
      ...data,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
      userId,
    },
  })
}

export async function updateGoal(id: string, data: UpdateGoalInput, userId: string) {
  const existing = await prisma.goal.findFirst({ where: { id, userId } })
  if (!existing) return null

  if (existing.isDefault && data.name !== undefined) {
    throw new Error("Cannot rename the default goal")
  }

  const updateData: Record<string, unknown> = { ...data }
  if (data.targetDate !== undefined) {
    updateData.targetDate = data.targetDate ? new Date(data.targetDate) : null
  }

  const updated = await prisma.goal.update({
    where: { id },
    data: updateData,
  })

  // If roleId changed, cascade to projects and tasks under this goal
  if (data.roleId && data.roleId !== existing.roleId) {
    await prisma.project.updateMany({
      where: { goalId: id },
      data: { roleId: data.roleId },
    })
    await prisma.task.updateMany({
      where: { goalId: id },
      data: { roleId: data.roleId },
    })
  }

  return updated
}

export async function deleteGoal(id: string, remapToGoalId: string, userId: string) {
  const existing = await prisma.goal.findFirst({ where: { id, userId } })
  if (!existing) return null

  if (existing.isDefault) {
    throw new Error("Cannot delete the default goal")
  }

  const targetGoal = await prisma.goal.findFirst({ where: { id: remapToGoalId, userId } })
  if (!targetGoal) {
    throw new Error("Target goal not found")
  }

  return prisma.$transaction(async (tx) => {
    await tx.project.updateMany({
      where: { goalId: id },
      data: { goalId: remapToGoalId, roleId: targetGoal.roleId },
    })
    await tx.task.updateMany({
      where: { goalId: id },
      data: { goalId: remapToGoalId, roleId: targetGoal.roleId },
    })
    return tx.goal.delete({ where: { id } })
  })
}

export async function completeGoal(id: string, userId: string) {
  const existing = await prisma.goal.findFirst({ where: { id, userId } })
  if (!existing) return null

  if (existing.goalType === "ongoing") {
    throw new Error("Cannot complete an ongoing goal")
  }

  return prisma.goal.update({
    where: { id },
    data: { status: "completed" },
  })
}

export async function getOrCreateDefaultGoal(userId: string) {
  // Ensure default role exists
  let role = await prisma.role.findFirst({
    where: { userId, isDefault: true },
  })
  if (!role) {
    role = await prisma.role.create({
      data: {
        name: "General",
        description: "Default role for uncategorised items",
        isDefault: true,
        userId,
      },
    })
  }

  // Ensure default goal exists
  const existingGoal = await prisma.goal.findFirst({
    where: { userId, isDefault: true },
  })
  if (existingGoal) return existingGoal

  return prisma.goal.create({
    data: {
      name: "Inbox",
      description: "Default goal for uncategorised items",
      goalType: "ongoing",
      isDefault: true,
      roleId: role.id,
      userId,
    },
  })
}
