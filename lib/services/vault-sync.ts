import { prisma } from "@/lib/db"
import { getVaultConfig, parseFrontmatter, extractTitle, VaultSearchResult } from "@/lib/services/vault"
import { couchChanges, couchDbAccessible } from "@/lib/services/vault-couch"
import { deriveKey, decryptString } from "@/lib/services/vault-crypto"

export interface VaultSyncResult {
  updatedNotes: VaultSearchResult[]
  errors: string[]
}

// LiveSync encrypted path prefix (same constant as in vault.ts)
const LIVESYNC_ENCRYPTED_PREFIX = "/\\:%="

function stripEncryptedPrefix(value: string): string | null {
  if (!value.startsWith(LIVESYNC_ENCRYPTED_PREFIX)) return null
  return value.slice(LIVESYNC_ENCRYPTED_PREFIX.length)
}

function cronToIntervalMs(cron: string): number {
  const parts = cron.split(" ")
  const hourField = parts[1] ?? "*"
  if (hourField === "*") return 60 * 60 * 1000
  const stepMatch = hourField.match(/^\*\/(\d+)$/)
  if (stepMatch) return parseInt(stepMatch[1]) * 60 * 60 * 1000
  // Handles the fixed set of patterns the settings UI dropdown can produce.
  // "9,17" is the only comma-list pattern; other comma-lists fall through to 24h.
  if (hourField === "9,17") return 8 * 60 * 60 * 1000
  return 24 * 60 * 60 * 1000
}

export function shouldRunSync(config: {
  enabled: boolean
  workdayCron: string
  weekendCron: string
  lastSyncAt: Date | null
}): boolean {
  if (!config.enabled) return false
  if (!config.lastSyncAt) return true
  const now = new Date()
  const dayOfWeek = now.getDay()
  const isWorkday = dayOfWeek >= 1 && dayOfWeek <= 5
  const cron = isWorkday ? config.workdayCron : config.weekendCron
  const intervalMs = cronToIntervalMs(cron)
  return now.getTime() - config.lastSyncAt.getTime() >= intervalMs
}

export async function runVaultSync(): Promise<VaultSyncResult> {
  const config = await getVaultConfig()
  if (!config || !config.enabled) return { updatedNotes: [], errors: [] }
  if (!(await couchDbAccessible(config))) return { updatedNotes: [], errors: [] }

  const key = await deriveKey(config.e2ePassphrase)
  const changes = await couchChanges(config, config.lastSeq)
  const updatedNotes: VaultSearchResult[] = []
  const errors: string[] = []

  for (const change of changes.results) {
    if (change.deleted) continue
    const doc = change.doc as Record<string, unknown> | undefined
    if (!doc) continue

    // LiveSync stores the encrypted file path in doc.path (not in change.id)
    const rawPath = doc.path as string | undefined
    if (!rawPath) continue
    const encryptedPath = stripEncryptedPrefix(rawPath)
    if (!encryptedPath) continue

    let path: string
    try {
      path = await decryptString(key, encryptedPath)
    } catch {
      continue
    }
    if (!path.endsWith(".md")) continue

    const rawData = doc.data as string | undefined
    if (!rawData) {
      errors.push(`Missing data field for ${change.id}`)
      continue
    }

    let content: string
    try {
      content = await decryptString(key, rawData)
    } catch (e) {
      errors.push(`Failed to decrypt ${change.id}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }

    const { frontmatter, body } = parseFrontmatter(content)
    updatedNotes.push({
      couchDbId: change.id,
      path,
      title: extractTitle(body, path),
      snippet: body.slice(0, 200),
      frontmatter,
    })
  }

  await prisma.vaultConfig.update({
    where: { id: config.id },
    data: { lastSyncAt: new Date(), lastSeq: changes.last_seq },
  })

  return { updatedNotes, errors }
}
