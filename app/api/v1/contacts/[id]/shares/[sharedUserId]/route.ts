import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { deleteContactShare } from "@/lib/services/sharing"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sharedUserId: string }> }
) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, sharedUserId } = await params
  const ok = await deleteContactShare(id, sharedUserId, userId)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
