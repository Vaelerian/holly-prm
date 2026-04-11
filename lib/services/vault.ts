import { prisma } from "@/lib/db"
import { access, readFile, readdir, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

export interface VaultSearchResult {
  path: string
  title: string
  snippet: string
  frontmatter: Record<string, string>
}

export async function getVaultConfig(userId?: string) {
  return prisma.vaultConfig.findFirst(userId ? { where: { userId } } : undefined)
}

export async function isVaultAccessible(userId?: string): Promise<boolean> {
  const config = await getVaultConfig(userId)
  if (!config) return false
  try {
    await access(config.vaultPath)
    return true
  } catch {
    return false
  }
}

function parseFrontmatter(content: string): Record<string, string> {
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

function extractTitle(content: string, filePath: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  if (match) return match[1].trim()
  return path.basename(filePath, ".md")
}

function extractSnippet(content: string, query: string): string {
  const lc = content.toLowerCase()
  const idx = lc.indexOf(query.toLowerCase())
  if (idx === -1) return content.slice(0, 200)
  const start = Math.max(0, idx - 50)
  const end = Math.min(content.length, idx + 150)
  const snippet = content.slice(start, end)
  return (start > 0 ? "..." : "") + snippet + (end < content.length ? "..." : "")
}

async function walkDir(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkDir(full)))
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(full)
    }
  }
  return files
}

export async function searchVault(query: string, limit = 10, userId?: string): Promise<VaultSearchResult[]> {
  const config = await getVaultConfig(userId)
  if (!config) return []
  try {
    await access(config.vaultPath)
  } catch {
    return []
  }

  const files = await walkDir(config.vaultPath)
  const results: VaultSearchResult[] = []

  for (const filePath of files) {
    if (results.length >= limit) break
    try {
      const content = await readFile(filePath, "utf-8")
      if (!content.toLowerCase().includes(query.toLowerCase())) continue
      const relPath = path.relative(config.vaultPath, filePath).replace(/\\/g, "/")
      results.push({
        path: relPath,
        title: extractTitle(content, filePath),
        snippet: extractSnippet(content, query),
        frontmatter: parseFrontmatter(content),
      })
    } catch {
      // skip unreadable files
    }
  }

  return results
}

function isPathSafe(vaultRoot: string, resolvedPath: string): boolean {
  const rel = path.relative(vaultRoot, resolvedPath)
  return !rel.startsWith("..") && !path.isAbsolute(rel)
}

export async function getNoteContent(relativePath: string, userId?: string): Promise<string | null> {
  const config = await getVaultConfig(userId)
  if (!config) return null
  const vaultRoot = path.resolve(config.vaultPath)
  const resolved = path.resolve(vaultRoot, relativePath)
  if (!isPathSafe(vaultRoot, resolved)) return null
  try {
    return await readFile(resolved, "utf-8")
  } catch {
    return null
  }
}

const VALID_FILENAME = /^[a-zA-Z0-9 _-]+$/

export async function createNote(
  filename: string,
  entityType: string,
  entityId: string,
  content: string,
  userId?: string
): Promise<string> {
  if (!VALID_FILENAME.test(filename)) {
    throw new Error(`Invalid filename: ${filename}`)
  }
  const config = await getVaultConfig(userId)
  if (!config) throw new Error("Vault not configured")

  const hollyDir = path.join(config.vaultPath, "Holly")
  await mkdir(hollyDir, { recursive: true })

  const filePath = path.join(hollyDir, `${filename}.md`)

  try {
    await access(filePath)
    throw new Error("FILE_EXISTS")
  } catch (e) {
    // access() throws ENOENT  -> file does not exist, proceed
    // access() succeeds       -> FILE_EXISTS thrown above, code is undefined, rethrown here
    // access() throws other   -> permissions or I/O error, rethrown here
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e
  }

  const today = new Date().toISOString().slice(0, 10)
  const frontmatter = `---\nprm_entity: ${entityType}\nprm_id: ${entityId}\ncreated: ${today}\n---\n\n`

  await writeFile(filePath, frontmatter + content, "utf-8")

  const relativePath = `Holly/${filename}.md`

  await prisma.vaultNote.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    create: { entityType, entityId, vaultPath: relativePath, lastSyncAt: new Date() },
    update: { vaultPath: relativePath, lastSyncAt: new Date() },
  })

  return relativePath
}

export async function updateNote(relativePath: string, content: string, userId?: string): Promise<void> {
  const config = await getVaultConfig(userId)
  if (!config) throw new Error("Vault not configured")

  const vaultRoot = path.resolve(config.vaultPath)
  const resolved = path.resolve(vaultRoot, relativePath)
  if (!isPathSafe(vaultRoot, resolved)) throw new Error("Path traversal detected")

  let existing: string
  try {
    existing = await readFile(resolved, "utf-8")
  } catch {
    throw new Error("NOTE_NOT_FOUND")
  }

  const today = new Date().toISOString().slice(0, 10)
  const fmMatch = existing.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)/)

  let newContent: string
  if (fmMatch) {
    let fm = fmMatch[1]
    if (/last_updated:/.test(fm)) {
      fm = fm.replace(/last_updated: .+(\r?\n)/, `last_updated: ${today}$1`)
    } else {
      fm = fm.replace(/---\r?\n$/, `last_updated: ${today}\n---\n`)
    }
    newContent = fm + "\n" + content
  } else {
    newContent = content
  }

  await writeFile(resolved, newContent, "utf-8")

  const normalizedPath = relativePath.replace(/\\/g, "/")
  await prisma.vaultNote.updateMany({
    where: { vaultPath: normalizedPath },
    data: { lastSyncAt: new Date() },
  })
}
