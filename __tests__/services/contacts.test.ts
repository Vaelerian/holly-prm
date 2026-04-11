import { listContacts, getContact, createContact, updateContact, deleteContact } from "@/lib/services/contacts"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    contact: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("listContacts", () => {
  it("returns contacts ordered by name", async () => {
    const contacts = [{ id: "1", name: "Alice" }, { id: "2", name: "Bob" }]
    mockPrisma.contact.findMany.mockResolvedValue(contacts as any)
    const result = await listContacts({})
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: "asc" } })
    )
    expect(result).toEqual(contacts)
  })

  it("filters by search query on name", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([])
    await listContacts({ q: "alice" })
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: expect.objectContaining({ contains: "alice", mode: "insensitive" }),
        }),
      })
    )
  })

  it("filters overdue contacts when overdue=true", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([])
    await listContacts({ overdue: true })
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          interactionFreqDays: { not: null },
          OR: [{ healthScore: { lt: 100 } }, { lastInteraction: null }],
        }),
      })
    )
  })
})

describe("createContact", () => {
  it("creates contact and writes audit log", async () => {
    const input = { name: "Alice", type: "personal" as const, emails: [], phones: [], interactionFreqDays: null, isFamilyMember: false, tags: [], notes: "", preferences: {} }
    const created = { id: "abc", ...input }
    mockPrisma.contact.create.mockResolvedValue(created as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    const result = await createContact(input, "ian", "user-1")
    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-1" }) })
    )
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: "Contact", entityId: "abc", action: "create", actor: "ian" }),
    })
    expect(result).toEqual(created)
  })
})

describe("userId scoping", () => {
  it("listContacts filters by userId", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([{ id: "c1", name: "Alice" }] as any)

    const result = await listContacts({ userId: "user-1" })

    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "user-1" }) })
    )
    expect(result).toHaveLength(1)
  })

  it("getContact returns null when contact belongs to different user", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)

    const result = await getContact("c1", "user-2")

    expect(mockPrisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1", userId: "user-2" } })
    )
    expect(result).toBeNull()
  })

  it("createContact sets userId on the new record", async () => {
    mockPrisma.contact.create.mockResolvedValue({ id: "c2", userId: "user-1" } as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createContact({ name: "Bob" } as any, "ian", "user-1")

    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-1" }) })
    )
  })
})
