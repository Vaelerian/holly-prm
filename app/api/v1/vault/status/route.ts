import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getVaultConfig, isCouchDbAccessible } from "@/lib/services/vault"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const config = await getVaultConfig(userId)
  if (!config) {
    return NextResponse.json({ configured: false, accessible: false, config: null })
  }

  const accessible = await isCouchDbAccessible(userId)
  return NextResponse.json({
    configured: true,
    accessible,
    config: {
      couchDbUrl: config.couchDbUrl,
      couchDbDatabase: config.couchDbDatabase,
      workdayCron: config.workdayCron,
      weekendCron: config.weekendCron,
      enabled: config.enabled,
      lastSyncAt: config.lastSyncAt,
      lastSeq: config.lastSeq,
    },
  })
}
