import { prisma } from "@/lib/db"

export async function getBriefing() {
  const [overdueContacts, pendingFollowUps, openActionItems] = await Promise.all([
    prisma.contact.findMany({
      where: { interactionFreqDays: { not: null }, OR: [{ healthScore: { lt: 100 } }, { lastInteraction: null }] },
      orderBy: { healthScore: "asc" },
      take: 10,
    }),
    prisma.interaction.findMany({
      where: { followUpRequired: true, followUpCompleted: false },
      orderBy: { followUpDate: "asc" },
      take: 20,
      include: { contact: { select: { id: true, name: true } } },
    }),
    prisma.actionItem.findMany({
      where: { status: "todo" },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 20,
    }),
  ])

  return { overdueContacts, pendingFollowUps, openActionItems, generatedAt: new Date() }
}
