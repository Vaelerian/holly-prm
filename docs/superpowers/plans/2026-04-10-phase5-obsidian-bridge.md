# Phase 5 Obsidian Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bidirectional Obsidian vault bridge - filesystem-based search/read, Holly-driven note creation/update, scheduled sync with workday/weekend cadences, and a Settings UI to configure it.

**Architecture:** All filesystem operations live in `lib/services/vault.ts`, validated against the configured vault root. Sync logic lives in `lib/services/vault-sync.ts`, which surfaces changed notes as data without auto-mutating PRM records. Five Holly API routes and three web session routes expose the functionality; the cron job drives periodic sync and caches results in Redis for briefing inclusion.

**Tech Stack:** Node.js `fs/promises`, Prisma (VaultConfig + VaultNote), Redis (vault:sync:latest TTL 7200), Next.js App Router, Zod, Tailwind CSS.

---

## File Map

**Create:**
- `prisma/migrations/20260410000004_phase5_vault/migration.sql` - SQL for VaultConfig and VaultNote tables
- `lib/services/vault.ts` - All filesystem operations (read + write)
- `lib/services/vault-sync.ts` - Sync scheduling and execution
- `app/api/holly/v1/vault/search/route.ts` - Holly: search vault
- `app/api/holly/v1/vault/note/route.ts` - Holly: GET / POST / PATCH note
- `app/api/holly/v1/vault/sync/route.ts` - Holly: on-demand sync
- `app/api/v1/vault/status/route.ts` - Web: accessibility check + config fetch
- `app/api/v1/vault/config/route.ts` - Web: save config
- `app/api/v1/vault/sync/route.ts` - Web: trigger sync from UI
- `__tests__/services/vault.test.ts` - Service tests (reader + writer)
- `__tests__/services/vault-sync.test.ts` - Sync service tests

**Modify:**
- `prisma/schema.prisma` - Add VaultConfig and VaultNote models
- `app/api/v1/cron/notify/route.ts` - Add vault sync step (step 4) after Gmail poll
- `lib/services/briefing.ts` - Add vaultUpdates field from Redis cache
- `app/(dashboard)/settings/page.tsx` - Add Obsidian Vault section

---

### Task 1: Schema and Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260410000004_phase5_vault/migration.sql`

- [ ] **Step 1: Add VaultConfig and VaultNote models to prisma/schema.prisma**

Append to the end of `prisma/schema.prisma`:

```prisma
model VaultConfig {
  id          String    @id @default(uuid())
  vaultPath   String
  workdayCron String    @default("0 * * * 1-5")
  weekendCron String    @default("0 */4 * * 0,6")
  lastSyncAt  DateTime?
  enabled     Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model VaultNote {
  id         String   @id @default(uuid())
  entityType String
  entityId   String
  vaultPath  String
  lastSyncAt DateTime
  createdAt  DateTime @default(now())

  @@unique([entityType, entityId])
}
```

- [ ] **Step 2: Create migration SQL file**

Create directory `prisma/migrations/20260410000004_phase5_vault/` and write `migration.sql`:

```sql
-- VaultConfig
CREATE TABLE "VaultConfig" (
    "id" TEXT NOT NULL,
    "vaultPath" TEXT NOT NULL,
    "workdayCron" TEXT NOT NULL DEFAULT '0 * * * 1-5',
    "weekendCron" TEXT NOT NULL DEFAULT '0 */4 * * 0,6',
    "lastSyncAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VaultConfig_pkey" PRIMARY KEY ("id")
);

-- VaultNote
CREATE TABLE "VaultNote" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "vaultPath" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VaultNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VaultNote_entityType_entityId_key" ON "VaultNote"("entityType", "entityId");
```

- [ ] **Step 3: Generate Prisma client**

```bash
npx prisma generate
```

Expected: "Generated Prisma Client" output with no errors.

- [ ] **Step 4: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260410000004_phase5_vault/migration.sql
git commit -m "feat: add VaultConfig and VaultNote schema for Phase 5"
```

---

### Task 2: Vault Reader

**Files:**
- Create: `lib/services/vault.ts`
- Create: `__tests__/services/vault.test.ts`

- [ ] **Step 1: Write failing tests for vault reader functions**

Create `__tests__/services/vault.test.ts`:

```ts
import { getVaultConfig, isVaultAccessible, searchVault, getNoteContent } from "@/lib/services/vault"
import { prisma } from "@/lib/db"
import * as fs from "node:fs/promises"

jest.mock("node:fs/promises", () => ({
  access: jest.fn(),
  readFile: jest.fn(),
  readdir: jest.fn(),
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}))

jest.mock("@/lib/db", () => ({
  prisma: {
    vaultConfig: { findFirst: jest.fn() },
    vaultNote: { upsert: jest.fn(), updateMany: jest.fn() },
  },
}))

const mockFs = fs as jest.Mocked<typeof fs>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

const fakeConfig = {
  id: "cfg1",
  vaultPath: "/vault",
  workdayCron: "0 * * * 1-5",
  weekendCron: "0 */4 * * 0,6",
  lastSyncAt: null,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe("getVaultConfig", () => {
  it("returns null when no config exists", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(null)
    expect(await getVaultConfig()).toBeNull()
  })

  it("returns config when one exists", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    expect(await getVaultConfig()).toEqual(fakeConfig)
  })
})

describe("isVaultAccessible", () => {
  it("returns false when no config", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(null)
    expect(await isVaultAccessible()).toBe(false)
  })

  it("returns true when vault path is accessible", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.access.mockResolvedValue(undefined)
    expect(await isVaultAccessible()).toBe(true)
  })

  it("returns false when vault path not accessible", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.access.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
    expect(await isVaultAccessible()).toBe(false)
  })
})

describe("searchVault", () => {
  it("returns empty array when no config", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(null)
    expect(await searchVault("query")).toEqual([])
  })

  it("returns empty array when vault inaccessible", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.access.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
    expect(await searchVault("query")).toEqual([])
  })

  it("returns matching results with title, path, snippet", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.access.mockResolvedValue(undefined)
    mockFs.readdir.mockResolvedValue([
      { name: "Note.md", isDirectory: () => false, isFile: () => true },
    ] as any)
    mockFs.readFile.mockResolvedValue("# Note Title\n\nHello query world" as any)
    const results = await searchVault("query")
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe("Note Title")
    expect(results[0].path).toBe("Note.md")
    expect(results[0].snippet).toContain("query")
  })

  it("uses filename as title when no H1 present", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.access.mockResolvedValue(undefined)
    mockFs.readdir.mockResolvedValue([
      { name: "My Note.md", isDirectory: () => false, isFile: () => true },
    ] as any)
    mockFs.readFile.mockResolvedValue("Some query content without heading" as any)
    const results = await searchVault("query")
    expect(results[0].title).toBe("My Note")
  })

  it("parses frontmatter fields", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.access.mockResolvedValue(undefined)
    mockFs.readdir.mockResolvedValue([
      { name: "Note.md", isDirectory: () => false, isFile: () => true },
    ] as any)
    mockFs.readFile.mockResolvedValue(
      "---\nprm_entity: contact\nprm_id: abc123\n---\n\n# Note\n\nquery here" as any
    )
    const results = await searchVault("query")
    expect(results[0].frontmatter).toEqual(expect.objectContaining({
      prm_entity: "contact",
      prm_id: "abc123",
    }))
  })
})

describe("getNoteContent", () => {
  it("returns null when no config", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(null)
    expect(await getNoteContent("Note.md")).toBeNull()
  })

  it("returns null when path traversal detected", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    expect(await getNoteContent("../../etc/passwd")).toBeNull()
  })

  it("returns content when file exists", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.readFile.mockResolvedValue("# Hello\n\ncontent here" as any)
    expect(await getNoteContent("Note.md")).toBe("# Hello\n\ncontent here")
  })

  it("returns null when file not found", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
    expect(await getNoteContent("missing.md")).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/services/vault.test.ts --no-coverage
```

Expected: FAIL - "Cannot find module '@/lib/services/vault'"

- [ ] **Step 3: Implement vault reader functions in lib/services/vault.ts**

```ts
import { prisma } from "@/lib/db"
import { access, readFile, readdir, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

export interface VaultSearchResult {
  path: string
  title: string
  snippet: string
  frontmatter: Record<string, string>
}

export async function getVaultConfig() {
  return prisma.vaultConfig.findFirst()
}

export async function isVaultAccessible(): Promise<boolean> {
  const config = await getVaultConfig()
  if (!config) return false
  try {
    await access(config.vaultPath)
    return true
  } catch {
    return false
  }
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const result: Record<string, string> = {}
  for (const line of match[1].split("\n")) {
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

export async function searchVault(query: string, limit = 10): Promise<VaultSearchResult[]> {
  const config = await getVaultConfig()
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

export async function getNoteContent(relativePath: string): Promise<string | null> {
  const config = await getVaultConfig()
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/services/vault.test.ts --no-coverage
```

Expected: PASS - all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/vault.ts __tests__/services/vault.test.ts
git commit -m "feat: add vault reader service (getVaultConfig, searchVault, getNoteContent)"
```

---

### Task 3: Note Writer

**Files:**
- Modify: `lib/services/vault.ts` (append createNote and updateNote)
- Modify: `__tests__/services/vault.test.ts` (append write tests)

- [ ] **Step 1: Append write operation tests to __tests__/services/vault.test.ts**

Append to the end of `__tests__/services/vault.test.ts`:

```ts
import { createNote, updateNote } from "@/lib/services/vault"

describe("createNote", () => {
  it("throws on invalid filename (path separators)", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    await expect(createNote("../bad/path", "contact", "id1", "content")).rejects.toThrow("Invalid filename")
  })

  it("throws on invalid filename (special chars)", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    await expect(createNote("note<>.md", "contact", "id1", "content")).rejects.toThrow("Invalid filename")
  })

  it("throws when vault not configured", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(null)
    await expect(createNote("John Smith", "contact", "id1", "content")).rejects.toThrow("Vault not configured")
  })

  it("throws FILE_EXISTS when note already exists", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.mkdir.mockResolvedValue(undefined as any)
    mockFs.access.mockResolvedValue(undefined) // file exists
    await expect(createNote("John Smith", "contact", "id1", "content")).rejects.toThrow("FILE_EXISTS")
  })

  it("creates note with frontmatter and inserts VaultNote row", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.mkdir.mockResolvedValue(undefined as any)
    mockFs.access.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
    mockFs.writeFile.mockResolvedValue(undefined)
    mockPrisma.vaultNote.upsert.mockResolvedValue({} as any)

    const result = await createNote("John Smith", "contact", "id1", "# John Smith\n\nContent")
    expect(result).toBe("Holly/John Smith.md")
    const written = (mockFs.writeFile as jest.Mock).mock.calls[0][1] as string
    expect(written).toContain("prm_entity: contact")
    expect(written).toContain("prm_id: id1")
    expect(written).toContain("# John Smith")
    expect(mockPrisma.vaultNote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ entityType: "contact", entityId: "id1", vaultPath: "Holly/John Smith.md" }),
      })
    )
  })
})

describe("updateNote", () => {
  it("throws when vault not configured", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(null)
    await expect(updateNote("Holly/Note.md", "new content")).rejects.toThrow("Vault not configured")
  })

  it("throws NOTE_NOT_FOUND when file missing", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.readFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
    await expect(updateNote("Holly/Note.md", "new content")).rejects.toThrow("NOTE_NOT_FOUND")
  })

  it("throws on path traversal attempt", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    await expect(updateNote("../../etc/passwd", "content")).rejects.toThrow("Path traversal")
  })

  it("preserves frontmatter and adds last_updated when frontmatter exists", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.readFile.mockResolvedValue(
      "---\nprm_entity: contact\nprm_id: id1\n---\n\nOld content" as any
    )
    mockFs.writeFile.mockResolvedValue(undefined)
    mockPrisma.vaultNote.updateMany.mockResolvedValue({ count: 1 } as any)

    await updateNote("Holly/Note.md", "New content")

    const written = (mockFs.writeFile as jest.Mock).mock.calls[0][1] as string
    expect(written).toContain("prm_entity: contact")
    expect(written).toContain("last_updated:")
    expect(written).toContain("New content")
    expect(mockPrisma.vaultNote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { vaultPath: "Holly/Note.md" } })
    )
  })

  it("updates existing last_updated when already in frontmatter", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.readFile.mockResolvedValue(
      "---\nprm_entity: contact\nlast_updated: 2025-01-01\n---\n\nOld content" as any
    )
    mockFs.writeFile.mockResolvedValue(undefined)
    mockPrisma.vaultNote.updateMany.mockResolvedValue({ count: 0 } as any)

    await updateNote("Holly/Note.md", "New content")

    const written = (mockFs.writeFile as jest.Mock).mock.calls[0][1] as string
    expect(written).not.toContain("2025-01-01")
    expect(written).toContain("last_updated: " + new Date().toISOString().slice(0, 10))
  })
})
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
npx jest __tests__/services/vault.test.ts --no-coverage
```

Expected: existing tests PASS, new createNote/updateNote tests FAIL - "createNote is not a function"

- [ ] **Step 3: Implement createNote and updateNote - append to lib/services/vault.ts**

```ts
const VALID_FILENAME = /^[a-zA-Z0-9 _-]+$/

export async function createNote(
  filename: string,
  entityType: string,
  entityId: string,
  content: string
): Promise<string> {
  if (!VALID_FILENAME.test(filename)) {
    throw new Error(`Invalid filename: ${filename}`)
  }
  const config = await getVaultConfig()
  if (!config) throw new Error("Vault not configured")

  const hollyDir = path.join(config.vaultPath, "Holly")
  await mkdir(hollyDir, { recursive: true })

  const filePath = path.join(hollyDir, `${filename}.md`)

  try {
    await access(filePath)
    throw new Error("FILE_EXISTS")
  } catch (e) {
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

export async function updateNote(relativePath: string, content: string): Promise<void> {
  const config = await getVaultConfig()
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
  const fmMatch = existing.match(/^(---\n[\s\S]*?\n---\n)/)

  let newContent: string
  if (fmMatch) {
    let fm = fmMatch[1]
    if (/last_updated:/.test(fm)) {
      fm = fm.replace(/last_updated: .+\n/, `last_updated: ${today}\n`)
    } else {
      fm = fm.replace(/---\n$/, `last_updated: ${today}\n---\n`)
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
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
npx jest __tests__/services/vault.test.ts --no-coverage
```

Expected: PASS - all 19 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/vault.ts __tests__/services/vault.test.ts
git commit -m "feat: add note writer to vault service (createNote, updateNote)"
```

---

### Task 4: Vault Sync Service

**Files:**
- Create: `lib/services/vault-sync.ts`
- Create: `__tests__/services/vault-sync.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/services/vault-sync.test.ts`:

```ts
import { shouldRunSync, runVaultSync } from "@/lib/services/vault-sync"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    vaultNote: { findMany: jest.fn() },
    vaultConfig: { update: jest.fn() },
  },
}))

jest.mock("@/lib/services/vault", () => ({
  getVaultConfig: jest.fn(),
  getNoteContent: jest.fn(),
}))

import { getVaultConfig, getNoteContent } from "@/lib/services/vault"
const mockGetVaultConfig = getVaultConfig as jest.MockedFunction<typeof getVaultConfig>
const mockGetNoteContent = getNoteContent as jest.MockedFunction<typeof getNoteContent>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

const baseConfig = {
  id: "cfg1",
  vaultPath: "/vault",
  workdayCron: "0 * * * 1-5",
  weekendCron: "0 * * * 0,6",
  lastSyncAt: null as Date | null,
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe("shouldRunSync", () => {
  it("returns false when disabled", () => {
    expect(shouldRunSync({ ...baseConfig, enabled: false })).toBe(false)
  })

  it("returns true when never synced", () => {
    expect(shouldRunSync({ ...baseConfig, lastSyncAt: null })).toBe(true)
  })

  it("returns true when hourly interval has elapsed (2 hours ago)", () => {
    const config = {
      ...baseConfig,
      workdayCron: "0 * * * 1-5",
      weekendCron: "0 * * * 0,6",
      lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    }
    expect(shouldRunSync(config)).toBe(true)
  })

  it("returns false when hourly interval has not elapsed (30 min ago)", () => {
    const config = {
      ...baseConfig,
      workdayCron: "0 * * * 1-5",
      weekendCron: "0 * * * 0,6",
      lastSyncAt: new Date(Date.now() - 30 * 60 * 1000),
    }
    expect(shouldRunSync(config)).toBe(false)
  })

  it("uses 4-hour interval for */4 cron", () => {
    const config = {
      ...baseConfig,
      workdayCron: "0 */4 * * 1-5",
      weekendCron: "0 */4 * * 0,6",
      lastSyncAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    }
    expect(shouldRunSync(config)).toBe(false)
  })
})

describe("runVaultSync", () => {
  it("returns empty result when no config", async () => {
    mockGetVaultConfig.mockResolvedValue(null)
    const result = await runVaultSync()
    expect(result).toEqual({ updatedNotes: [], errors: [] })
  })

  it("returns empty result when no vault notes", async () => {
    mockGetVaultConfig.mockResolvedValue(baseConfig as any)
    mockPrisma.vaultNote.findMany.mockResolvedValue([])
    mockPrisma.vaultConfig.update.mockResolvedValue({} as any)
    const result = await runVaultSync()
    expect(result.updatedNotes).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
    expect(mockPrisma.vaultConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cfg1" } })
    )
  })

  it("adds note to updatedNotes when last_updated is after lastSyncAt", async () => {
    mockGetVaultConfig.mockResolvedValue(baseConfig as any)
    const pastSync = new Date(Date.now() - 2 * 60 * 60 * 1000)
    mockPrisma.vaultNote.findMany.mockResolvedValue([
      {
        id: "n1",
        entityType: "contact",
        entityId: "c1",
        vaultPath: "Holly/John.md",
        lastSyncAt: pastSync,
        createdAt: new Date(),
      },
    ] as any)
    const today = new Date().toISOString().slice(0, 10)
    mockGetNoteContent.mockResolvedValue(
      `---\nprm_entity: contact\nprm_id: c1\nlast_updated: ${today}\n---\n\n# John\n\nContent`
    )
    mockPrisma.vaultConfig.update.mockResolvedValue({} as any)

    const result = await runVaultSync()
    expect(result.updatedNotes).toHaveLength(1)
    expect(result.updatedNotes[0].path).toBe("Holly/John.md")
    expect(result.errors).toHaveLength(0)
  })

  it("does not add note to updatedNotes when last_updated is before lastSyncAt", async () => {
    mockGetVaultConfig.mockResolvedValue(baseConfig as any)
    const recentSync = new Date()
    mockPrisma.vaultNote.findMany.mockResolvedValue([
      {
        id: "n1",
        entityType: "contact",
        entityId: "c1",
        vaultPath: "Holly/John.md",
        lastSyncAt: recentSync,
        createdAt: new Date(),
      },
    ] as any)
    mockGetNoteContent.mockResolvedValue(
      "---\nprm_entity: contact\nprm_id: c1\nlast_updated: 2026-01-01\n---\n\n# John\n\nContent"
    )
    mockPrisma.vaultConfig.update.mockResolvedValue({} as any)

    const result = await runVaultSync()
    expect(result.updatedNotes).toHaveLength(0)
  })

  it("adds error when note content not found", async () => {
    mockGetVaultConfig.mockResolvedValue(baseConfig as any)
    mockPrisma.vaultNote.findMany.mockResolvedValue([
      {
        id: "n1",
        entityType: "contact",
        entityId: "c1",
        vaultPath: "Holly/Gone.md",
        lastSyncAt: new Date(),
        createdAt: new Date(),
      },
    ] as any)
    mockGetNoteContent.mockResolvedValue(null)
    mockPrisma.vaultConfig.update.mockResolvedValue({} as any)

    const result = await runVaultSync()
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain("Holly/Gone.md")
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/services/vault-sync.test.ts --no-coverage
```

Expected: FAIL - "Cannot find module '@/lib/services/vault-sync'"

- [ ] **Step 3: Implement lib/services/vault-sync.ts**

```ts
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
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const result: Record<string, string> = {}
  for (const line of match[1].split("\n")) {
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
        const fileLastUpdated = new Date(lastUpdatedMatch[1].trim())
        if (!isNaN(fileLastUpdated.getTime()) && fileLastUpdated > note.lastSyncAt) {
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
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
npx jest __tests__/services/vault-sync.test.ts --no-coverage
```

Expected: PASS - all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/vault-sync.ts __tests__/services/vault-sync.test.ts
git commit -m "feat: add vault sync service (shouldRunSync, runVaultSync)"
```

---

### Task 5: Holly API Routes

**Files:**
- Create: `app/api/holly/v1/vault/search/route.ts`
- Create: `app/api/holly/v1/vault/note/route.ts`
- Create: `app/api/holly/v1/vault/sync/route.ts`

- [ ] **Step 1: Create the vault search route**

Create `app/api/holly/v1/vault/search/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { searchVault, isVaultAccessible } from "@/lib/services/vault"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }

  const accessible = await isVaultAccessible()
  if (!accessible) {
    return NextResponse.json({ error: "vault_not_configured" }, { status: 503 })
  }

  const q = req.nextUrl.searchParams.get("q") ?? ""
  const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10) || 10))

  if (!q.trim()) {
    return NextResponse.json({ results: [], query: q, total: 0 })
  }

  const results = await searchVault(q, limit)
  return NextResponse.json({ results, query: q, total: results.length })
}
```

- [ ] **Step 2: Create the vault note route (GET / POST / PATCH)**

Create `app/api/holly/v1/vault/note/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { getNoteContent, createNote, updateNote, isVaultAccessible } from "@/lib/services/vault"

async function checkAuth(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    const status = authResult.rateLimited ? 429 : 401
    const error = authResult.rateLimited ? "Rate limit exceeded" : "Unauthorized"
    const code = authResult.rateLimited ? "RATE_LIMITED" : "UNAUTHORIZED"
    const headers = authResult.rateLimited ? { "Retry-After": "60" } : undefined
    return { ok: false, response: NextResponse.json({ error, code }, { status, headers }) }
  }
  return { ok: true, response: null }
}

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req)
  if (!auth.ok) return auth.response!

  const accessible = await isVaultAccessible()
  if (!accessible) return NextResponse.json({ error: "vault_not_configured" }, { status: 503 })

  const notePath = req.nextUrl.searchParams.get("path")
  if (!notePath) return NextResponse.json({ error: "path parameter required" }, { status: 400 })

  const content = await getNoteContent(decodeURIComponent(notePath))
  if (content === null) return NextResponse.json({ error: "not_found" }, { status: 404 })

  return NextResponse.json({ path: notePath, content })
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req)
  if (!auth.ok) return auth.response!

  const accessible = await isVaultAccessible()
  if (!accessible) return NextResponse.json({ error: "vault_not_configured" }, { status: 503 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { filename, entityType, entityId, content } = body as Record<string, string>
  if (!filename || !entityType || !entityId || content === undefined) {
    return NextResponse.json({ error: "filename, entityType, entityId, content are required" }, { status: 400 })
  }

  try {
    const notePath = await createNote(filename, entityType, entityId, content)
    return NextResponse.json({ path: notePath }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === "FILE_EXISTS") return NextResponse.json({ error: "file_exists" }, { status: 409 })
    if (msg.startsWith("Invalid filename")) return NextResponse.json({ error: msg }, { status: 422 })
    throw e
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await checkAuth(req)
  if (!auth.ok) return auth.response!

  const accessible = await isVaultAccessible()
  if (!accessible) return NextResponse.json({ error: "vault_not_configured" }, { status: 503 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { path: notePath, content } = body as Record<string, string>
  if (!notePath || content === undefined) {
    return NextResponse.json({ error: "path and content are required" }, { status: 400 })
  }

  try {
    await updateNote(notePath, content)
    return NextResponse.json({ path: notePath })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === "NOTE_NOT_FOUND") return NextResponse.json({ error: "not_found" }, { status: 404 })
    if (msg.startsWith("Path traversal")) return NextResponse.json({ error: "invalid_path" }, { status: 400 })
    throw e
  }
}
```

- [ ] **Step 3: Create the vault sync route (Holly)**

Create `app/api/holly/v1/vault/sync/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { runVaultSync } from "@/lib/services/vault-sync"
import { getVaultConfig } from "@/lib/services/vault"

export async function POST(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }

  const config = await getVaultConfig()
  if (!config) return NextResponse.json({ error: "vault_not_configured" }, { status: 503 })

  const result = await runVaultSync()
  return NextResponse.json(result)
}
```

- [ ] **Step 4: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/holly/v1/vault/
git commit -m "feat: add Holly API vault routes (search, note CRUD, sync)"
```

---

### Task 6: Web API Routes

**Files:**
- Create: `app/api/v1/vault/status/route.ts`
- Create: `app/api/v1/vault/config/route.ts`
- Create: `app/api/v1/vault/sync/route.ts`

- [ ] **Step 1: Create the vault status route**

Create `app/api/v1/vault/status/route.ts`:

```ts
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
```

- [ ] **Step 2: Create the vault config save route**

Create `app/api/v1/vault/config/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const VALID_WORKDAY_CRONS = [
  "0 * * * 1-5",
  "0 */2 * * 1-5",
  "0 */4 * * 1-5",
  "0 9,17 * * 1-5",
  "0 9 * * 1-5",
]

const VALID_WEEKEND_CRONS = [
  "0 * * * 0,6",
  "0 */2 * * 0,6",
  "0 */4 * * 0,6",
  "0 9,17 * * 0,6",
  "0 9 * * 0,6",
]

const ConfigSchema = z.object({
  vaultPath: z.string().min(1),
  workdayCron: z.string().refine(v => VALID_WORKDAY_CRONS.includes(v), {
    message: "Invalid workday cron expression",
  }),
  weekendCron: z.string().refine(v => VALID_WEEKEND_CRONS.includes(v), {
    message: "Invalid weekend cron expression",
  }),
  enabled: z.boolean(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = ConfigSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })
  }

  const existing = await prisma.vaultConfig.findFirst()
  const config = existing
    ? await prisma.vaultConfig.update({
        where: { id: existing.id },
        data: parsed.data,
      })
    : await prisma.vaultConfig.create({ data: parsed.data })

  return NextResponse.json(config)
}
```

- [ ] **Step 3: Create the web vault sync route**

Create `app/api/v1/vault/sync/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getVaultConfig } from "@/lib/services/vault"
import { runVaultSync } from "@/lib/services/vault-sync"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const config = await getVaultConfig()
  if (!config) return NextResponse.json({ error: "vault_not_configured" }, { status: 503 })

  const result = await runVaultSync()
  return NextResponse.json(result)
}
```

- [ ] **Step 4: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/vault/
git commit -m "feat: add web vault API routes (status, config, sync)"
```

---

### Task 7: Cron Integration and Briefing Extension

**Files:**
- Modify: `app/api/v1/cron/notify/route.ts`
- Modify: `lib/services/briefing.ts`
- Modify: `__tests__/services/briefing.test.ts`

- [ ] **Step 1: Write failing test for briefing vaultUpdates field**

Open `__tests__/services/briefing.test.ts`. It currently mocks `@/lib/redis` but check if it does. If not, the test calls the real redis. Append this test to the file:

First, check if `@/lib/redis` is mocked in the existing briefing test. If not, add the mock. Then append:

```ts
// If not already at top of file, add:
jest.mock("@/lib/redis", () => ({
  redis: { get: jest.fn() },
}))
import { redis } from "@/lib/redis"
const mockRedis = redis as jest.Mocked<typeof redis>

// Add to describe block or at module level:
it("getBriefing includes vaultUpdates from redis cache", async () => {
  // Set up all existing prisma mocks (same values as existing test)
  mockPrisma.contact.findMany
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
  mockPrisma.interaction.findMany
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
  mockPrisma.actionItem.findMany
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
  mockPrisma.project.count.mockResolvedValue(0)
  mockPrisma.project.findMany.mockResolvedValue([])
  mockPrisma.task.count.mockResolvedValue(0)
  mockPrisma.task.findMany.mockResolvedValue([])

  const fakeUpdates = [{ path: "Holly/John.md", title: "John", snippet: "...", frontmatter: {} }]
  mockRedis.get
    .mockResolvedValueOnce(null) // gmail:recent
    .mockResolvedValueOnce(JSON.stringify({ updatedNotes: fakeUpdates, errors: [] })) // vault:sync:latest

  const result = await getBriefing()
  expect(result.vaultUpdates).toEqual(fakeUpdates)
})

it("getBriefing returns empty vaultUpdates when redis key absent", async () => {
  mockPrisma.contact.findMany
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
  mockPrisma.interaction.findMany
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
  mockPrisma.actionItem.findMany
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
  mockPrisma.project.count.mockResolvedValue(0)
  mockPrisma.project.findMany.mockResolvedValue([])
  mockPrisma.task.count.mockResolvedValue(0)
  mockPrisma.task.findMany.mockResolvedValue([])

  mockRedis.get
    .mockResolvedValueOnce(null) // gmail:recent
    .mockResolvedValueOnce(null) // vault:sync:latest absent

  const result = await getBriefing()
  expect(result.vaultUpdates).toEqual([])
})
```

**Important:** Read the existing briefing test first to check current mock setup, then integrate carefully so existing tests keep passing.

- [ ] **Step 2: Run briefing tests to see new tests fail**

```bash
npx jest __tests__/services/briefing.test.ts --no-coverage
```

Expected: existing test passes, new tests FAIL - "result.vaultUpdates is undefined"

- [ ] **Step 3: Add vault sync step to app/api/v1/cron/notify/route.ts**

Add these imports at the top of the file (after existing imports):

```ts
import { getVaultConfig } from "@/lib/services/vault"
import { shouldRunSync, runVaultSync } from "@/lib/services/vault-sync"
```

Add vault sync step after the Gmail poll block (after the `redis.set("gmail:recent", ...)` try/catch block):

```ts
  // 4. Vault sync
  try {
    const vaultConfig = await getVaultConfig()
    if (vaultConfig && shouldRunSync(vaultConfig)) {
      const result = await runVaultSync()
      await redis.set("vault:sync:latest", JSON.stringify(result), "EX", 7200)
    }
  } catch (e) {
    console.error("[cron/notify] vault sync failed", e)
  }
```

- [ ] **Step 4: Add vaultUpdates to lib/services/briefing.ts**

Add redis read block after the `recentEmails` block (around line 98-103). After the closing brace of the recentEmails try/catch, add:

```ts
  let vaultUpdates: unknown[] = []
  try {
    const vaultCached = await redis.get("vault:sync:latest")
    if (vaultCached) {
      const parsed = JSON.parse(vaultCached)
      vaultUpdates = parsed.updatedNotes ?? []
    }
  } catch {
    // Redis unavailable or invalid JSON - proceed with empty array
  }
```

Then add `vaultUpdates` to the return object (after `recentEmails`):

```ts
  return {
    overdueContacts,
    pendingFollowUps,
    openActionItems,
    openProjectsCount,
    tasksDueTodayCount,
    upcomingMilestones,
    myActionItems,
    followUpCandidates,
    recentInteractions,
    projectHealth,
    recentEmails,
    vaultUpdates,
    generatedAt: new Date(),
  }
```

- [ ] **Step 5: Run briefing tests to confirm all pass**

```bash
npx jest __tests__/services/briefing.test.ts --no-coverage
```

Expected: PASS - all tests pass including new vaultUpdates tests.

- [ ] **Step 6: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/api/v1/cron/notify/route.ts lib/services/briefing.ts __tests__/services/briefing.test.ts
git commit -m "feat: wire vault sync into cron and add vaultUpdates to briefing"
```

---

### Task 8: Settings UI

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Add vault config state and fetch to settings/page.tsx**

Read the current file, then add after the `googleStatus` state declaration (around line 25):

```ts
  const WORKDAY_OPTIONS = [
    { label: "Every hour", value: "0 * * * 1-5" },
    { label: "Every 2 hours", value: "0 */2 * * 1-5" },
    { label: "Every 4 hours", value: "0 */4 * * 1-5" },
    { label: "Twice daily (9am and 5pm)", value: "0 9,17 * * 1-5" },
    { label: "Once daily (9am)", value: "0 9 * * 1-5" },
  ]

  const WEEKEND_OPTIONS = [
    { label: "Every hour", value: "0 * * * 0,6" },
    { label: "Every 2 hours", value: "0 */2 * * 0,6" },
    { label: "Every 4 hours", value: "0 */4 * * 0,6" },
    { label: "Twice daily (9am and 5pm)", value: "0 9,17 * * 0,6" },
    { label: "Once daily (9am)", value: "0 9 * * 0,6" },
  ]

  const [vaultStatus, setVaultStatus] = useState<{
    configured: boolean
    accessible: boolean
    config: {
      vaultPath: string
      workdayCron: string
      weekendCron: string
      enabled: boolean
      lastSyncAt: string | null
    } | null
  }>({ configured: false, accessible: false, config: null })

  const [vaultPath, setVaultPath] = useState("")
  const [vaultWorkdayCron, setVaultWorkdayCron] = useState("0 * * * 1-5")
  const [vaultWeekendCron, setVaultWeekendCron] = useState("0 */4 * * 0,6")
  const [vaultEnabled, setVaultEnabled] = useState(true)
  const [vaultSaving, setVaultSaving] = useState(false)
  const [vaultSyncing, setVaultSyncing] = useState(false)
  const [vaultTestResult, setVaultTestResult] = useState<"idle" | "ok" | "fail">("idle")
```

Add vault status fetch in `useEffect` after the Google status fetch:

```ts
    fetch("/api/v1/vault/status").then(r => r.json()).then((data) => {
      setVaultStatus(data)
      if (data.config) {
        setVaultPath(data.config.vaultPath)
        setVaultWorkdayCron(data.config.workdayCron)
        setVaultWeekendCron(data.config.weekendCron)
        setVaultEnabled(data.config.enabled)
      }
    }).catch(() => {})
```

- [ ] **Step 2: Add vault helper functions before the return statement**

Add after the `disableNotifications` function:

```ts
  async function testVaultConnection() {
    setVaultTestResult("idle")
    const res = await fetch("/api/v1/vault/status")
    const data = await res.json()
    setVaultTestResult(data.accessible ? "ok" : "fail")
  }

  async function saveVaultConfig() {
    setVaultSaving(true)
    const res = await fetch("/api/v1/vault/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vaultPath,
        workdayCron: vaultWorkdayCron,
        weekendCron: vaultWeekendCron,
        enabled: vaultEnabled,
      }),
    })
    if (res.ok) {
      const saved = await res.json()
      setVaultStatus(prev => ({
        ...prev,
        configured: true,
        config: {
          vaultPath: saved.vaultPath,
          workdayCron: saved.workdayCron,
          weekendCron: saved.weekendCron,
          enabled: saved.enabled,
          lastSyncAt: saved.lastSyncAt,
        },
      }))
    }
    setVaultSaving(false)
  }

  async function triggerVaultSync() {
    setVaultSyncing(true)
    const res = await fetch("/api/v1/vault/sync", { method: "POST" })
    if (res.ok) {
      const result = await res.json()
      setVaultStatus(prev => ({
        ...prev,
        config: prev.config ? { ...prev.config, lastSyncAt: new Date().toISOString() } : null,
      }))
      console.info("[vault sync] result:", result)
    }
    setVaultSyncing(false)
  }
```

- [ ] **Step 3: Add Obsidian Vault section to the return JSX**

Add after the closing `</section>` of the Google Integration section (before the final `</div>`):

```tsx
      <section>
        <h2 className="text-base font-semibold text-[#c0c0d0] mb-1">Obsidian Vault</h2>
        <p className="text-sm text-[#666688] mb-4">Connect an Obsidian vault on the same server for bidirectional note sync.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[#c0c0d0] mb-1">Vault path</label>
            <div className="flex gap-2">
              <Input
                placeholder="/home/user/vault"
                value={vaultPath}
                onChange={e => setVaultPath(e.target.value)}
              />
              <Button variant="secondary" onClick={testVaultConnection}>
                Test
              </Button>
            </div>
            {vaultTestResult === "ok" && (
              <p className="text-xs text-[#00ff88] mt-1">Vault accessible</p>
            )}
            {vaultTestResult === "fail" && (
              <p className="text-xs text-red-400 mt-1">Vault not found or not readable</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#c0c0d0] mb-1">Work days (Mon-Fri)</label>
              <select
                value={vaultWorkdayCron}
                onChange={e => setVaultWorkdayCron(e.target.value)}
                className="w-full bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-3 py-2 text-sm text-[#c0c0d0] focus:outline-none focus:border-[rgba(0,255,136,0.4)]"
              >
                {WORKDAY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#c0c0d0] mb-1">Weekends</label>
              <select
                value={vaultWeekendCron}
                onChange={e => setVaultWeekendCron(e.target.value)}
                className="w-full bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-3 py-2 text-sm text-[#c0c0d0] focus:outline-none focus:border-[rgba(0,255,136,0.4)]"
              >
                {WEEKEND_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="vault-enabled"
              checked={vaultEnabled}
              onChange={e => setVaultEnabled(e.target.checked)}
              className="accent-[#00ff88]"
            />
            <label htmlFor="vault-enabled" className="text-sm text-[#c0c0d0]">Enable sync</label>
          </div>

          {vaultStatus.config?.lastSyncAt && (
            <p className="text-xs text-[#666688]">
              Last synced: {new Date(vaultStatus.config.lastSyncAt).toLocaleString("en-GB")}
            </p>
          )}
          {vaultStatus.configured && !vaultStatus.config?.lastSyncAt && (
            <p className="text-xs text-[#666688]">Last synced: Never</p>
          )}

          <div className="flex gap-2">
            <Button onClick={saveVaultConfig} disabled={vaultSaving || !vaultPath.trim()}>
              {vaultSaving ? "Saving..." : "Save"}
            </Button>
            {vaultStatus.configured && (
              <Button variant="secondary" onClick={triggerVaultSync} disabled={vaultSyncing}>
                {vaultSyncing ? "Syncing..." : "Sync now"}
              </Button>
            )}
          </div>
        </div>
      </section>
```

- [ ] **Step 4: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/settings/page.tsx
git commit -m "feat: add Obsidian Vault section to Settings page"
```

---

### Task 9: Push to Remote

- [ ] **Step 1: Verify clean state**

```bash
git status
git log --oneline -8
```

Expected: Working tree clean. Last 8 commits show the Phase 5 work.

- [ ] **Step 2: Push branch**

```bash
git push origin main
```

Expected: Branch pushed successfully.

---

## Self-Review Notes

**Spec coverage check:**
- VaultConfig + VaultNote schema: Task 1
- searchVault, getNoteContent: Task 2
- createNote, updateNote: Task 3
- shouldRunSync, runVaultSync: Task 4
- GET /api/holly/v1/vault/search: Task 5
- GET /api/holly/v1/vault/note: Task 5
- POST /api/holly/v1/vault/note: Task 5
- PATCH /api/holly/v1/vault/note: Task 5
- POST /api/holly/v1/vault/sync: Task 5
- GET /api/v1/vault/status: Task 6
- POST /api/v1/vault/config: Task 6
- POST /api/v1/vault/sync: Task 6
- Cron integration (step 4): Task 7
- Briefing vaultUpdates field: Task 7
- Settings Obsidian Vault section: Task 8

**Security coverage:**
- Path traversal prevention via `path.relative` + `startsWith("..")` check: vault.ts `isPathSafe()`
- Filename allowlist `/^[a-zA-Z0-9 _-]+$/` on createNote
- Vault root set by authenticated user only, never from request input
- Holly API routes: validateHollyRequest middleware
- Web routes: auth() session check

**Error handling coverage:**
- vault_not_configured -> 503 on all Holly vault routes
- Not found -> 404 on read/update
- Path traversal -> 400
- Invalid filename -> 422
- File already exists -> 409
- Sync failure logged, lastSyncAt not updated
- Redis unavailable -> empty vaultUpdates in briefing
