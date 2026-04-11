import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import { computeHealthScore } from "@/lib/health-score"
import { publishSseEvent } from "@/lib/sse-events"
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/services/calendar-sync"
import type { CreateInteractionInput, UpdateInteractionInput } from "@/lib/validations/interaction"

interface ListInteractionsOptions {
  contactId?: string
  followUpRequired?: boolean
  limit?: number
  userId: string
}

export async function listInteractions(opts: ListInteractionsOptions) {
  const where: Record<string, unknown> = { userId: opts.userId }
  if (opts.contactId) where.contactId = opts.contactId
  if (opts.followUpRequired) {
    where.followUpRequired = true
    where.followUpCompleted = false
  }
  return prisma.interaction.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take: opts.limit ?? 50,
    include: { contact: { select: { id: true, name: true } } },
  })
}

export async function getInteraction(id: string, userId: string) {
  return prisma.interaction.findFirst({ where: { id, userId }, include: { actionItems: true } })
}

export async function createInteraction(data: CreateInteractionInput, actor: Actor, userId: string) {
  const interaction = await prisma.interaction.create({
    data: {
      ...data,
      userId,
      occurredAt: new Date(data.occurredAt),
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
      createdByHolly: actor === "holly",
    },
    include: { contact: { select: { id: true, name: true } } },
  })

  const contact = await prisma.contact.findUnique({
    where: { id: data.contactId },
    select: { interactionFreqDays: true },
  })
  const healthScore = computeHealthScore(interaction.occurredAt, contact?.interactionFreqDays ?? null)
  await prisma.contact.update({
    where: { id: data.contactId },
    data: { lastInteraction: interaction.occurredAt, healthScore },
  })

  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: interaction.id, action: "create", actor, userId },
  })

  await publishSseEvent("interaction.created", {
    contactId: data.contactId,
    contactName: interaction.contact?.name ?? "",
    type: data.type,
    summary: data.summary,
    createdByHolly: actor === "holly",
  })

  return interaction
}

export async function updateInteraction(id: string, data: UpdateInteractionInput, actor: Actor, userId: string) {
  const existing = await prisma.interaction.findFirst({ where: { id, userId } })
  if (!existing) return null
  const interaction = await prisma.interaction.update({ where: { id, userId }, data })
  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: id, action: "update", actor, userId },
  })
  if (interaction.followUpDate) {
    const contact = await prisma.contact.findUnique({ where: { id: interaction.contactId }, select: { name: true } })
    void upsertCalendarEvent("follow_up", id, {
      title: `Follow-up: ${contact?.name ?? "Contact"}`,
      date: interaction.followUpDate,
    }, userId)
  } else if (data.followUpDate === null) {
    void deleteCalendarEvent("follow_up", id, userId)
  }
  return interaction
}

export async function deleteInteraction(id: string, actor: Actor, userId: string) {
  const existing = await prisma.interaction.findFirst({ where: { id, userId } })
  if (!existing) return null
  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: id, action: "delete", actor, userId },
  })
  return prisma.interaction.delete({ where: { id, userId } })
}
