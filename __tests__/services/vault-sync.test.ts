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

  it("uses 8-hour interval for 9,17 cron (twice daily)", () => {
    const config = {
      ...baseConfig,
      workdayCron: "0 9,17 * * 1-5",
      weekendCron: "0 9,17 * * 0,6",
      lastSyncAt: new Date(Date.now() - 7 * 60 * 60 * 1000), // 7 hours ago
    }
    expect(shouldRunSync(config)).toBe(false)
  })

  it("uses 24-hour interval for single-hour cron (once daily)", () => {
    const config = {
      ...baseConfig,
      workdayCron: "0 9 * * 1-5",
      weekendCron: "0 9 * * 0,6",
      lastSyncAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
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
    // lastSyncAt is 2 days ago
    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    mockPrisma.vaultNote.findMany.mockResolvedValue([
      {
        id: "n1",
        entityType: "contact",
        entityId: "c1",
        vaultPath: "Holly/John.md",
        lastSyncAt: twoDaysAgo,
        createdAt: new Date(),
      },
    ] as any)
    // last_updated is today (after lastSyncAt)
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

  it("does not report note as updated when last_updated equals lastSyncAt date", async () => {
    mockGetVaultConfig.mockResolvedValue(baseConfig as any)
    // lastSyncAt is today at noon
    const todayNoon = new Date()
    todayNoon.setHours(12, 0, 0, 0)
    const todayStr = todayNoon.toISOString().slice(0, 10)
    mockPrisma.vaultNote.findMany.mockResolvedValue([
      {
        id: "n1",
        entityType: "contact",
        entityId: "c1",
        vaultPath: "Holly/John.md",
        lastSyncAt: todayNoon,
        createdAt: new Date(),
      },
    ] as any)
    // last_updated is the same date as lastSyncAt
    mockGetNoteContent.mockResolvedValue(
      `---\nprm_entity: contact\nprm_id: c1\nlast_updated: ${todayStr}\n---\n\n# John\n\nContent`
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
