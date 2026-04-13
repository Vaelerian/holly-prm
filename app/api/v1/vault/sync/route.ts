import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isVaultAccessible } from "@/lib/services/vault"
import { runVaultSync } from "@/lib/services/vault-sync"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const accessible = await isVaultAccessible(userId)
  if (!accessible) return NextResponse.json({ error: "vault_not_configured" }, { status: 503 })

  const result = await runVaultSync()
  return NextResponse.json(result)
}
