import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { fetchRecentEmails } from "@/lib/services/gmail"
import { isGoogleConnected } from "@/lib/google"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }

  const connected = await isGoogleConnected(authResult.userId)
  if (!connected) {
    return NextResponse.json({ emails: [], googleConnected: false })
  }

  const hours = Math.min(168, Math.max(1, parseInt(req.nextUrl.searchParams.get("hours") ?? "24", 10) || 24))
  const emails = await fetchRecentEmails({ hours, userId: authResult.userId })
  return NextResponse.json({ emails, googleConnected: true, fetchedAt: new Date().toISOString() })
}
