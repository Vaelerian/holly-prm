import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateGoal, deleteGoal } from "@/lib/services/goals"
import { UpdateGoalSchema } from "@/lib/validations/goal"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const parsed = UpdateGoalSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  try {
    const goal = await updateGoal(id, parsed.data, userId)
    if (!goal) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
    return NextResponse.json(goal)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    if (msg.includes("Unique constraint")) return NextResponse.json({ error: msg, code: "CONFLICT" }, { status: 409 })
    return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  let body: { remapToGoalId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 })
  }
  if (!body.remapToGoalId) return NextResponse.json({ error: "remapToGoalId is required", code: "VALIDATION_ERROR" }, { status: 422 })
  try {
    const result = await deleteGoal(id, body.remapToGoalId, userId)
    if (!result) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
    return new NextResponse(null, { status: 204 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
  }
}
