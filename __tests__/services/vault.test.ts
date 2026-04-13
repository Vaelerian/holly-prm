import { getVaultConfig, isVaultAccessible, searchVault, getNoteContent } from "@/lib/services/vault"
import { prisma } from "@/lib/db"
import * as vaultCouch from "@/lib/services/vault-couch"
import * as vaultCrypto from "@/lib/services/vault-crypto"

jest.mock("@/lib/db", () => ({
  prisma: { vaultConfig: { findFirst: jest.fn() } },
}))
jest.mock("@/lib/services/vault-couch")
jest.mock("@/lib/services/vault-crypto")

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockCouch = vaultCouch as jest.Mocked<typeof vaultCouch>
const mockCrypto = vaultCrypto as jest.Mocked<typeof vaultCrypto>

const fakeConfig = {
  id: "cfg1",
  couchDbUrl: "http://localhost:5984",
  couchDbDatabase: "obsidian",
  couchDbUsername: "vaelerian",
  couchDbPassword: "pass",
  e2ePassphrase: "cold-water",
  workdayCron: "0 * * * 1-5",
  weekendCron: "0 */4 * * 0,6",
  lastSyncAt: null,
  lastSeq: "0",
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeKey = {} as CryptoKey
const ENC_PREFIX = "/\\:%="

beforeEach(() => {
  jest.clearAllMocks()
  mockCrypto.deriveKey.mockResolvedValue(fakeKey)
})

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

  it("returns true when CouchDB is reachable", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    expect(await isVaultAccessible()).toBe(true)
  })

  it("returns false when CouchDB unreachable", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(false)
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
    mockCouch.couchDbAccessible.mockResolvedValue(false)
    expect(await searchVault("query")).toEqual([])
  })

  it("returns matching notes after decryption", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCouch.couchAllDocs.mockResolvedValue({
      rows: [{
        id: "f:abc123",
        key: "f:abc123",
        value: { rev: "1-abc" },
        doc: { _id: "f:abc123", path: ENC_PREFIX + "enc_path_b64", data: "enc_data_1", type: "newnote" },
      }],
      total_rows: 1,
      offset: 0,
    })
    mockCrypto.decryptString
      .mockResolvedValueOnce("People/John Smith.md")
      .mockResolvedValueOnce("# John Smith\n\nJohn discussed the query topic.")
    const results = await searchVault("query")
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe("People/John Smith.md")
    expect(results[0].title).toBe("John Smith")
    expect(results[0].snippet).toContain("query")
    expect(results[0].couchDbId).toBe("f:abc123")
  })

  it("skips documents where path decryption fails", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCouch.couchAllDocs.mockResolvedValue({
      rows: [{ id: "f:bad", key: "f:bad", value: { rev: "1-abc" }, doc: { _id: "f:bad", path: ENC_PREFIX + "bad", data: "x" } }],
      total_rows: 1,
      offset: 0,
    })
    mockCrypto.decryptString.mockRejectedValue(new Error("decryption failed"))
    const results = await searchVault("query")
    expect(results).toEqual([])
  })

  it("skips docs without the LiveSync encrypted prefix in path", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCouch.couchAllDocs.mockResolvedValue({
      rows: [{ id: "f:meta", key: "f:meta", value: { rev: "1-a" }, doc: { _id: "f:meta", path: "plainpath" } }],
      total_rows: 1,
      offset: 0,
    })
    const results = await searchVault("query")
    expect(results).toEqual([])
    expect(mockCrypto.decryptString).not.toHaveBeenCalled()
  })

  it("skips non-.md paths", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCouch.couchAllDocs.mockResolvedValue({
      rows: [{ id: "f:enc", key: "f:enc", value: { rev: "1-a" }, doc: { _id: "f:enc", path: ENC_PREFIX + "enc", data: "d" } }],
      total_rows: 1,
      offset: 0,
    })
    mockCrypto.decryptString.mockResolvedValueOnce(".obsidian/config")
    const results = await searchVault("query")
    expect(results).toEqual([])
  })

  it("uses filename as title when no H1", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCouch.couchAllDocs.mockResolvedValue({
      rows: [{ id: "f:enc", key: "f:enc", value: { rev: "1-a" }, doc: { _id: "f:enc", path: ENC_PREFIX + "enc", data: "d" } }],
      total_rows: 1,
      offset: 0,
    })
    mockCrypto.decryptString
      .mockResolvedValueOnce("Notes/My Note.md")
      .mockResolvedValueOnce("Some query content without heading")
    const results = await searchVault("query")
    expect(results[0].title).toBe("My Note")
  })

  it("parses frontmatter from decrypted content", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCouch.couchAllDocs.mockResolvedValue({
      rows: [{ id: "f:enc", key: "f:enc", value: { rev: "1-a" }, doc: { _id: "f:enc", path: ENC_PREFIX + "enc", data: "d" } }],
      total_rows: 1,
      offset: 0,
    })
    mockCrypto.decryptString
      .mockResolvedValueOnce("Notes/Note.md")
      .mockResolvedValueOnce("---\nprm_entity: contact\nprm_id: abc123\n---\n\n# Note\n\nquery here")
    const results = await searchVault("query")
    expect(results[0].frontmatter).toEqual(expect.objectContaining({ prm_entity: "contact", prm_id: "abc123" }))
  })

  it("respects the limit parameter", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCouch.couchAllDocs.mockResolvedValue({
      rows: [
        { id: "f:1", key: "f:1", value: { rev: "1-a" }, doc: { _id: "f:1", path: ENC_PREFIX + "e1", data: "d1" } },
        { id: "f:2", key: "f:2", value: { rev: "1-a" }, doc: { _id: "f:2", path: ENC_PREFIX + "e2", data: "d2" } },
        { id: "f:3", key: "f:3", value: { rev: "1-a" }, doc: { _id: "f:3", path: ENC_PREFIX + "e3", data: "d3" } },
      ],
      total_rows: 3,
      offset: 0,
    })
    // Only 4 calls consumed: limit=2 means rows 1 and 2 are processed, row 3 is skipped
    mockCrypto.decryptString
      .mockResolvedValueOnce("A.md").mockResolvedValueOnce("query content")
      .mockResolvedValueOnce("B.md").mockResolvedValueOnce("query content")
    const results = await searchVault("query", 2)
    expect(results).toHaveLength(2)
    expect(mockCrypto.decryptString).toHaveBeenCalledTimes(4)
  })
})

describe("getNoteContent", () => {
  it("returns decrypted content", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchGet.mockResolvedValue({ _id: "f:abc", data: "enc_data" })
    mockCrypto.decryptString.mockResolvedValue("# Note content")
    const result = await getNoteContent("f:abc")
    expect(result).toBe("# Note content")
  })

  it("returns null when document not found", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchGet.mockRejectedValue(new Error("not found"))
    expect(await getNoteContent("f:missing")).toBeNull()
  })

  it("returns null when no config", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(null)
    expect(await getNoteContent("f:any")).toBeNull()
  })

  it("returns null when document has no data field", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchGet.mockResolvedValue({ _id: "f:abc", type: "newnote" })
    const result = await getNoteContent("f:abc")
    expect(result).toBeNull()
  })
})
