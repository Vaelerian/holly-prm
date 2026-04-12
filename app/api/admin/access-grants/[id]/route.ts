import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { deleteAccessGrant } from "@/lib/services/sharing"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  const { id } = await params
  const ok = await deleteAccessGrant(id)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
