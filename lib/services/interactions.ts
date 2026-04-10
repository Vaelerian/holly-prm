import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import { computeHealthScore } from "@/lib/health-score"
import { publishSseEvent } from "@/lib/sse-events"
import type { CreateInteractionInput, UpdateInteractionInput } from "@/lib/validations/interaction"

interface ListInteractionsOptions {
  contactId?: string
  followUpRequired?: boolean
  limit?: number
}

export async function listInteractions(opts: ListInteractionsOptions) {
  const where: Record<string, unknown> = {}
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

export async function getInteraction(id: string) {
  return prisma.interaction.findUnique({ where: { id }, include: { actionItems: true } })
}

export async function createInteraction(data: CreateInteractionInput, actor: Actor) {
  const interaction = await prisma.interaction.create({
    data: {
      ...data,
      occurredAt: new Date(data.occurredAt),
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
      createdByHolly: actor === "holly",
    },
    include: { contact: { select: { id: true, name: true } } },
  })

  const contact = await prisma.contact.findUnique({
    where: { id: data.contactId },
    select: { interactionFreqDays: true, name: true },
  })
  const healthScore = computeHealthScore(interaction.occurredAt, contact?.interactionFreqDays ?? null)
  await prisma.contact.update({
    where: { id: data.contactId },
    data: { lastInteraction: interaction.occurredAt, healthScore },
  })

  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: interaction.id, action: "create", actor },
  })

  await publishSseEvent("interaction.created", {
    contactId: data.contactId,
    contactName: contact?.name ?? "",
    type: data.type,
    summary: data.summary,
    createdByHolly: actor === "holly",
  })

  return interaction
}

export async function updateInteraction(id: string, data: UpdateInteractionInput, actor: Actor) {
  const interaction = await prisma.interaction.update({ where: { id }, data })
  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: id, action: "update", actor },
  })
  return interaction
}

export async function deleteInteraction(id: string, actor: Actor) {
  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: id, action: "delete", actor },
  })
  return prisma.interaction.delete({ where: { id } })
}
