import { getVaultConfig, isVaultAccessible, searchVault, getNoteContent, createNote, updateNote } from "@/lib/services/vault"
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

  it("parses frontmatter from CRLF line-ending files", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.access.mockResolvedValue(undefined)
    mockFs.readdir.mockResolvedValue([
      { name: "Note.md", isDirectory: () => false, isFile: () => true },
    ] as any)
    mockFs.readFile.mockResolvedValue(
      "---\r\nprm_entity: contact\r\nprm_id: crlf123\r\n---\r\n\r\n# Note\r\n\r\nquery here" as any
    )
    const results = await searchVault("query")
    expect(results[0].frontmatter).toEqual(expect.objectContaining({
      prm_entity: "contact",
      prm_id: "crlf123",
    }))
  })

  it("respects the limit parameter", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.access.mockResolvedValue(undefined)
    mockFs.readdir.mockResolvedValue([
      { name: "A.md", isDirectory: () => false, isFile: () => true },
      { name: "B.md", isDirectory: () => false, isFile: () => true },
      { name: "C.md", isDirectory: () => false, isFile: () => true },
    ] as any)
    mockFs.readFile.mockResolvedValue("# Title\n\nquery content" as any)
    const results = await searchVault("query", 2)
    expect(results).toHaveLength(2)
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
    mockFs.access.mockResolvedValue(undefined) // file exists - access does NOT throw
    await expect(createNote("John Smith", "contact", "id1", "content")).rejects.toThrow("FILE_EXISTS")
  })

  it("rethrows unexpected access errors (e.g. EACCES)", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.mkdir.mockResolvedValue(undefined as any)
    mockFs.access.mockRejectedValue(Object.assign(new Error("EACCES"), { code: "EACCES" }))
    await expect(createNote("John Smith", "contact", "id1", "content")).rejects.toThrow("EACCES")
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

  it("replaces file content entirely when no frontmatter present", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockFs.readFile.mockResolvedValue("No frontmatter here, just plain content" as any)
    mockFs.writeFile.mockResolvedValue(undefined)
    mockPrisma.vaultNote.updateMany.mockResolvedValue({ count: 0 } as any)

    await updateNote("Holly/Note.md", "New content")

    const written = (mockFs.writeFile as jest.Mock).mock.calls[0][1] as string
    expect(written).toBe("New content")
  })
})
