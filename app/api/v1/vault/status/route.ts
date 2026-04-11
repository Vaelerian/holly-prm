import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getVaultConfig, isVaultAccessible } from "@/lib/services/vault"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const config = await getVaultConfig()
  if (!config) {
    return NextResponse.json({ configured: false, accessible: false, config: null })
  }

  const accessible = await isVaultAccessible()
  return NextResponse.json({
    configured: true,
    accessible,
    config: {
      vaultPath: config.vaultPath,
      workdayCron: config.workdayCron,
      weekendCron: config.weekendCron,
      enabled: config.enabled,
      lastSyncAt: config.lastSyncAt,
    },
  })
}
