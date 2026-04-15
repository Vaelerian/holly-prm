import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createRepeatPattern } from "@/lib/services/repeat-patterns"
import { CreateRepeatPatternSchema } from "@/lib/validations/repeat-pattern"

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

  const parsed = CreateRepeatPatternSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const pattern = await createRepeatPattern(parsed.data, userId)
    return NextResponse.json(pattern, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    if (msg.includes("Role not found")) {
      return NextResponse.json({ error: msg, code: "NOT_FOUND" }, { status: 404 })
    }
    return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
  }
}
