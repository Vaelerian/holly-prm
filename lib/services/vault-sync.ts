import { prisma } from "@/lib/db"
import { getVaultConfig, VaultSearchResult } from "./vault"

export interface VaultSyncResult {
  updatedNotes: VaultSearchResult[]
  errors: string[]
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

export async function runVaultSync(userId?: string): Promise<VaultSyncResult> {
  const config = await getVaultConfig(userId)
  if (!config) return { updatedNotes: [], errors: [] }

  const vaultNotes = await prisma.vaultNote.findMany()
  const updatedNotes: VaultSearchResult[] = []
  const errors: string[] = []

  for (const note of vaultNotes) {
    try {
      // CouchDB sync will be implemented in Phase 5 sync worker.
      // For now we record the note path for tracking purposes.
      updatedNotes.push({
        path: note.notePath,
        title: note.notePath,
        snippet: "",
        frontmatter: {},
      })
    } catch (e) {
      errors.push(`Error syncing ${note.notePath}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  await prisma.vaultConfig.update({
    where: { id: config.id },
    data: { lastSyncAt: new Date() },
  })

  return { updatedNotes, errors }
}
