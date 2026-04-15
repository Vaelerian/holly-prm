import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateTimeSlot, deleteTimeSlot } from "@/lib/services/time-slots"
import { UpdateTimeSlotSchema } from "@/lib/validations/time-slot"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 })
  }

  const parsed = UpdateTimeSlotSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const slot = await updateTimeSlot(id, parsed.data, userId)
    if (!slot) {
      return NextResponse.json({ error: "Time slot not found", code: "NOT_FOUND" }, { status: 404 })
    }
    return NextResponse.json(slot)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    if (msg.includes("Role not found")) {
      return NextResponse.json({ error: msg, code: "NOT_FOUND" }, { status: 404 })
    }
    return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const { id } = await params

  try {
    const result = await deleteTimeSlot(id, userId)
    if (!result) {
      return NextResponse.json({ error: "Time slot not found", code: "NOT_FOUND" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    if (msg.includes("assigned tasks")) {
      return NextResponse.json({ error: msg, code: "CONFLICT" }, { status: 409 })
    }
    return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
  }
}
