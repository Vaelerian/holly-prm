import { prisma } from "@/lib/db"
import type { CreateRoleInput, UpdateRoleInput } from "@/lib/validations/role"

export async function listRoles(userId: string) {
  return prisma.role.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { goals: true } },
    },
  })
}

export async function getRole(id: string, userId: string) {
  return prisma.role.findFirst({
    where: { id, userId },
    include: {
      goals: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
    },
  })
}

export async function createRole(data: CreateRoleInput, userId: string) {
  return prisma.role.create({
    data: { ...data, userId },
  })
}

export async function updateRole(id: string, data: UpdateRoleInput, userId: string) {
  const existing = await prisma.role.findFirst({ where: { id, userId } })
  if (!existing) return null

  if (existing.isDefault && data.name !== undefined) {
    throw new Error("Cannot rename the default role")
  }

  return prisma.role.update({
    where: { id },
    data,
  })
}

export async function deleteRole(id: string, remapToRoleId: string, userId: string) {
  const existing = await prisma.role.findFirst({ where: { id, userId } })
  if (!existing) return null

  if (existing.isDefault) {
    throw new Error("Cannot delete the default role")
  }

  return prisma.$transaction(async (tx) => {
    await tx.goal.updateMany({
      where: { roleId: id },
      data: { roleId: remapToRoleId },
    })
    await tx.project.updateMany({
      where: { roleId: id },
      data: { roleId: remapToRoleId },
    })
    await tx.task.updateMany({
      where: { roleId: id },
      data: { roleId: remapToRoleId },
    })
    return tx.role.delete({ where: { id } })
  })
}

export async function getOrCreateDefaultRole(userId: string) {
  const existing = await prisma.role.findFirst({
    where: { userId, isDefault: true },
  })
  if (existing) return existing

  const role = await prisma.role.create({
    data: {
      name: "General",
      description: "Default role for uncategorised items",
      isDefault: true,
      userId,
    },
  })

  await prisma.goal.create({
    data: {
      name: "Inbox",
      description: "Default goal for uncategorised items",
      goalType: "ongoing",
      isDefault: true,
      roleId: role.id,
      userId,
    },
  })

  return role
}
