import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import type { CreateContactInput, UpdateContactInput } from "@/lib/validations/contact"

interface ListContactsOptions {
  q?: string
  type?: string
  overdue?: boolean
  userId: string
}

export async function listContacts(opts: ListContactsOptions) {
  const where: Record<string, unknown> = { userId: opts.userId }
  if (opts.q) where.name = { contains: opts.q, mode: "insensitive" }
  if (opts.type) where.type = opts.type
  if (opts.overdue) {
    where.interactionFreqDays = { not: null }
    where.OR = [{ healthScore: { lt: 100 } }, { lastInteraction: null }]
  }
  return prisma.contact.findMany({ where, orderBy: { name: "asc" } })
}

export async function getContact(id: string, userId: string) {
  return prisma.contact.findFirst({
    where: { id, userId },
    include: {
      interactions: {
        orderBy: { occurredAt: "desc" },
        take: 20,
        include: { actionItems: { orderBy: { createdAt: "asc" } } },
      },
    },
  })
}

export async function createContact(data: CreateContactInput, actor: Actor, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contact = await prisma.contact.create({ data: { ...(data as any), userId } })
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: contact.id, action: "create", actor, userId },
  })
  return contact
}

export async function updateContact(id: string, data: UpdateContactInput, actor: Actor, userId: string) {
  const existing = await prisma.contact.findFirst({ where: { id, userId } })
  if (!existing) return null
  const before = existing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contact = await prisma.contact.update({ where: { id, userId }, data: data as any })
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: id, action: "update", actor, userId, diff: { before, after: contact } },
  })
  return contact
}

export async function deleteContact(id: string, actor: Actor, userId: string) {
  const existing = await prisma.contact.findFirst({ where: { id, userId } })
  if (!existing) return null
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: id, action: "delete", actor, userId },
  })
  return prisma.contact.delete({ where: { id, userId } })
}
