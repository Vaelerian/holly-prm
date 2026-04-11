import { getBriefing } from "@/lib/services/briefing"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"

jest.mock("@/lib/db", () => ({
  prisma: {
    contact: { findMany: jest.fn() },
    interaction: { findMany: jest.fn() },
    actionItem: { findMany: jest.fn() },
    project: { count: jest.fn(), findMany: jest.fn() },
    task: { count: jest.fn(), findMany: jest.fn() },
  },
}))

jest.mock("@/lib/redis", () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockRedis = redis as jest.Mocked<typeof redis>

beforeEach(() => jest.clearAllMocks())

it("getBriefing returns all expected fields including new Phase 3 fields", async () => {
  // overdueContacts + followUpCandidates both use contact.findMany
  mockPrisma.contact.findMany
    .mockResolvedValueOnce([{ id: "c1", name: "Alice", healthScore: 40 }] as any)
    .mockResolvedValueOnce([
      { id: "c2", name: "Bob", healthScore: 100, lastInteraction: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), interactionFreqDays: 21 },
    ] as any)
  mockPrisma.interaction.findMany
    .mockResolvedValueOnce([{ id: "i1", followUpRequired: true }] as any) // pendingFollowUps
    .mockResolvedValueOnce([{ id: "i2", summary: "Chat", transcript: null }] as any) // recentInteractions
  mockPrisma.actionItem.findMany
    .mockResolvedValueOnce([{ id: "a1", status: "todo" }] as any) // openActionItems
    .mockResolvedValueOnce([{ id: "a2", status: "todo", assignedTo: "ian" }] as any) // myActionItems
  mockPrisma.project.count.mockResolvedValue(3 as any)
  mockPrisma.project.findMany.mockResolvedValue([
    { id: "p1", title: "Project A", status: "active", tasks: [{ status: "done" }, { status: "todo" }] },
  ] as any)
  mockPrisma.task.count.mockResolvedValue(2 as any)
  mockPrisma.task.findMany.mockResolvedValue([{ id: "t1", title: "Milestone 1", isMilestone: true }] as any)

  const result = await getBriefing()

  expect(result.overdueContacts).toHaveLength(1)
  expect(result.pendingFollowUps).toHaveLength(1)
  expect(result.openActionItems).toHaveLength(1)
  expect(result.openProjectsCount).toBe(3)
  expect(result.tasksDueTodayCount).toBe(2)
  expect(result.upcomingMilestones).toHaveLength(1)
  expect(result.myActionItems).toHaveLength(1)
  expect(result.recentInteractions).toHaveLength(1)
  expect(result.projectHealth).toHaveLength(1)
  expect(result.projectHealth[0]).toMatchObject({ id: "p1", tasksTotal: 2, tasksCompleted: 1, percentComplete: 50 })
  expect(result.generatedAt).toBeInstanceOf(Date)
})

it("followUpCandidates filters contacts approaching overdue threshold", async () => {
  const now = Date.now()
  // Contact with 21-day freq, last contact 18 days ago (> 80% of 21 = 16.8 days) - SHOULD appear
  const approaching = { id: "c3", name: "Carol", healthScore: 100, lastInteraction: new Date(now - 18 * 24 * 60 * 60 * 1000), interactionFreqDays: 21 }
  // Contact with 21-day freq, last contact 10 days ago (< 80%) - should NOT appear
  const notYet = { id: "c4", name: "Dave", healthScore: 100, lastInteraction: new Date(now - 10 * 24 * 60 * 60 * 1000), interactionFreqDays: 21 }

  mockPrisma.contact.findMany
    .mockResolvedValueOnce([]) // overdueContacts
    .mockResolvedValueOnce([approaching, notYet] as any) // candidates pool
  mockPrisma.interaction.findMany.mockResolvedValue([])
  mockPrisma.actionItem.findMany.mockResolvedValue([]).mockResolvedValue([])
  mockPrisma.project.count.mockResolvedValue(0 as any)
  mockPrisma.project.findMany.mockResolvedValue([])
  mockPrisma.task.count.mockResolvedValue(0 as any)
  mockPrisma.task.findMany.mockResolvedValue([])

  const result = await getBriefing()

  expect(result.followUpCandidates).toHaveLength(1)
  expect(result.followUpCandidates[0].id).toBe("c3")
})

it("vaultUpdates is populated from Redis cache", async () => {
  mockPrisma.contact.findMany.mockResolvedValue([])
  mockPrisma.interaction.findMany.mockResolvedValue([])
  mockPrisma.actionItem.findMany.mockResolvedValue([])
  mockPrisma.project.count.mockResolvedValue(0 as any)
  mockPrisma.project.findMany.mockResolvedValue([])
  mockPrisma.task.count.mockResolvedValue(0 as any)
  mockPrisma.task.findMany.mockResolvedValue([])

  const updatedNotes = [
    { path: "Holly/Alice.md", entityType: "contact", entityId: "c1" },
    { path: "Holly/Bob.md", entityType: "contact", entityId: "c2" },
  ]
  mockRedis.get.mockImplementation(async (key: string) => {
    if (key === "vault:sync:latest") return JSON.stringify({ updatedNotes, errors: [] })
    return null
  })

  const result = await getBriefing()

  expect(result.vaultUpdates).toHaveLength(2)
  expect(result.vaultUpdates[0]).toMatchObject({ path: "Holly/Alice.md" })
})

it("vaultUpdates is empty when Redis cache is absent", async () => {
  mockPrisma.contact.findMany.mockResolvedValue([])
  mockPrisma.interaction.findMany.mockResolvedValue([])
  mockPrisma.actionItem.findMany.mockResolvedValue([])
  mockPrisma.project.count.mockResolvedValue(0 as any)
  mockPrisma.project.findMany.mockResolvedValue([])
  mockPrisma.task.count.mockResolvedValue(0 as any)
  mockPrisma.task.findMany.mockResolvedValue([])

  mockRedis.get.mockResolvedValue(null)

  const result = await getBriefing()

  expect(result.vaultUpdates).toEqual([])
})

it("vaultUpdates is empty when Redis throws", async () => {
  mockPrisma.contact.findMany.mockResolvedValue([])
  mockPrisma.interaction.findMany.mockResolvedValue([])
  mockPrisma.actionItem.findMany.mockResolvedValue([])
  mockPrisma.project.count.mockResolvedValue(0 as any)
  mockPrisma.project.findMany.mockResolvedValue([])
  mockPrisma.task.count.mockResolvedValue(0 as any)
  mockPrisma.task.findMany.mockResolvedValue([])
  mockRedis.get.mockRejectedValue(new Error("Redis connection refused"))

  const result = await getBriefing()

  expect(result.vaultUpdates).toEqual([])
})

it("getBriefing scopes all queries to the given userId", async () => {
  mockPrisma.contact.findMany.mockResolvedValue([])
  mockPrisma.interaction.findMany.mockResolvedValue([])
  mockPrisma.actionItem.findMany.mockResolvedValue([])
  mockPrisma.project.count.mockResolvedValue(0 as any)
  mockPrisma.project.findMany.mockResolvedValue([])
  mockPrisma.task.count.mockResolvedValue(0 as any)
  mockPrisma.task.findMany.mockResolvedValue([])

  await getBriefing("user-xyz")

  const overdueCall = mockPrisma.contact.findMany.mock.calls[0][0]
  expect(overdueCall?.where).toMatchObject({ userId: "user-xyz" })
})
