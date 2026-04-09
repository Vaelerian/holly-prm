import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import type { CreateContactInput, UpdateContactInput } from "@/lib/validations/contact"

interface ListContactsOptions {
  q?: string
  type?: string
  overdue?: boolean
}

export async function listContacts(opts: ListContactsOptions) {
  const where: Record<string, unknown> = {}
  if (opts.q) where.name = { contains: opts.q, mode: "insensitive" }
  if (opts.type) where.type = opts.type
  if (opts.overdue) {
    where.healthScore = { lt: 100 }
    where.interactionFreqDays = { not: null }
  }
  return prisma.contact.findMany({ where, orderBy: { name: "asc" } })
}

export async function getContact(id: string) {
  return prisma.contact.findUnique({
    where: { id },
    include: { interactions: { orderBy: { occurredAt: "desc" }, take: 20 } },
  })
}

export async function createContact(data: CreateContactInput, actor: Actor) {
  const contact = await prisma.contact.create({ data })
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: contact.id, action: "create", actor },
  })
  return contact
}

export async function updateContact(id: string, data: UpdateContactInput, actor: Actor) {
  const before = await prisma.contact.findUnique({ where: { id } })
  const contact = await prisma.contact.update({ where: { id }, data })
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: id, action: "update", actor, diff: { before, after: contact } },
  })
  return contact
}

export async function deleteContact(id: string, actor: Actor) {
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: id, action: "delete", actor },
  })
  return prisma.contact.delete({ where: { id } })
}
