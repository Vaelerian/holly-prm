import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { runVaultSync } from "@/lib/services/vault-sync"
import { isVaultAccessible } from "@/lib/services/vault"

export async function POST(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const { userId } = authResult

  const accessible = await isVaultAccessible(userId)
  if (!accessible) return NextResponse.json({ error: "vault_not_configured", code: "VAULT_NOT_CONFIGURED" }, { status: 503 })

  const result = await runVaultSync()
  return NextResponse.json(result)
}
