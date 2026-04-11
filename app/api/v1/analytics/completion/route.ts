import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCompletionAnalytics } from "@/lib/services/analytics"

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30))
  return NextResponse.json(await getCompletionAnalytics(days, userId))
}
