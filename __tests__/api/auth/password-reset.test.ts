import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route"
import { POST as resetPassword } from "@/app/api/auth/reset-password/route"
import { prisma } from "@/lib/db"
import { NextRequest } from "next/server"

jest.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: jest.fn() } },
}))

jest.mock("@/lib/services/password-reset", () => ({
  createResetToken: jest.fn().mockResolvedValue("tok123"),
  consumeResetToken: jest.fn(),
}))

jest.mock("@/lib/email", () => ({ sendEmail: jest.fn() }))

import { createResetToken, consumeResetToken } from "@/lib/services/password-reset"
import { sendEmail } from "@/lib/email"
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockCreateResetToken = createResetToken as jest.Mock
const mockConsumeResetToken = consumeResetToken as jest.Mock
const mockSendEmail = sendEmail as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/auth/forgot-password", () => {
  it("returns 200 when email not found (no enumeration)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const res = await forgotPassword(makeRequest({ email: "unknown@example.com" }))
    expect(res.status).toBe(200)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("returns 200 and sends email for approved credential user", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1", name: "Alice", email: "alice@example.com",
      passwordHash: "hash", status: "approved",
    } as any)
    const res = await forgotPassword(makeRequest({ email: "alice@example.com" }))
    expect(res.status).toBe(200)
    expect(mockCreateResetToken).toHaveBeenCalledWith("user-1")
    expect(mockSendEmail).toHaveBeenCalledWith(
      "alice@example.com",
      expect.any(String),
      expect.stringContaining("tok123")
    )
  })

  it("returns 200 silently for Google OAuth user (no passwordHash)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-2", name: "Bob", email: "bob@example.com",
      passwordHash: null, status: "approved",
    } as any)
    const res = await forgotPassword(makeRequest({ email: "bob@example.com" }))
    expect(res.status).toBe(200)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("returns 200 silently for pending user", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-3", name: "Carol", email: "carol@example.com",
      passwordHash: "hash", status: "pending",
    } as any)
    const res = await forgotPassword(makeRequest({ email: "carol@example.com" }))
    expect(res.status).toBe(200)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})

describe("POST /api/auth/reset-password", () => {
  it("returns 400 when token is invalid", async () => {
    mockConsumeResetToken.mockResolvedValue(false)
    const res = await resetPassword(makeRequest({ token: "badtoken", password: "newpass123" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("Invalid")
  })

  it("returns 400 when password is too short", async () => {
    const res = await resetPassword(makeRequest({ token: "tok", password: "short" }))
    expect(res.status).toBe(400)
  })

  it("returns 200 when token is valid and password updated", async () => {
    mockConsumeResetToken.mockResolvedValue(true)
    const res = await resetPassword(makeRequest({ token: "goodtoken", password: "newpassword123" }))
    expect(res.status).toBe(200)
  })
})
