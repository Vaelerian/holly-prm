import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listTimeSlotsForRange, createTimeSlot } from "@/lib/services/time-slots"
import { CreateTimeSlotSchema } from "@/lib/validations/time-slot"

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const from = req.nextUrl.searchParams.get("from")
  const to = req.nextUrl.searchParams.get("to")
  if (!from || !to) {
    return NextResponse.json({ error: "Missing required query params: from, to", code: "BAD_REQUEST" }, { status: 400 })
  }

  // Basic date format validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD", code: "BAD_REQUEST" }, { status: 400 })
  }

  const slots = await listTimeSlotsForRange(userId, from, to)
  return NextResponse.json(slots)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 })
  }

  const parsed = CreateTimeSlotSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const slot = await createTimeSlot(parsed.data, userId)
    return NextResponse.json(slot, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    if (msg.includes("Role not found")) {
      return NextResponse.json({ error: msg, code: "NOT_FOUND" }, { status: 404 })
    }
    return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
  }
}
