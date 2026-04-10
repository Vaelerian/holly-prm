import { getHealthAnalytics, getVelocityAnalytics, getCompletionAnalytics } from "@/lib/services/analytics"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    contact: { findMany: jest.fn() },
    project: { findMany: jest.fn() },
    actionItem: { findMany: jest.fn() },
    auditLog: { findMany: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("getHealthAnalytics", () => {
  it("returns contacts with trend based on AuditLog history", async () => {
    const contact = { id: "c1", name: "Alice", healthScore: 60, lastInteraction: new Date(), interactionFreqDays: 14 }
    mockPrisma.contact.findMany.mockResolvedValue([contact] as any)
    // AuditLog has an entry before the window showing healthScore was 90
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { entityId: "c1", diff: { after: { healthScore: 90 } }, occurredAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
    ] as any)

    const result = await getHealthAnalytics(30)

    expect(result.window).toBe(30)
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts[0].currentScore).toBe(60)
    expect(result.contacts[0].previousScore).toBe(90)
    expect(result.contacts[0].trend).toBe("declining")
  })

  it("returns insufficient_data when no AuditLog history exists", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c2", name: "Bob", healthScore: 80, lastInteraction: new Date(), interactionFreqDays: 21 },
    ] as any)
    mockPrisma.auditLog.findMany.mockResolvedValue([])

    const result = await getHealthAnalytics(30)

    expect(result.contacts[0].trend).toBe("insufficient_data")
    expect(result.contacts[0].previousScore).toBeNull()
  })
})

describe("getVelocityAnalytics", () => {
  it("computes weeklyRate and projectedCompletionDate from AuditLog", async () => {
    const project = {
      id: "p1", title: "Alpha", status: "active",
      tasks: [
        { id: "t1", status: "done" },
        { id: "t2", status: "done" },
        { id: "t3", status: "todo" },
        { id: "t4", status: "todo" },
      ],
    }
    mockPrisma.project.findMany.mockResolvedValue([project] as any)
    // t1 and t2 completed within window
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { entityId: "t1", diff: { after: { status: "done" } }, occurredAt: new Date() },
      { entityId: "t2", diff: { after: { status: "done" } }, occurredAt: new Date() },
    ] as any)

    const result = await getVelocityAnalytics(14)

    expect(result.projects[0].tasksTotal).toBe(4)
    expect(result.projects[0].tasksCompleted).toBe(2)
    expect(result.projects[0].completedInWindow).toBe(2)
    expect(result.projects[0].weeklyRate).toBeGreaterThan(0)
    expect(result.projects[0].projectedCompletionDate).toBeDefined()
  })

  it("returns null projectedCompletionDate when weeklyRate is 0", async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      { id: "p2", title: "Beta", status: "active", tasks: [{ id: "t5", status: "todo" }] },
    ] as any)
    mockPrisma.auditLog.findMany.mockResolvedValue([])

    const result = await getVelocityAnalytics(30)

    expect(result.projects[0].weeklyRate).toBe(0)
    expect(result.projects[0].projectedCompletionDate).toBeNull()
  })
})

describe("getCompletionAnalytics", () => {
  it("computes rates and byWeek breakdown", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { entityId: "a1", diff: { after: { status: "done" } }, occurredAt: new Date() },
    ] as any)
    mockPrisma.actionItem.findMany
      .mockResolvedValueOnce([{ id: "a1", assignedTo: "ian" }] as any) // completed items
      .mockResolvedValueOnce([]) // overdue todos

    const result = await getCompletionAnalytics(30)

    expect(result.window).toBe(30)
    expect(result.rates.ian).toBe(1)
    expect(result.rates.holly).toBe(0)
    expect(result.byWeek.length).toBeGreaterThan(0)
  })

  it("returns zero rates when no completed items", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([])
    mockPrisma.actionItem.findMany.mockResolvedValue([])

    const result = await getCompletionAnalytics(30)

    expect(result.rates.ian).toBe(0)
    expect(result.rates.holly).toBe(0)
    expect(result.byWeek.length).toBeGreaterThan(0)
  })
})
