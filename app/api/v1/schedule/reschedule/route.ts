import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { rescheduleAll } from "@/lib/services/scheduling-engine"
import { prisma } from "@/lib/db"

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  let slotId: string | undefined
  try {
    const body = await req.json()
    if (body && typeof body.slotId === "string") slotId = body.slotId
  } catch {
    // No body or non-JSON body — fall through to all-tasks reschedule.
  }

  if (slotId) {
    const slot = await prisma.timeSlot.findFirst({ where: { id: slotId, userId }, select: { id: true } })
    if (!slot) {
      return NextResponse.json({ error: "Slot not found", code: "NOT_FOUND" }, { status: 404 })
    }
  }

  const result = await rescheduleAll(userId, slotId ? { slotId } : {})
  return NextResponse.json(result)
}
