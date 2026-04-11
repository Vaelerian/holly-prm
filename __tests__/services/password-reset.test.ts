import { createResetToken, validateResetToken, consumeResetToken } from "@/lib/services/password-reset"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"

jest.mock("@/lib/db", () => ({
  prisma: {
    passwordResetToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: { update: jest.fn() },
  },
}))

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("hashed-password"),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("createResetToken", () => {
  it("deletes existing tokens for user, creates new token, returns plaintext", async () => {
    mockPrisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.passwordResetToken.create.mockResolvedValue({} as any)

    const token = await createResetToken("user-1")

    expect(mockPrisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", usedAt: null },
    })
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-1" }) })
    )
    expect(typeof token).toBe("string")
    expect(token.length).toBe(64) // 32 bytes as hex
  })
})

describe("validateResetToken", () => {
  it("returns user when token is valid", async () => {
    const fakeUser = { id: "user-1", email: "a@b.com", name: "Alice" }
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue({
      user: fakeUser,
    } as any)

    const result = await validateResetToken("a".repeat(64))

    expect(result).toEqual(fakeUser)
    expect(mockPrisma.passwordResetToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ usedAt: null }),
        include: { user: true },
      })
    )
  })

  it("returns null when token not found", async () => {
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null)
    const result = await validateResetToken("b".repeat(64))
    expect(result).toBeNull()
  })
})

describe("consumeResetToken", () => {
  it("returns false when token is invalid", async () => {
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null)
    const result = await consumeResetToken("bad-token", "newpassword")
    expect(result).toBe(false)
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it("hashes new password, updates user and marks token used, returns true", async () => {
    const fakeUser = { id: "user-1", email: "a@b.com", name: "Alice" }
    mockPrisma.passwordResetToken.findFirst
      .mockResolvedValueOnce({ id: "tok-1", user: fakeUser } as any)
    mockPrisma.passwordResetToken.update.mockResolvedValue({} as any)
    mockPrisma.user.update.mockResolvedValue({} as any)

    const result = await consumeResetToken("a".repeat(64), "newpassword123")

    expect(result).toBe(true)
    expect(bcrypt.hash).toHaveBeenCalledWith("newpassword123", 12)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "hashed-password" },
    })
    expect(mockPrisma.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: "tok-1" },
      data: { usedAt: expect.any(Date) },
    })
  })
})
