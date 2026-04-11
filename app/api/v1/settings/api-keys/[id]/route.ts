import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { deleteApiKey } from "@/lib/services/api-keys"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const deleted = await deleteApiKey(id, userId)
  if (!deleted) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
