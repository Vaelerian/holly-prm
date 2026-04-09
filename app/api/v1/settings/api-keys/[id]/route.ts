import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { deleteApiKey } from "@/lib/services/api-keys"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  await deleteApiKey(id)
  return new NextResponse(null, { status: 204 })
}
