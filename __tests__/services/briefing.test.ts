import { getBriefing } from "@/lib/services/briefing"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    contact: { findMany: jest.fn() },
    interaction: { findMany: jest.fn() },
    actionItem: { findMany: jest.fn() },
    project: { count: jest.fn() },
    task: { count: jest.fn(), findMany: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

it("getBriefing returns overdue contacts, pending follow-ups, open action items, projects, tasks, milestones, and my action items", async () => {
  mockPrisma.contact.findMany.mockResolvedValue([{ id: "c1", name: "Alice", healthScore: 40 }] as any)
  mockPrisma.interaction.findMany.mockResolvedValue([{ id: "i1", followUpRequired: true }] as any)
  mockPrisma.actionItem.findMany
    .mockResolvedValueOnce([{ id: "a1", status: "todo" }] as any)
    .mockResolvedValueOnce([{ id: "a2", status: "todo", assignedTo: "ian" }] as any)
  mockPrisma.project.count.mockResolvedValue(3 as any)
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
  expect(result.generatedAt).toBeInstanceOf(Date)
})
