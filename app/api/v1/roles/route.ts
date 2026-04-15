import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listRoles, createRole } from "@/lib/services/roles"
import { CreateRoleSchema } from "@/lib/validations/role"

export async function GET() {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const roles = await listRoles(userId)
  return NextResponse.json(roles)
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
  const parsed = CreateRoleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  try {
    const role = await createRole(parsed.data, userId)
    return NextResponse.json(role, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error"
    if (msg.includes("Unique constraint")) return NextResponse.json({ error: msg, code: "CONFLICT" }, { status: 409 })
    return NextResponse.json({ error: msg, code: "BAD_REQUEST" }, { status: 400 })
  }
}
