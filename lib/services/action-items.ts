import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import { publishSseEvent } from "@/lib/sse-events"
import { upsertCalendarEvent } from "@/lib/services/calendar-sync"
import type { CreateActionItemInput, UpdateActionItemInput } from "@/lib/validations/action-item"

export async function listActionItems(opts: { assignedTo?: Actor; status?: string; userId: string }) {
  const where: Record<string, unknown> = { userId: opts.userId }
  if (opts.assignedTo) where.assignedTo = opts.assignedTo
  if (opts.status) where.status = opts.status
  return prisma.actionItem.findMany({ where, orderBy: [{ priority: "desc" }, { dueDate: "asc" }] })
}

export async function getActionItem(id: string, userId: string) {
  return prisma.actionItem.findFirst({ where: { id, userId } })
}

export async function createActionItem(data: CreateActionItemInput, actor: Actor, userId: string) {
  const item = await prisma.actionItem.create({
    data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : null, userId },
  })
  await prisma.auditLog.create({
    data: { entity: "ActionItem", entityId: item.id, action: "create", actor, userId },
  })
  await publishSseEvent("action_item.created", {
    id: item.id,
    title: item.title,
    assignedTo: item.assignedTo,
    priority: item.priority,
    dueDate: item.dueDate ? item.dueDate.toISOString() : null,
  })
  if (item.dueDate) {
    void upsertCalendarEvent("action_item", item.id, { title: item.title, date: item.dueDate })
  }
  return item
}

export async function updateActionItem(id: string, data: UpdateActionItemInput, actor: Actor, userId: string) {
  const existing = await prisma.actionItem.findFirst({ where: { id, userId } })
  if (!existing) return null
  const before = existing
  const item = await prisma.actionItem.update({ where: { id }, data: { ...data, userId } })
  await prisma.auditLog.create({
    data: { entity: "ActionItem", entityId: id, action: "update", actor, userId, diff: { before, after: item } },
  })
  if (data.status === "done" && before?.status !== "done") {
    await publishSseEvent("action_item.completed", {
      id: item.id,
      title: item.title,
      assignedTo: item.assignedTo,
    })
  }
  return item
}

export async function deleteActionItem(id: string, actor: Actor, userId: string) {
  const existing = await prisma.actionItem.findFirst({ where: { id, userId } })
  if (!existing) return null
  await prisma.auditLog.create({
    data: { entity: "ActionItem", entityId: id, action: "delete", actor, userId },
  })
  return prisma.actionItem.delete({ where: { id } })
}

// Kept for backward compatibility — delegates to updateActionItem
export async function updateActionItemStatus(id: string, data: UpdateActionItemInput, actor: Actor, userId: string) {
  return updateActionItem(id, data, actor, userId)
}
