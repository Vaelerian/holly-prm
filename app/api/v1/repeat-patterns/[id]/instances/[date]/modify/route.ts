import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { modifyRepeatInstance } from "@/lib/services/repeat-patterns"
import { ModifyInstanceSchema } from "@/lib/validations/repeat-pattern"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; date: string }> }
) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const { id, date } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 })
  }

  const parsed = ModifyInstanceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const exception = await modifyRepeatInstance(id, date, parsed.data, userId)
    return NextResponse.json(exception, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    if (msg.includes("not found") || msg.includes("not owned")) {
      return NextResponse.json({ error: msg, code: "NOT_FOUND" }, { status: 404 })
    }
    if (msg.includes("not a valid instance")) {
      return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
    }
    return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
  }
}
