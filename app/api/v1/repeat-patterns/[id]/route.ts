import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateRepeatPattern, deleteRepeatPattern } from "@/lib/services/repeat-patterns"
import { UpdateRepeatPatternSchema } from "@/lib/validations/repeat-pattern"

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

  const parsed = UpdateRepeatPatternSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  }

  try {
    const pattern = await updateRepeatPattern(id, parsed.data, userId)
    if (!pattern) {
      return NextResponse.json({ error: "Repeat pattern not found", code: "NOT_FOUND" }, { status: 404 })
    }
    return NextResponse.json(pattern)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    if (msg.includes("Role not found")) {
      return NextResponse.json({ error: msg, code: "NOT_FOUND" }, { status: 404 })
    }
    return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const { id } = await params

  const scope = req.nextUrl.searchParams.get("scope")
  if (scope !== "all" && scope !== "future") {
    return NextResponse.json({ error: "Missing or invalid scope query param. Must be 'all' or 'future'", code: "BAD_REQUEST" }, { status: 400 })
  }

  try {
    const result = await deleteRepeatPattern(id, scope, userId)
    if (!result) {
      return NextResponse.json({ error: "Repeat pattern not found", code: "NOT_FOUND" }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
  }
}
