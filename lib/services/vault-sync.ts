import { prisma } from "@/lib/db"
import { getVaultConfig, getNoteContent, VaultSearchResult } from "./vault"

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

function parseFm(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const result: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(":")
    if (colonIdx !== -1) {
      result[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim()
    }
  }
  return result
}

export async function runVaultSync(): Promise<VaultSyncResult> {
  const config = await getVaultConfig()
  if (!config) return { updatedNotes: [], errors: [] }

  const vaultNotes = await prisma.vaultNote.findMany()
  const updatedNotes: VaultSearchResult[] = []
  const errors: string[] = []

  for (const note of vaultNotes) {
    try {
      const content = await getNoteContent(note.vaultPath)
      if (!content) {
        errors.push(`Note not found: ${note.vaultPath}`)
        continue
      }

      const lastUpdatedMatch = content.match(/last_updated:\s*(.+)/)
      if (lastUpdatedMatch) {
        const fileLastUpdatedStr = lastUpdatedMatch[1].trim()
        const lastSyncDateStr = note.lastSyncAt
          ? note.lastSyncAt.toISOString().slice(0, 10)
          : null
        const fileLastUpdated = new Date(fileLastUpdatedStr)
        const isNewer = lastSyncDateStr === null
          ? !isNaN(fileLastUpdated.getTime())
          : fileLastUpdatedStr > lastSyncDateStr
        if (!isNaN(fileLastUpdated.getTime()) && isNewer) {
          const titleMatch = content.match(/^#\s+(.+)$/m)
          updatedNotes.push({
            path: note.vaultPath,
            title: titleMatch ? titleMatch[1].trim() : note.vaultPath,
            snippet: content.slice(0, 200),
            frontmatter: parseFm(content),
          })
        }
      }
    } catch (e) {
      errors.push(`Error syncing ${note.vaultPath}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  await prisma.vaultConfig.update({
    where: { id: config.id },
    data: { lastSyncAt: new Date() },
  })

  return { updatedNotes, errors }
}
