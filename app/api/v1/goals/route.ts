import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listGoals, createGoal } from "@/lib/services/goals"
import { CreateGoalSchema } from "@/lib/validations/goal"

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { searchParams } = req.nextUrl
  const roleId = searchParams.get("roleId") ?? undefined
  const goals = await listGoals(userId, roleId)
  return NextResponse.json(goals)
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
  const parsed = CreateGoalSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  try {
    const goal = await createGoal(parsed.data, userId)
    return NextResponse.json(goal, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    if (msg.includes("Unique constraint")) return NextResponse.json({ error: msg, code: "CONFLICT" }, { status: 409 })
    return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
  }
}
