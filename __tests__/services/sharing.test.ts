import {
  listAccessGrants,
  createAccessGrant,
  deleteAccessGrant,
  listContactShares,
  createContactShare,
  deleteContactShare,
} from "@/lib/services/sharing"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    userAccessGrant: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    contact: { findFirst: jest.fn() },
    contactShare: { findMany: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("listAccessGrants", () => {
  it("returns all grants with grantor and grantee names", async () => {
    const grants = [{ id: "g1", grantor: { name: "Alice", email: "a@x.com" }, grantee: { name: "Bob", email: "b@x.com" }, createdAt: new Date() }]
    mockPrisma.userAccessGrant.findMany.mockResolvedValue(grants as any)
    const result = await listAccessGrants()
    expect(result).toEqual(grants)
    expect(mockPrisma.userAccessGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { grantor: expect.any(Object), grantee: expect.any(Object) } })
    )
  })
})

describe("createAccessGrant", () => {
  it("creates grant when both users exist", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: "u1", name: "Alice" } as any)
      .mockResolvedValueOnce({ id: "u2", name: "Bob" } as any)
    mockPrisma.userAccessGrant.create.mockResolvedValue({ id: "g1", grantorId: "u1", granteeId: "u2" } as any)

    const result = await createAccessGrant("alice@x.com", "bob@x.com")

    expect(result).toEqual({ id: "g1", grantorId: "u1", granteeId: "u2" })
    expect(mockPrisma.userAccessGrant.create).toHaveBeenCalledWith({
      data: { grantorId: "u1", granteeId: "u2" },
    })
  })

  it("returns 'grantor_not_found' when grantor email not found", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null)
    const result = await createAccessGrant("nope@x.com", "bob@x.com")
    expect(result).toBe("grantor_not_found")
    expect(mockPrisma.userAccessGrant.create).not.toHaveBeenCalled()
  })

  it("returns 'grantee_not_found' when grantee email not found", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: "u1" } as any)
      .mockResolvedValueOnce(null)
    const result = await createAccessGrant("alice@x.com", "nope@x.com")
    expect(result).toBe("grantee_not_found")
  })
})

describe("deleteAccessGrant", () => {
  it("deletes grant and returns true", async () => {
    mockPrisma.userAccessGrant.findUnique.mockResolvedValue({ id: "g1" } as any)
    mockPrisma.userAccessGrant.delete.mockResolvedValue({ id: "g1" } as any)
    const result = await deleteAccessGrant("g1")
    expect(result).toBe(true)
  })

  it("returns false when grant not found", async () => {
    mockPrisma.userAccessGrant.findUnique.mockResolvedValue(null)
    const result = await deleteAccessGrant("nope")
    expect(result).toBe(false)
    expect(mockPrisma.userAccessGrant.delete).not.toHaveBeenCalled()
  })
})

describe("listContactShares", () => {
  it("returns shares for a contact owned by the caller", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c1" } as any)
    const shares = [{ id: "s1", user: { name: "Bob", email: "b@x.com" }, createdAt: new Date() }]
    mockPrisma.contactShare.findMany.mockResolvedValue(shares as any)
    const result = await listContactShares("c1", "owner-id")
    expect(result).toEqual(shares)
  })

  it("returns null when contact is not owned by caller", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)
    const result = await listContactShares("c1", "wrong-user")
    expect(result).toBeNull()
  })
})

describe("createContactShare", () => {
  it("creates share when contact is owned and target user exists", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c1", userId: "owner-id" } as any)
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u2" } as any)
    mockPrisma.contactShare.create.mockResolvedValue({ id: "s1", contactId: "c1", userId: "u2" } as any)

    const result = await createContactShare("c1", "bob@x.com", "owner-id")
    expect(result).toEqual({ id: "s1", contactId: "c1", userId: "u2" })
  })

  it("returns null when contact not owned by caller", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)
    const result = await createContactShare("c1", "bob@x.com", "wrong-user")
    expect(result).toBeNull()
  })

  it("returns 'user_not_found' when email doesn't match a user", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c1" } as any)
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const result = await createContactShare("c1", "nope@x.com", "owner-id")
    expect(result).toBe("user_not_found")
  })
})

describe("deleteContactShare", () => {
  it("deletes share and returns true", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c1" } as any)
    mockPrisma.contactShare.deleteMany.mockResolvedValue({ count: 1 } as any)
    const result = await deleteContactShare("c1", "u2", "owner-id")
    expect(result).toBe(true)
  })

  it("returns false when contact not owned by caller", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)
    const result = await deleteContactShare("c1", "u2", "wrong-user")
    expect(result).toBe(false)
    expect(mockPrisma.contactShare.deleteMany).not.toHaveBeenCalled()
  })

  it("returns false when share does not exist", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c1" } as any)
    mockPrisma.contactShare.deleteMany.mockResolvedValue({ count: 0 } as any)
    const result = await deleteContactShare("c1", "u2", "owner-id")
    expect(result).toBe(false)
  })
})
