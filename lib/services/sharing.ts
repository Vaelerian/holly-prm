import { prisma } from "@/lib/db"

export async function listAccessGrants() {
  return prisma.userAccessGrant.findMany({
    include: {
      grantor: { select: { name: true, email: true } },
      grantee: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function createAccessGrant(grantorEmail: string, granteeEmail: string) {
  const grantor = await prisma.user.findUnique({ where: { email: grantorEmail } })
  if (!grantor) return null
  const grantee = await prisma.user.findUnique({ where: { email: granteeEmail } })
  if (!grantee) return null
  return prisma.userAccessGrant.create({ data: { grantorId: grantor.id, granteeId: grantee.id } })
}

export async function deleteAccessGrant(id: string): Promise<boolean> {
  const existing = await prisma.userAccessGrant.findUnique({ where: { id } })
  if (!existing) return false
  await prisma.userAccessGrant.delete({ where: { id } })
  return true
}

export async function listContactShares(contactId: string, ownerId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId: ownerId } })
  if (!contact) return null
  return prisma.contactShare.findMany({
    where: { contactId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  })
}

export async function createContactShare(
  contactId: string,
  email: string,
  ownerId: string
): Promise<{ id: string; contactId: string; userId: string } | null | "user_not_found"> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId: ownerId } })
  if (!contact) return null
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return "user_not_found"
  return prisma.contactShare.create({ data: { contactId, userId: user.id } })
}

export async function deleteContactShare(
  contactId: string,
  sharedUserId: string,
  ownerId: string
): Promise<boolean> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId: ownerId } })
  if (!contact) return false
  const share = await prisma.contactShare.findUnique({ where: { contactId_userId: { contactId, userId: sharedUserId } } })
  if (!share) return false
  await prisma.contactShare.delete({ where: { contactId_userId: { contactId, userId: sharedUserId } } })
  return true
}
