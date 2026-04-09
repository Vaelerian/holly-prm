import { getBriefing } from "@/lib/services/briefing"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    contact: { findMany: jest.fn() },
    interaction: { findMany: jest.fn() },
    actionItem: { findMany: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

it("getBriefing returns overdue contacts, pending follow-ups, and open action items", async () => {
  mockPrisma.contact.findMany.mockResolvedValue([{ id: "c1", name: "Alice", healthScore: 40 }] as any)
  mockPrisma.interaction.findMany.mockResolvedValue([{ id: "i1", followUpRequired: true }] as any)
  mockPrisma.actionItem.findMany.mockResolvedValue([{ id: "a1", status: "todo" }] as any)

  const result = await getBriefing()

  expect(result.overdueContacts).toHaveLength(1)
  expect(result.pendingFollowUps).toHaveLength(1)
  expect(result.openActionItems).toHaveLength(1)
  expect(result.generatedAt).toBeInstanceOf(Date)
})
