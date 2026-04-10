import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import { sendPushNotification, isPushConfigured } from "@/lib/push"

const MAX_NOTIFICATIONS_PER_RUN = 5

function todayKey(): string {
  return new Date().toISOString().slice(0, 10) // "2026-04-10"
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isPushConfigured) {
    return NextResponse.json({ error: "Push notifications not configured" }, { status: 503 })
  }

  const subscriptions = await prisma.pushSubscription.findMany()
  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  const today = todayKey()
  let sent = 0

  // 1. Overdue contacts
  const overdueContacts = await prisma.contact.findMany({
    where: {
      interactionFreqDays: { not: null },
      OR: [{ healthScore: { lt: 100 } }, { lastInteraction: null }],
    },
    orderBy: { healthScore: "asc" },
    take: MAX_NOTIFICATIONS_PER_RUN,
  })

  for (const contact of overdueContacts) {
    if (sent >= MAX_NOTIFICATIONS_PER_RUN) break
    const dedupeKey = `notify:sent:overdue:${contact.id}:${today}`
    const already = await redis.get(dedupeKey)
    if (already) continue

    for (const sub of subscriptions) {
      try {
        await sendPushNotification(sub, {
          title: "Catch up reminder",
          body: `Catch up with ${contact.name} -- it's been a while.`,
          url: `/contacts/${contact.id}`,
        })
      } catch (e) {
        console.error("[cron/notify] push failed for overdue contact", contact.id, e)
      }
    }
    await redis.set(dedupeKey, "1", "EX", 86400)
    sent++
  }

  // 2. Follow-ups due
  const now = new Date()
  const pendingFollowUps = await prisma.interaction.findMany({
    where: {
      followUpRequired: true,
      followUpCompleted: false,
      followUpDate: { lte: now },
    },
    include: { contact: { select: { id: true, name: true } } },
    orderBy: { followUpDate: "asc" },
    take: MAX_NOTIFICATIONS_PER_RUN,
  })

  for (const interaction of pendingFollowUps) {
    if (sent >= MAX_NOTIFICATIONS_PER_RUN) break
    const dedupeKey = `notify:sent:followup:${interaction.id}:${today}`
    const already = await redis.get(dedupeKey)
    if (already) continue

    const summary = interaction.summary.length > 60
      ? interaction.summary.slice(0, 60) + "..."
      : interaction.summary

    for (const sub of subscriptions) {
      try {
        await sendPushNotification(sub, {
          title: "Follow-up due",
          body: `Follow up with ${interaction.contact.name}: ${summary}`,
          url: `/contacts/${interaction.contact.id}`,
        })
      } catch (e) {
        console.error("[cron/notify] push failed for follow-up", interaction.id, e)
      }
    }
    await redis.set(dedupeKey, "1", "EX", 86400)
    sent++
  }

  return NextResponse.json({ sent })
}
