import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import { publishSseEvent } from "@/lib/sse-events"
import { upsertCalendarEvent } from "@/lib/services/calendar-sync"
import { startOfWeekMonday } from "@/lib/week"
import type { CreateActionItemInput, UpdateActionItemInput } from "@/lib/validations/action-item"

export async function listActionItems(opts: { assignedTo?: Actor; status?: string; userId: string; completed?: boolean }) {
  const where: Record<string, unknown> = { userId: opts.userId }
  if (opts.assignedTo) where.assignedTo = opts.assignedTo
  if (opts.status) where.status = opts.status
  // Hide actions completed before this week so the active list stays tidy;
  // pass completed: true to drive the Completed page in the opposite mode.
  if (opts.completed) {
    where.completedAt = { not: null }
  } else {
    where.OR = [{ completedAt: null }, { completedAt: { gte: startOfWeekMonday() } }]
  }
  return prisma.actionItem.findMany({
    where,
    orderBy: opts.completed
      ? [{ completedAt: "desc" }]
      : [{ priority: "desc" }, { dueDate: "asc" }],
  })
}

export async function getActionItem(id: string, userId: string) {
  return prisma.actionItem.findFirst({
    where: { id, userId },
    include: {
      interaction: { select: { id: true, contactId: true, contact: { select: { id: true, name: true } } } },
      task: { select: { id: true, title: true, projectId: true } },
    },
  })
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
    void upsertCalendarEvent("action_item", item.id, { title: item.title, date: item.dueDate }, userId)
  }
  return item
}

export async function updateActionItem(id: string, data: UpdateActionItemInput, actor: Actor, userId: string) {
  const existing = await prisma.actionItem.findFirst({ where: { id, userId } })
  if (!existing) return null
  const before = existing
  const updateData: Record<string, unknown> = { ...data }
  if (data.status !== undefined && data.status !== existing.status) {
    if (data.status === "done") {
      updateData.completedAt = new Date()
    } else if (existing.status === "done") {
      updateData.completedAt = null
    }
  }
  const item = await prisma.actionItem.update({ where: { id, userId }, data: updateData })
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
  return prisma.actionItem.delete({ where: { id, userId } })
}

// Kept for backward compatibility — delegates to updateActionItem
export async function updateActionItemStatus(id: string, data: UpdateActionItemInput, actor: Actor, userId: string) {
  return updateActionItem(id, data, actor, userId)
}
