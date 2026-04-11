import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import { sendPushNotification, isPushConfigured } from "@/lib/push"
import { publishSseEvent } from "@/lib/sse-events"
import { fetchRecentEmails } from "@/lib/services/gmail"
import { getVaultConfig } from "@/lib/services/vault"
import { shouldRunSync, runVaultSync } from "@/lib/services/vault-sync"

const MAX_NOTIFICATIONS_PER_RUN = 5

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
    take: 50,
  })

  // Publish SSE events for critically overdue contacts (healthScore < 40)
  for (const contact of overdueContacts) {
    if (contact.healthScore < 40) {
      const sseKey = `sse:sent:overdue:${contact.id}:${today}`
      const alreadySent = await redis.get(sseKey).catch(() => null)
      if (!alreadySent) {
        await publishSseEvent("contact.overdue", {
          id: contact.id,
          name: contact.name,
          healthScore: contact.healthScore,
        })
        await redis.set(sseKey, "1", "EX", 86400).catch(() => {})
      }
    }
  }

  // 3. Gmail poll - cache recent emails for briefing
  try {
    const recentEmails = await fetchRecentEmails({ hours: 24 })
    await redis.set("gmail:recent", JSON.stringify(recentEmails), "EX", 3600)
  } catch (e) {
    console.error("[cron/notify] gmail poll failed", e)
  }

  // 4. Vault sync
  try {
    const vaultConfig = await getVaultConfig()
    if (vaultConfig && shouldRunSync(vaultConfig)) {
      const result = await runVaultSync()
      await redis.set("vault:sync:latest", JSON.stringify(result), "EX", 7200)
    }
  } catch (e) {
    console.error("[cron/notify] vault sync failed", e)
  }

  if (!isPushConfigured) {
    return NextResponse.json({ sent: 0 })
  }

  const subscriptions = await prisma.pushSubscription.findMany()
  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

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
    take: 50,
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
