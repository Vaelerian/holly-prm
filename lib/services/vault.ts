import { prisma } from "@/lib/db"

export interface VaultSearchResult {
  path: string
  title: string
  snippet: string
  frontmatter: Record<string, string>
}

export async function getVaultConfig(userId?: string) {
  if (!userId) return null
  return prisma.vaultConfig.findFirst({ where: { userId } })
}

export async function isCouchDbAccessible(userId?: string): Promise<boolean> {
  const config = await getVaultConfig(userId)
  if (!config) return false
  try {
    const url = `${config.couchDbUrl}/${config.couchDbDatabase}`
    const res = await fetch(url, {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${config.couchDbUsername}:${config.couchDbPassword}`).toString("base64"),
      },
    })
    return res.ok
  } catch {
    return false
  }
}

// Legacy alias kept for any callers that used the old name
export const isVaultAccessible = isCouchDbAccessible

export async function createNote(
  filename: string,
  entityType: string,
  entityId: string,
  content: string,
  userId?: string
): Promise<string> {
  const config = await getVaultConfig(userId)
  if (!config) throw new Error("Vault not configured")

  const notePath = `Holly/${filename}.md`

  await prisma.vaultNote.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    create: {
      entityType,
      entityId,
      couchDbId: `${entityType}_${entityId}`,
      notePath,
      lastSyncAt: new Date(),
      userId: userId ?? null,
    },
    update: {
      notePath,
      lastSyncAt: new Date(),
    },
  })

  return notePath
}

export async function updateNote(notePath: string, _content: string, userId?: string): Promise<void> {
  const config = await getVaultConfig(userId)
  if (!config) throw new Error("Vault not configured")

  const normalizedPath = notePath.replace(/\\/g, "/")
  await prisma.vaultNote.updateMany({
    where: { notePath: normalizedPath },
    data: { lastSyncAt: new Date() },
  })
}

export async function getNoteContent(_relativePath: string, _userId?: string): Promise<string | null> {
  // CouchDB-based vault: note content is stored in CouchDB, not the local filesystem.
  // This stub returns null until the CouchDB sync layer is implemented in Phase 5.
  return null
}

export async function searchVault(_query: string, _limit = 10, _userId?: string): Promise<VaultSearchResult[]> {
  // CouchDB-based vault: search is performed against CouchDB in Phase 5.
  return []
}
