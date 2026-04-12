import { createInteraction, listInteractions, updateInteraction, deleteInteraction, getInteractionById } from "@/lib/services/interactions"
import { prisma } from "@/lib/db"
import { computeHealthScore } from "@/lib/health-score"
import { publishSseEvent } from "@/lib/sse-events"

jest.mock("@/lib/db", () => ({
  prisma: {
    interaction: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
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

jest.mock("@/lib/services/calendar-sync", () => ({
  upsertCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
}))

jest.mock("@/lib/services/contacts", () => ({
  contactAccessWhere: jest.fn().mockReturnValue({}),
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
    const created = { id: "int-1", ...input, occurredAt: new Date(input.occurredAt), contact: { id: "contact-1", name: "Alice" } }
    mockPrisma.interaction.create.mockResolvedValue(created as any)
    mockPrisma.contact.findUnique.mockResolvedValue({ interactionFreqDays: 30 } as any)
    mockPrisma.contact.update.mockResolvedValue({} as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createInteraction(input, "ian", "user-1")

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
    const created = { id: "int-2", ...input, occurredAt: new Date(input.occurredAt), contact: { id: "contact-1", name: "Alice" } }
    mockPrisma.interaction.create.mockResolvedValue(created as any)
    mockPrisma.contact.findUnique.mockResolvedValue({ interactionFreqDays: null } as any)
    mockPrisma.contact.update.mockResolvedValue({} as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createInteraction(input, "holly", "user-1")

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
    mockPrisma.interaction.create.mockResolvedValue({ id: "int-3", ...input, createdByHolly: false, occurredAt: new Date(input.occurredAt), contact: { id: "contact-1", name: "Alice" } } as any)
    mockPrisma.contact.findUnique.mockResolvedValue({ interactionFreqDays: null } as any)
    mockPrisma.contact.update.mockResolvedValue({} as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createInteraction(input, "ian", "user-1")

    expect(publishSseEvent).toHaveBeenCalledWith(
      "interaction.created",
      expect.objectContaining({ contactId: "contact-1", type: "meeting" })
    )
  })
})

describe("listInteractions", () => {
  it("filters by contactId when provided", async () => {
    mockPrisma.interaction.findMany.mockResolvedValue([])
    await listInteractions({ contactId: "contact-1", userId: "user-1" })
    expect(mockPrisma.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ contactId: "contact-1" }) })
    )
  })

  it("filters followUpRequired when requested", async () => {
    mockPrisma.interaction.findMany.mockResolvedValue([])
    await listInteractions({ followUpRequired: true, userId: "user-1" })
    expect(mockPrisma.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ followUpRequired: true, followUpCompleted: false }),
      })
    )
  })
})

describe("ownership checks", () => {
  it("updateInteraction returns null when interaction belongs to different user", async () => {
    mockPrisma.interaction.findFirst.mockResolvedValue(null)

    const result = await updateInteraction("i1", { summary: "New" } as any, "ian", "user-2")

    expect(result).toBeNull()
    expect(mockPrisma.interaction.update).not.toHaveBeenCalled()
  })

  it("deleteInteraction returns null when interaction belongs to different user", async () => {
    mockPrisma.interaction.findFirst.mockResolvedValue(null)

    const result = await deleteInteraction("i1", "ian", "user-2")

    expect(result).toBeNull()
    expect(mockPrisma.interaction.delete).not.toHaveBeenCalled()
  })
})

describe("createInteraction with contributor", () => {
  it("sets createdByUserId when contributor logs interaction for another user's contact", async () => {
    const input = {
      contactId: "contact-1",
      type: "call" as const,
      direction: "outbound" as const,
      summary: "Checked in",
      outcome: null,
      followUpRequired: false,
      followUpDate: null,
      callbackExpected: false,
      location: null,
      duration: null,
      transcript: null,
      occurredAt: "2026-04-12T10:00:00Z",
    }
    const created = { id: "int-5", ...input, occurredAt: new Date(input.occurredAt), contact: { id: "contact-1", name: "Alice" }, createdByUserId: "contributor-1" }
    mockPrisma.interaction.create.mockResolvedValue(created as any)
    mockPrisma.contact.findUnique.mockResolvedValue({ interactionFreqDays: null } as any)
    mockPrisma.contact.update.mockResolvedValue({} as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createInteraction(input, "ian", "contributor-1", "owner-1")

    const createCall = (mockPrisma.interaction.create as jest.Mock).mock.calls[0][0]
    expect(createCall.data.userId).toBe("owner-1")
    expect(createCall.data.createdByUserId).toBe("contributor-1")
  })

  it("does not set createdByUserId when owner logs their own interaction", async () => {
    const input = {
      contactId: "contact-1",
      type: "call" as const,
      direction: "outbound" as const,
      summary: "Checked in",
      outcome: null,
      followUpRequired: false,
      followUpDate: null,
      callbackExpected: false,
      location: null,
      duration: null,
      transcript: null,
      occurredAt: "2026-04-12T10:00:00Z",
    }
    const created = { id: "int-6", ...input, occurredAt: new Date(input.occurredAt), contact: { id: "contact-1", name: "Alice" }, createdByUserId: null }
    mockPrisma.interaction.create.mockResolvedValue(created as any)
    mockPrisma.contact.findUnique.mockResolvedValue({ interactionFreqDays: null } as any)
    mockPrisma.contact.update.mockResolvedValue({} as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createInteraction(input, "ian", "owner-1")

    const createCall = (mockPrisma.interaction.create as jest.Mock).mock.calls[0][0]
    expect(createCall.data.userId).toBe("owner-1")
    expect(createCall.data.createdByUserId).toBeNull()
  })
})

describe("getInteractionById", () => {
  it("finds interaction by id without userId scoping", async () => {
    const interaction = { id: "int-1", userId: "owner-1", summary: "Test" }
    mockPrisma.interaction.findUnique.mockResolvedValue(interaction as any)
    const result = await getInteractionById("int-1")
    expect(result).toEqual(interaction)
    expect(mockPrisma.interaction.findUnique).toHaveBeenCalledWith({ where: { id: "int-1" } })
  })
})
