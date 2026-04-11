import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { searchVault, isVaultAccessible } from "@/lib/services/vault"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }

  const accessible = await isVaultAccessible()
  if (!accessible) {
    return NextResponse.json({ error: "vault_not_configured", code: "VAULT_NOT_CONFIGURED" }, { status: 503 })
  }

  const q = req.nextUrl.searchParams.get("q") ?? ""
  const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10) || 10))

  if (!q.trim()) {
    return NextResponse.json({ results: [], query: q, total: 0 })
  }

  const results = await searchVault(q, limit)
  return NextResponse.json({ results, query: q, total: results.length })
}
