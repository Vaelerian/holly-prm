import { shouldRunSync, runVaultSync } from "@/lib/services/vault-sync"
import { prisma } from "@/lib/db"
import * as vaultCouch from "@/lib/services/vault-couch"
import * as vaultCrypto from "@/lib/services/vault-crypto"

jest.mock("@/lib/db", () => ({
  prisma: {
    vaultConfig: { update: jest.fn() },
  },
}))

jest.mock("@/lib/services/vault", () => ({
  getVaultConfig: jest.fn(),
  parseFrontmatter: jest.fn((content: string) => ({ frontmatter: {}, body: content })),
  extractTitle: jest.fn((body: string, path: string) => path.split("/").pop()?.replace(/\.md$/, "") ?? path),
  VaultSearchResult: undefined,
}))

jest.mock("@/lib/services/vault-couch")
jest.mock("@/lib/services/vault-crypto")

import { getVaultConfig } from "@/lib/services/vault"
const mockGetVaultConfig = getVaultConfig as jest.MockedFunction<typeof getVaultConfig>
const mockCouch = vaultCouch as jest.Mocked<typeof vaultCouch>
const mockCrypto = vaultCrypto as jest.Mocked<typeof vaultCrypto>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

const baseConfig = {
  id: "cfg1",
  workdayCron: "0 * * * 1-5",
  weekendCron: "0 * * * 0,6",
  lastSyncAt: null as Date | null,
  lastSeq: "0",
  e2ePassphrase: "cold-water",
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const ENC_PREFIX = "/\\:%="

describe("shouldRunSync", () => {
  it("returns false when disabled", () => {
    expect(shouldRunSync({ ...baseConfig, enabled: false })).toBe(false)
  })

  it("returns true when never synced", () => {
    expect(shouldRunSync({ ...baseConfig, lastSyncAt: null })).toBe(true)
  })

  it("returns true when hourly interval has elapsed (2 hours ago)", () => {
    const config = { ...baseConfig, lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }
    expect(shouldRunSync(config)).toBe(true)
  })

  it("returns false when hourly interval has not elapsed (30 min ago)", () => {
    const config = { ...baseConfig, lastSyncAt: new Date(Date.now() - 30 * 60 * 1000) }
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

  it("uses 8-hour interval for 9,17 cron (twice daily)", () => {
    const config = {
      ...baseConfig,
      workdayCron: "0 9,17 * * 1-5",
      weekendCron: "0 9,17 * * 0,6",
      lastSyncAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
    }
    expect(shouldRunSync(config)).toBe(false)
  })

  it("uses 24-hour interval for single-hour cron (once daily)", () => {
    const config = {
      ...baseConfig,
      workdayCron: "0 9 * * 1-5",
      weekendCron: "0 9 * * 0,6",
      lastSyncAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
    }
    expect(shouldRunSync(config)).toBe(false)
  })
})

describe("runVaultSync", () => {
  it("returns early when no config", async () => {
    mockGetVaultConfig.mockResolvedValue(null)
    const result = await runVaultSync()
    expect(result).toEqual({ updatedNotes: [], errors: [] })
    expect(mockCouch.couchChanges).not.toHaveBeenCalled()
  })

  it("returns early when disabled", async () => {
    mockGetVaultConfig.mockResolvedValue({ ...baseConfig, enabled: false } as any)
    const result = await runVaultSync()
    expect(result).toEqual({ updatedNotes: [], errors: [] })
    expect(mockCouch.couchDbAccessible).not.toHaveBeenCalled()
  })

  it("returns early when CouchDB inaccessible", async () => {
    mockGetVaultConfig.mockResolvedValue(baseConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(false)
    const result = await runVaultSync()
    expect(result).toEqual({ updatedNotes: [], errors: [] })
    expect(mockCouch.couchChanges).not.toHaveBeenCalled()
  })

  it("returns changed notes from _changes feed using doc.path", async () => {
    mockGetVaultConfig.mockResolvedValue(baseConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCrypto.deriveKey.mockResolvedValue({} as CryptoKey)
    mockCouch.couchChanges.mockResolvedValue({
      results: [{
        id: "f:abc123",
        seq: "6-xyz",
        doc: { _id: "f:abc123", path: ENC_PREFIX + "enc_path_b64", data: "enc_data", type: "newnote" },
      }],
      last_seq: "6-xyz",
    })
    mockCrypto.decryptString
      .mockResolvedValueOnce("People/Jane.md")
      .mockResolvedValueOnce("# Jane\n\nContent about Jane")
    mockPrisma.vaultConfig.update.mockResolvedValue({} as any)

    const result = await runVaultSync()
    expect(result.updatedNotes).toHaveLength(1)
    expect(result.updatedNotes[0].path).toBe("People/Jane.md")
    expect(result.updatedNotes[0].couchDbId).toBe("f:abc123")
    expect(mockPrisma.vaultConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastSeq: "6-xyz" }) })
    )
    expect(result.errors).toHaveLength(0)
  })

  it("skips documents without the encrypted prefix in path", async () => {
    mockGetVaultConfig.mockResolvedValue(baseConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCrypto.deriveKey.mockResolvedValue({} as CryptoKey)
    mockCouch.couchChanges.mockResolvedValue({
      results: [{ id: "f:meta", seq: "6-x", doc: { _id: "f:meta", path: "plainpath" } }],
      last_seq: "6-x",
    })
    mockPrisma.vaultConfig.update.mockResolvedValue({} as any)

    const result = await runVaultSync()
    expect(result.updatedNotes).toHaveLength(0)
    expect(mockCrypto.decryptString).not.toHaveBeenCalled()
  })

  it("skips non-.md paths", async () => {
    mockGetVaultConfig.mockResolvedValue(baseConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCrypto.deriveKey.mockResolvedValue({} as CryptoKey)
    mockCouch.couchChanges.mockResolvedValue({
      results: [{ id: "f:enc", seq: "6-x", doc: { _id: "f:enc", path: ENC_PREFIX + "enc", data: "d" } }],
      last_seq: "6-x",
    })
    mockCrypto.decryptString.mockResolvedValueOnce(".obsidian/config")
    mockPrisma.vaultConfig.update.mockResolvedValue({} as any)

    const result = await runVaultSync()
    expect(result.updatedNotes).toHaveLength(0)
  })

  it("records error when content decryption fails", async () => {
    mockGetVaultConfig.mockResolvedValue(baseConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCrypto.deriveKey.mockResolvedValue({} as CryptoKey)
    mockCouch.couchChanges.mockResolvedValue({
      results: [{ id: "f:bad", seq: "6-x", doc: { _id: "f:bad", path: ENC_PREFIX + "enc", data: "garbage" } }],
      last_seq: "6-x",
    })
    mockCrypto.decryptString
      .mockResolvedValueOnce("Holly/Note.md")  // path decrypts OK
      .mockRejectedValueOnce(new Error("decryption failed"))  // content fails
    mockPrisma.vaultConfig.update.mockResolvedValue({} as any)

    const result = await runVaultSync()
    expect(result.updatedNotes).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain("f:bad")
  })

  it("records error when data field is missing on a .md document", async () => {
    mockGetVaultConfig.mockResolvedValue(baseConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCrypto.deriveKey.mockResolvedValue({} as CryptoKey)
    mockCouch.couchChanges.mockResolvedValue({
      results: [{ id: "f:nodata", seq: "6-x", doc: { _id: "f:nodata", path: ENC_PREFIX + "enc" } }],
      last_seq: "6-x",
    })
    mockCrypto.decryptString.mockResolvedValueOnce("Holly/Note.md")
    mockPrisma.vaultConfig.update.mockResolvedValue({} as any)

    const result = await runVaultSync()
    expect(result.updatedNotes).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain("f:nodata")
  })

  it("skips deleted changes", async () => {
    mockGetVaultConfig.mockResolvedValue(baseConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCrypto.deriveKey.mockResolvedValue({} as CryptoKey)
    mockCouch.couchChanges.mockResolvedValue({
      results: [{ id: "f:del", seq: "6-x", deleted: true }],
      last_seq: "6-x",
    })
    mockPrisma.vaultConfig.update.mockResolvedValue({} as any)

    const result = await runVaultSync()
    expect(result.updatedNotes).toHaveLength(0)
  })
})
