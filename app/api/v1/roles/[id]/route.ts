import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateRole, deleteRole } from "@/lib/services/roles"
import { UpdateRoleSchema } from "@/lib/validations/role"

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
  const parsed = UpdateRoleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  try {
    const role = await updateRole(id, parsed.data, userId)
    if (!role) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
    return NextResponse.json(role)
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
  let body: { remapToRoleId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 })
  }
  if (!body.remapToRoleId) return NextResponse.json({ error: "remapToRoleId is required", code: "VALIDATION_ERROR" }, { status: 422 })
  try {
    const result = await deleteRole(id, body.remapToRoleId, userId)
    if (!result) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
    return new NextResponse(null, { status: 204 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
  }
}
