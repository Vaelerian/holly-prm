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
