import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { getHealthAnalytics } from "@/lib/services/analytics"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30))
  return NextResponse.json(await getHealthAnalytics(days))
}
