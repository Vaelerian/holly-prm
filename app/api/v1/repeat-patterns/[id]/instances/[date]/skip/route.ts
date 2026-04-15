import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { skipRepeatInstance } from "@/lib/services/repeat-patterns"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; date: string }> }
) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const { id, date } = await params

  try {
    const exception = await skipRepeatInstance(id, date, userId)
    return NextResponse.json(exception, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    if (msg.includes("not found") || msg.includes("not owned")) {
      return NextResponse.json({ error: msg, code: "NOT_FOUND" }, { status: 404 })
    }
    if (msg.includes("assigned tasks")) {
      return NextResponse.json({ error: msg, code: "CONFLICT" }, { status: 409 })
    }
    if (msg.includes("not a valid instance")) {
      return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
    }
    return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
  }
}
