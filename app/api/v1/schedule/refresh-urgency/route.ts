import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { refreshUrgency } from "@/lib/services/scheduling-engine"

export async function POST() {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const escalated = await refreshUrgency(userId)
  return NextResponse.json({ escalated })
}
