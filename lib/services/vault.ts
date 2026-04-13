// LiveSync encrypted path prefix - docs with this prefix in the path field are E2E encrypted notes
const LIVESYNC_ENCRYPTED_PREFIX = "/\\:%="

import { prisma } from "@/lib/db"
import { couchAllDocs, couchDbAccessible, couchGet, couchPut } from "@/lib/services/vault-couch"
import { deriveKey, decryptString, encryptString } from "@/lib/services/vault-crypto"
import type { VaultConfig } from "@/app/generated/prisma/client"

// PBKDF2 key derivation is deliberately expensive (100k iterations, ~100ms).
// Cache the derived key per passphrase so searchVault and getNoteContent don't
// re-derive on every call. The derived key is non-exportable and safe to hold
// in memory for the process lifetime since it is equally sensitive whether held
// for 1 ms or indefinitely.
let _keyCache: { passphrase: string; key: CryptoKey } | null = null
async function getOrDeriveKey(passphrase: string): Promise<CryptoKey> {
  if (_keyCache?.passphrase === passphrase) return _keyCache.key
  const key = await deriveKey(passphrase)
  _keyCache = { passphrase, key }
  return key
}
// Exported for test isolation only - clears the in-process key cache
export function clearKeyCache(): void { _keyCache = null }

export interface VaultSearchResult {
  couchDbId: string
  path: string
  title: string
  snippet: string
  frontmatter: Record<string, unknown>
}

// Phase 5: single global VaultConfig; userId param accepted for API compatibility
// but ignored until Phase 6 adds per-user vault support.
export async function getVaultConfig(_userId?: string): Promise<VaultConfig | null> {
  return prisma.vaultConfig.findFirst()
}

export async function isVaultAccessible(_userId?: string): Promise<boolean> {
  const config = await getVaultConfig()
  if (!config) return false
  return couchDbAccessible(config)
}

// Legacy alias for existing callers
export const isCouchDbAccessible = isVaultAccessible

function stripEncryptedPrefix(value: string): string | null {
  if (!value.startsWith(LIVESYNC_ENCRYPTED_PREFIX)) return null
  return value.slice(LIVESYNC_ENCRYPTED_PREFIX.length)
}

// Simple frontmatter parser for flat key: value YAML pairs only.
// Does not handle multi-line values, quoted strings with colons, or YAML sequences.
// This is sufficient for the PRM use case (prm_entity, prm_id, last_updated are
// always simple scalars). Do not use this for general-purpose YAML parsing.
export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: content }
  const frontmatter: Record<string, unknown> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    frontmatter[key] = value
  }
  return { frontmatter, body: match[2] }
}

export function extractTitle(content: string, path: string): string {
  const h1 = content.match(/^#\s+(.+)$/m)
  if (h1) return h1[1].trim()
  const filename = path.split("/").pop() ?? path
  return filename.replace(/\.md$/, "")
}

export function extractSnippet(content: string, query: string): string {
  const lower = content.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return content.slice(0, 200)
  const start = Math.max(0, idx - 80)
  const end = Math.min(content.length, idx + 120)
  return (start > 0 ? "..." : "") + content.slice(start, end) + (end < content.length ? "..." : "")
}

export async function searchVault(query: string, limit = 10, _userId?: string): Promise<VaultSearchResult[]> {
  const config = await getVaultConfig()
  if (!config) return []
  if (!(await couchDbAccessible(config))) return []

  const key = await getOrDeriveKey(config.e2ePassphrase)
  // NOTE: couchAllDocs fetches every document in the database. With E2E encryption
  // CouchDB cannot filter by path server-side, so client-side filtering is required.
  // For Phase 5 this is acceptable; Phase 6 should add pagination or a search index.
  const allDocs = await couchAllDocs(config, { include_docs: true })
  const results: VaultSearchResult[] = []

  for (const row of allDocs.rows) {
    if (results.length >= limit) break
    const doc = row.doc as Record<string, unknown> | undefined
    if (!doc) continue

    // LiveSync stores the encrypted file path in doc.path (not in _id)
    const rawPath = doc.path as string | undefined
    if (!rawPath) continue
    const encryptedPath = stripEncryptedPrefix(rawPath)
    if (!encryptedPath) continue  // no prefix = not an encrypted note

    let path: string
    try {
      path = await decryptString(key, encryptedPath)
    } catch {
      continue
    }

    if (!path.endsWith(".md")) continue

    const rawData = doc.data as string | undefined
    if (!rawData) continue

    let content: string
    try {
      content = await decryptString(key, rawData)
    } catch {
      continue
    }

    if (!content.toLowerCase().includes(query.toLowerCase())) continue

    const { frontmatter, body } = parseFrontmatter(content)
    results.push({
      couchDbId: row.id,
      path,
      title: extractTitle(body, path),
      snippet: extractSnippet(body, query),
      frontmatter,
    })
  }

  return results
}

export async function getNoteContent(couchDbId: string, _userId?: string): Promise<string | null> {
  const config = await getVaultConfig()
  if (!config) return null

  try {
    const doc = await couchGet(config, couchDbId) as Record<string, unknown>
    const rawData = doc.data as string | undefined
    if (!rawData) return null
    const key = await getOrDeriveKey(config.e2ePassphrase)
    return decryptString(key, rawData)
  } catch {
    return null
  }
}

// Only allow simple path-safe filenames: letters, digits, spaces, hyphens, underscores,
// forward slashes, ending in .md. The character set excludes "." so ".." is impossible.
const VALID_NOTE_PATH = /^[a-zA-Z0-9 \-_/]+\.md$/

export async function createNote(
  notePath: string,
  entityType: string,
  entityId: string,
  content: string,
  _userId?: string
): Promise<string | null> {
  if (!VALID_NOTE_PATH.test(notePath)) return null

  const config = await getVaultConfig()
  if (!config) return null

  const key = await getOrDeriveKey(config.e2ePassphrase)
  const now = Date.now()
  const today = new Date().toISOString().slice(0, 10)
  const frontmatter = `---\nprm_entity: ${entityType}\nprm_id: ${entityId}\ncreated: ${today}\n---\n\n`
  const fullContent = frontmatter + content

  const couchDbId = await encryptString(key, notePath)
  const encryptedContent = await encryptString(key, fullContent)

  await couchPut(config, couchDbId, {
    _id: couchDbId,
    path: LIVESYNC_ENCRYPTED_PREFIX + couchDbId,
    data: encryptedContent,
    type: "newnote",
    encrypted: true,
    mtime: now,
    ctime: now,
    size: Buffer.byteLength(fullContent, "utf8"),
    children: [],
  })

  await prisma.vaultNote.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    create: { entityType, entityId, couchDbId, notePath, lastSyncAt: new Date() },
    update: { couchDbId, notePath, lastSyncAt: new Date() },
  })

  return couchDbId
}

export async function updateNote(
  couchDbId: string,
  newBody: string,
  _userId?: string
): Promise<void> {
  const config = await getVaultConfig()
  if (!config) return

  let doc: Record<string, unknown>
  let existing: string
  let key: CryptoKey
  try {
    doc = await couchGet(config, couchDbId) as Record<string, unknown>
    key = await getOrDeriveKey(config.e2ePassphrase)
    existing = await decryptString(key, doc.data as string)
  } catch {
    // Stale couchDbId or decryption failure - nothing to update
    return
  }

  // Preserve frontmatter, replace body, update last_updated timestamp
  const { frontmatter } = parseFrontmatter(existing)
  frontmatter.last_updated = new Date().toISOString().slice(0, 10)
  const fmLines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`).join("\n")
  const updated = `---\n${fmLines}\n---\n\n${newBody}`

  const encryptedContent = await encryptString(key, updated)
  await couchPut(config, couchDbId, {
    ...doc,
    data: encryptedContent,
    mtime: Date.now(),
    size: Buffer.byteLength(updated, "utf8"),
  })

  await prisma.vaultNote.updateMany({
    where: { couchDbId },
    data: { lastSyncAt: new Date() },
  })
}
