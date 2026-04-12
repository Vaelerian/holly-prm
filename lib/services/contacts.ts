import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import type { CreateContactInput, UpdateContactInput } from "@/lib/validations/contact"

interface ListContactsOptions {
  q?: string
  type?: string
  overdue?: boolean
  userId: string
}

export function contactAccessWhere(userId: string) {
  return {
    OR: [
      { userId },
      { user: { grantedAccess: { some: { granteeId: userId } } } },
      { shares: { some: { userId } } },
      { project: { OR: [{ userId }, { members: { some: { userId } } }] } },
    ],
  }
}

export function isContactOwner(contactUserId: string | null, userId: string): boolean {
  return contactUserId === userId
}

export async function listContacts(opts: ListContactsOptions) {
  const accessClause = contactAccessWhere(opts.userId)
  const filters: object[] = [accessClause]
  if (opts.q) filters.push({ name: { contains: opts.q, mode: "insensitive" } })
  if (opts.type) filters.push({ type: opts.type })
  if (opts.overdue) {
    filters.push({ interactionFreqDays: { not: null } })
    filters.push({ OR: [{ healthScore: { lt: 100 } }, { lastInteraction: null }] })
  }
  return prisma.contact.findMany({
    where: filters.length === 1 ? accessClause : { AND: filters },
    orderBy: { name: "asc" },
    include: { user: { select: { id: true, name: true } } },
  })
}

export async function getContact(id: string, userId: string) {
  return prisma.contact.findFirst({
    where: { AND: [{ id }, contactAccessWhere(userId)] },
    include: {
      user: { select: { id: true, name: true } },
      interactions: {
        orderBy: { occurredAt: "desc" },
        take: 20,
        include: {
          actionItems: { orderBy: { createdAt: "asc" } },
          createdByUser: { select: { name: true } },
        },
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
