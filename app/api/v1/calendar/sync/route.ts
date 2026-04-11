import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { fetchGoogleEvents } from "@/lib/services/calendar-sync"

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10)
  const events = await fetchGoogleEvents(days, userId)
  return NextResponse.json({ ok: true, count: events.length })
}
