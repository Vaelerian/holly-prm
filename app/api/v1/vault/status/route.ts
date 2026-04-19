import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getVaultConfig, isCouchDbAccessible } from "@/lib/services/vault"

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Vault status is read-only and non-critical. Any failure should return a
  // sensible default (not configured) rather than a 500, because:
  //  - the Profile page renders this on every load for every user
  //  - the admin panel relies on this to show the current state
  //  - the CouchDB fetch can hang or throw when the configured URL is
  //    unreachable from the server (e.g. localhost in production).
  try {
    const config = await getVaultConfig(userId)
    if (!config) {
      return NextResponse.json({ configured: false, accessible: false, config: null })
    }

    let accessible = false
    try {
      accessible = await isCouchDbAccessible(userId)
    } catch {
      accessible = false
    }

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
  } catch (e) {
    console.error("[vault/status] lookup failed", e)
    return NextResponse.json({ configured: false, accessible: false, config: null })
  }
}
