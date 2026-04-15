import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { completeGoal } from "@/lib/services/goals"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  try {
    const goal = await completeGoal(id, userId)
    if (!goal) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
    return NextResponse.json(goal)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
  }
}
