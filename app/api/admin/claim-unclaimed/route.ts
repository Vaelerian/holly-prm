import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const Schema = z.object({ userId: z.string().min(1) })

export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 403 })
  }

  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 422 })
  }
  const { userId } = parsed.data

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.status !== "approved") {
    return NextResponse.json({ error: "User not found or not approved" }, { status: 404 })
  }

  const filter = { where: { userId: null }, data: { userId } }
  const [
    contacts, interactions, actionItems, projects, auditLogs,
    knowledgeItems, hollyApiKeys, pushSubscriptions, googleTokens,
    calendarSyncs, userPreferences, vaultConfigs, vaultNotes,
  ] = await Promise.all([
    prisma.contact.updateMany(filter),
    prisma.interaction.updateMany(filter),
    prisma.actionItem.updateMany(filter),
    prisma.project.updateMany(filter),
    prisma.auditLog.updateMany(filter),
    prisma.knowledgeItem.updateMany(filter),
    prisma.hollyApiKey.updateMany(filter),
    prisma.pushSubscription.updateMany(filter),
    prisma.googleToken.updateMany(filter),
    prisma.calendarSync.updateMany(filter),
    prisma.userPreference.updateMany(filter),
    prisma.vaultConfig.updateMany(filter),
    prisma.vaultNote.updateMany(filter),
  ])

  return NextResponse.json({
    ok: true,
    claimed: {
      contacts: contacts.count, interactions: interactions.count,
      actionItems: actionItems.count, projects: projects.count,
      auditLogs: auditLogs.count, knowledgeItems: knowledgeItems.count,
      hollyApiKeys: hollyApiKeys.count, pushSubscriptions: pushSubscriptions.count,
      googleTokens: googleTokens.count, calendarSyncs: calendarSyncs.count,
      userPreferences: userPreferences.count, vaultConfigs: vaultConfigs.count,
      vaultNotes: vaultNotes.count,
    },
  })
}
