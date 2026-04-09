import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import type { CreateActionItemInput, UpdateActionItemInput } from "@/lib/validations/action-item"

export async function listActionItems(opts: { assignedTo?: Actor; status?: string } = {}) {
  const where: Record<string, unknown> = {}
  if (opts.assignedTo) where.assignedTo = opts.assignedTo
  if (opts.status) where.status = opts.status
  return prisma.actionItem.findMany({ where, orderBy: [{ priority: "desc" }, { dueDate: "asc" }] })
}

export async function createActionItem(data: CreateActionItemInput, actor: Actor) {
  const item = await prisma.actionItem.create({
    data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : null },
  })
  await prisma.auditLog.create({
    data: { entity: "ActionItem", entityId: item.id, action: "create", actor },
  })
  return item
}

export async function updateActionItemStatus(id: string, data: UpdateActionItemInput, actor: Actor) {
  const item = await prisma.actionItem.update({ where: { id }, data })
  await prisma.auditLog.create({
    data: { entity: "ActionItem", entityId: id, action: "update", actor },
  })
  return item
}
