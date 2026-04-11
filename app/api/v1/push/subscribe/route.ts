import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { isPushConfigured } from "@/lib/push"
import { z } from "zod"

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  if (!isPushConfigured) {
    return NextResponse.json({ error: "Push notifications not configured" }, { status: 503 })
  }

  const body = await req.json()
  const parsed = SubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  }

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    update: { p256dh: parsed.data.p256dh, auth: parsed.data.auth, userId },
    create: { endpoint: parsed.data.endpoint, p256dh: parsed.data.p256dh, auth: parsed.data.auth, userId },
  })

  return NextResponse.json(subscription, { status: 201 })
}
