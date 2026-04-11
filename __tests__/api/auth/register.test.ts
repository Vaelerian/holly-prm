import { POST } from "@/app/api/auth/register/route"
import { prisma } from "@/lib/db"
import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"

jest.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: jest.fn(), create: jest.fn() } },
}))

jest.mock("@/lib/email", () => ({ sendEmail: jest.fn() }))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

it("creates a pending user and returns 201", async () => {
  mockPrisma.user.findUnique.mockResolvedValue(null)
  mockPrisma.user.create.mockResolvedValue({ id: "u1" } as any)

  const res = await POST(makeRequest({ email: "alice@example.com", name: "Alice", password: "password123" }))

  expect(res.status).toBe(201)
  expect(mockPrisma.user.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ email: "alice@example.com", name: "Alice", status: "pending" }),
    })
  )
  // Password should be hashed
  const createCall = mockPrisma.user.create.mock.calls[0][0]
  expect(createCall.data.passwordHash).toBeDefined()
  const valid = await bcrypt.compare("password123", createCall.data.passwordHash)
  expect(valid).toBe(true)
})

it("returns 422 when email is already registered", async () => {
  mockPrisma.user.findUnique.mockResolvedValue({ id: "existing" } as any)

  const res = await POST(makeRequest({ email: "alice@example.com", name: "Alice", password: "password123" }))

  expect(res.status).toBe(422)
  const body = await res.json()
  expect(body.error).toBe("Email already registered")
})

it("returns 422 for invalid input", async () => {
  const res = await POST(makeRequest({ email: "not-an-email", name: "", password: "short" }))
  expect(res.status).toBe(422)
})
