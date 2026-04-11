import { PATCH as patchProfile } from "@/app/api/v1/profile/route"
import { PATCH as patchPassword } from "@/app/api/v1/profile/password/route"
import { prisma } from "@/lib/db"
import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  },
}))
jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue("new-hash"),
}))

import { auth } from "@/lib/auth"
const mockAuth = auth as jest.Mock
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>

beforeEach(() => jest.clearAllMocks())

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("PATCH /api/v1/profile", () => {
  it("returns 401 with no session", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await patchProfile(makeRequest({ name: "Alice" }))
    expect(res.status).toBe(401)
  })

  it("returns 401 for admin session (no userId)", async () => {
    mockAuth.mockResolvedValue({ role: "admin" })
    const res = await patchProfile(makeRequest({ name: "Admin" }))
    expect(res.status).toBe(401)
  })

  it("updates name and returns 200", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", role: "user" })
    mockPrisma.user.findFirst.mockResolvedValue(null) // no email conflict
    mockPrisma.user.update.mockResolvedValue({ id: "u1", name: "New Name", email: "a@b.com" } as any)

    const res = await patchProfile(makeRequest({ name: "New Name" }))
    expect(res.status).toBe(200)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({ name: "New Name" }),
      select: { name: true, email: true },
    })
  })

  it("returns 422 when new email is already taken by another user", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", role: "user" })
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u2" } as any) // another user has this email

    const res = await patchProfile(makeRequest({ email: "taken@example.com" }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain("already in use")
  })

  it("returns 422 for invalid email format", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", role: "user" })
    const res = await patchProfile(makeRequest({ email: "not-valid" }))
    expect(res.status).toBe(422)
  })
})

describe("PATCH /api/v1/profile/password", () => {
  it("returns 401 with no userId in session", async () => {
    mockAuth.mockResolvedValue({ role: "admin" })
    const res = await patchPassword(makeRequest({ currentPassword: "old", newPassword: "newpassword123" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when current password is wrong", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", role: "user" })
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", passwordHash: "old-hash" } as any)
    mockBcrypt.compare.mockResolvedValue(false as never)

    const res = await patchPassword(makeRequest({ currentPassword: "wrong", newPassword: "newpassword123" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("incorrect")
  })

  it("updates password hash when current password is correct", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", role: "user" })
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", passwordHash: "old-hash" } as any)
    mockBcrypt.compare.mockResolvedValue(true as never)
    mockPrisma.user.update.mockResolvedValue({} as any)

    const res = await patchPassword(makeRequest({ currentPassword: "correctpassword", newPassword: "newpassword123" }))
    expect(res.status).toBe(200)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "new-hash" },
    })
  })

  it("returns 404 for user with no passwordHash (OAuth user)", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", role: "user" })
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", passwordHash: null } as any)
    const res = await patchPassword(makeRequest({ currentPassword: "x", newPassword: "newpassword123" }))
    expect(res.status).toBe(404)
  })
})
