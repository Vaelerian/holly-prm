import { listContacts, getContact, createContact, updateContact, deleteContact, contactAccessWhere, isContactOwner } from "@/lib/services/contacts"
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

describe("contactAccessWhere", () => {
  it("returns OR clause covering all four access paths", () => {
    const result = contactAccessWhere("user-1")
    expect(result.OR).toHaveLength(4)
    expect(result.OR[0]).toEqual({ userId: "user-1" })
  })
})

describe("isContactOwner", () => {
  it("returns true when userId matches contact owner", () => {
    expect(isContactOwner("user-1", "user-1")).toBe(true)
  })
  it("returns false when userId does not match", () => {
    expect(isContactOwner("user-2", "user-1")).toBe(false)
  })
  it("returns false when owner is null", () => {
    expect(isContactOwner(null, "user-1")).toBe(false)
  })
})

describe("listContacts", () => {
  it("returns contacts using access OR clause", async () => {
    const contacts = [{ id: "1", name: "Alice", user: { id: "user-1", name: "Ian" } }]
    mockPrisma.contact.findMany.mockResolvedValue(contacts as any)
    const result = await listContacts({ userId: "user-1" })
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: "asc" } })
    )
    expect(result).toEqual(contacts)
  })

  it("filters by search query on name", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([])
    await listContacts({ q: "alice", userId: "user-1" })
    const call = (mockPrisma.contact.findMany as jest.Mock).mock.calls[0][0]
    expect(JSON.stringify(call.where)).toContain("alice")
  })

  it("filters overdue contacts when overdue=true", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([])
    await listContacts({ overdue: true, userId: "user-1" })
    const call = (mockPrisma.contact.findMany as jest.Mock).mock.calls[0][0]
    expect(JSON.stringify(call.where)).toContain("interactionFreqDays")
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

describe("ownership checks", () => {
  it("updateContact returns null when contact belongs to different user", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)
    const result = await updateContact("c1", { name: "New" } as any, "ian", "user-2")
    expect(result).toBeNull()
    expect(mockPrisma.contact.update).not.toHaveBeenCalled()
  })

  it("deleteContact returns null when contact belongs to different user", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)
    const result = await deleteContact("c1", "ian", "user-2")
    expect(result).toBeNull()
    expect(mockPrisma.contact.delete).not.toHaveBeenCalled()
  })
})
