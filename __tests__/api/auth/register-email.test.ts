import { POST as register } from "@/app/api/auth/register/route"
import { POST as approve } from "@/app/api/admin/users/[id]/approve/route"
import { POST as reject } from "@/app/api/admin/users/[id]/reject/route"
import { prisma } from "@/lib/db"
import { NextRequest } from "next/server"

jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}))

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))

jest.mock("@/lib/email", () => ({ sendEmail: jest.fn() }))

import { auth } from "@/lib/auth"
import { sendEmail } from "@/lib/email"
const mockAuth = auth as jest.Mock
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendEmail = sendEmail as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeRegisterRequest() {
  return new NextRequest("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Alice", email: "alice@example.com", password: "password123" }),
  })
}

function makeAdminRequest() {
  return new NextRequest("http://localhost/", { method: "POST" })
}

it("register sends registration received email on success", async () => {
  mockPrisma.user.findUnique.mockResolvedValue(null)
  mockPrisma.user.create.mockResolvedValue({
    id: "u1", email: "alice@example.com", name: "Alice", status: "pending",
  } as any)

  const res = await register(makeRegisterRequest())

  expect(res.status).toBe(201)
  expect(mockSendEmail).toHaveBeenCalledWith(
    "alice@example.com",
    expect.any(String),
    expect.stringContaining("Alice")
  )
})

it("register does NOT send email when email already registered", async () => {
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1" } as any)

  await register(makeRegisterRequest())

  expect(mockSendEmail).not.toHaveBeenCalled()
})

it("approve sends approval email", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "alice@example.com", name: "Alice" } as any)
  mockPrisma.user.update.mockResolvedValue({ id: "u1", status: "approved" } as any)

  await approve(makeAdminRequest(), { params: Promise.resolve({ id: "u1" }) })

  expect(mockSendEmail).toHaveBeenCalledWith(
    "alice@example.com",
    expect.any(String),
    expect.stringContaining("Alice")
  )
})

it("reject sends rejection email", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "alice@example.com", name: "Alice" } as any)
  mockPrisma.user.update.mockResolvedValue({ id: "u1", status: "rejected" } as any)

  await reject(makeAdminRequest(), { params: Promise.resolve({ id: "u1" }) })

  expect(mockSendEmail).toHaveBeenCalledWith(
    "alice@example.com",
    expect.any(String),
    expect.stringContaining("Alice")
  )
})
