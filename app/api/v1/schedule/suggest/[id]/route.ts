import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { suggestDate } from "@/lib/services/scheduling-engine"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const result = await suggestDate(id, userId)
  return NextResponse.json(result)
}
