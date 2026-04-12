import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listAccessGrants, createAccessGrant } from "@/lib/services/sharing"

export async function GET() {
  const session = await auth()
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  return NextResponse.json(await listAccessGrants())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  let grantorEmail: unknown, granteeEmail: unknown
  try {
    const body = await req.json()
    grantorEmail = body.grantorEmail
    granteeEmail = body.granteeEmail
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!grantorEmail || !granteeEmail) return NextResponse.json({ error: "grantorEmail and granteeEmail required" }, { status: 422 })
  const result = await createAccessGrant(grantorEmail, granteeEmail)
  if (result === "grantor_not_found") return NextResponse.json({ error: "Grantor not found" }, { status: 404 })
  if (result === "grantee_not_found") return NextResponse.json({ error: "Grantee not found" }, { status: 404 })
  if (result === "already_exists") return NextResponse.json({ error: "Grant already exists" }, { status: 409 })
  return NextResponse.json(result, { status: 201 })
}
