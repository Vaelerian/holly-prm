import { createInteraction, listInteractions } from "@/lib/services/interactions"
import { prisma } from "@/lib/db"
import { computeHealthScore } from "@/lib/health-score"
import { publishSseEvent } from "@/lib/sse-events"

jest.mock("@/lib/db", () => ({
  prisma: {
    interaction: { create: jest.fn(), findMany: jest.fn() },
    contact: { findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}))

jest.mock("@/lib/health-score", () => ({
  computeHealthScore: jest.fn().mockReturnValue(75),
}))

jest.mock("@/lib/sse-events", () => ({
  publishSseEvent: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("createInteraction", () => {
  it("creates interaction and updates contact health score", async () => {
    const input = {
      contactId: "contact-1",
      type: "call" as const,
      direction: "outbound" as const,
      summary: "Caught up",
      outcome: null,
      followUpRequired: false,
      followUpDate: null,
      callbackExpected: false,
      location: null,
      duration: null,
      transcript: null,
      occurredAt: "2026-04-09T10:00:00Z",
    }
    const created = { id: "int-1", ...input, occurredAt: new Date(input.occurredAt) }
    mockPrisma.interaction.create.mockResolvedValue(created as any)
    mockPrisma.contact.findUnique.mockResolvedValue({ interactionFreqDays: 30, name: "Alice" } as any)
    mockPrisma.contact.update.mockResolvedValue({} as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createInteraction(input, "ian")

    expect(mockPrisma.interaction.create).toHaveBeenCalled()
    expect(mockPrisma.contact.update).toHaveBeenCalledWith({
      where: { id: "contact-1" },
      data: { lastInteraction: created.occurredAt, healthScore: 75 },
    })
    expect(computeHealthScore).toHaveBeenCalledWith(created.occurredAt, 30)
  })

  it("stores transcript when provided", async () => {
    const input = {
      contactId: "contact-1",
      type: "call" as const,
      direction: "outbound" as const,
      summary: "Discussed project",
      outcome: null,
      followUpRequired: false,
      followUpDate: null,
      callbackExpected: false,
      location: null,
      duration: null,
      transcript: "Ian: Hey\nHolly: Hi",
      occurredAt: "2026-04-09T10:00:00Z",
    }
    const created = { id: "int-2", ...input, occurredAt: new Date(input.occurredAt) }
    mockPrisma.interaction.create.mockResolvedValue(created as any)
    mockPrisma.contact.findUnique.mockResolvedValue({ interactionFreqDays: null, name: "Alice" } as any)
    mockPrisma.contact.update.mockResolvedValue({} as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createInteraction(input, "holly")

    const createCall = (mockPrisma.interaction.create as jest.Mock).mock.calls[0][0]
    expect(createCall.data.transcript).toBe("Ian: Hey\nHolly: Hi")
  })

  it("publishes interaction.created SSE event", async () => {
    const input = {
      contactId: "contact-1",
      type: "meeting" as const,
      direction: "outbound" as const,
      summary: "Team standup",
      outcome: null,
      followUpRequired: false,
      followUpDate: null,
      callbackExpected: false,
      location: null,
      duration: null,
      transcript: null,
      occurredAt: "2026-04-09T10:00:00Z",
    }
    mockPrisma.interaction.create.mockResolvedValue({ id: "int-3", ...input, createdByHolly: false, occurredAt: new Date(input.occurredAt) } as any)
    mockPrisma.contact.findUnique.mockResolvedValue({ interactionFreqDays: null, name: "Alice" } as any)
    mockPrisma.contact.update.mockResolvedValue({} as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createInteraction(input, "ian")

    expect(publishSseEvent).toHaveBeenCalledWith(
      "interaction.created",
      expect.objectContaining({ contactId: "contact-1", type: "meeting" })
    )
  })
})

describe("listInteractions", () => {
  it("filters by contactId when provided", async () => {
    mockPrisma.interaction.findMany.mockResolvedValue([])
    await listInteractions({ contactId: "contact-1" })
    expect(mockPrisma.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ contactId: "contact-1" }) })
    )
  })

  it("filters followUpRequired when requested", async () => {
    mockPrisma.interaction.findMany.mockResolvedValue([])
    await listInteractions({ followUpRequired: true })
    expect(mockPrisma.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ followUpRequired: true, followUpCompleted: false }),
      })
    )
  })
})
