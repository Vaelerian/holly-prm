import { POST as approve } from "@/app/api/admin/users/[id]/approve/route"
import { POST as reject } from "@/app/api/admin/users/[id]/reject/route"
import { POST as claimUnclaimed } from "@/app/api/admin/claim-unclaimed/route"
import { prisma } from "@/lib/db"
import { NextRequest } from "next/server"

jest.mock("@/lib/db", () => ({
  prisma: {
    user: { update: jest.fn(), findUnique: jest.fn() },
    contact: { updateMany: jest.fn() },
    interaction: { updateMany: jest.fn() },
    actionItem: { updateMany: jest.fn() },
    project: { updateMany: jest.fn() },
    auditLog: { updateMany: jest.fn() },
    knowledgeItem: { updateMany: jest.fn() },
    hollyApiKey: { updateMany: jest.fn() },
    pushSubscription: { updateMany: jest.fn() },
    googleToken: { updateMany: jest.fn() },
    calendarSync: { updateMany: jest.fn() },
    userPreference: { updateMany: jest.fn() },
    vaultConfig: { updateMany: jest.fn() },
    vaultNote: { updateMany: jest.fn() },
  },
}))

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}))

import { auth } from "@/lib/auth"
const mockAuth = auth as jest.Mock
const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

function makeRequest(body?: unknown) {
  return new NextRequest("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
}

it("approve returns 403 if not admin", async () => {
  mockAuth.mockResolvedValue({ role: "user", userId: "u1" })
  const res = await approve(makeRequest(), { params: Promise.resolve({ id: "target-id" }) })
  expect(res.status).toBe(403)
})

it("approve sets user status to approved", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  mockPrisma.user.findUnique.mockResolvedValue({ id: "target-id", status: "pending" } as any)
  mockPrisma.user.update.mockResolvedValue({ id: "target-id", status: "approved" } as any)
  const res = await approve(makeRequest(), { params: Promise.resolve({ id: "target-id" }) })
  expect(res.status).toBe(200)
  expect(mockPrisma.user.update).toHaveBeenCalledWith({
    where: { id: "target-id" },
    data: { status: "approved" },
  })
})

it("approve returns 404 for unknown user id", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  mockPrisma.user.findUnique.mockResolvedValue(null)
  const res = await approve(makeRequest(), { params: Promise.resolve({ id: "unknown" }) })
  expect(res.status).toBe(404)
})

it("reject sets user status to rejected", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  mockPrisma.user.findUnique.mockResolvedValue({ id: "target-id", status: "approved" } as any)
  mockPrisma.user.update.mockResolvedValue({ id: "target-id", status: "rejected" } as any)
  const res = await reject(makeRequest(), { params: Promise.resolve({ id: "target-id" }) })
  expect(res.status).toBe(200)
  expect(mockPrisma.user.update).toHaveBeenCalledWith({
    where: { id: "target-id" },
    data: { status: "rejected" },
  })
})

it("claim-unclaimed assigns null-userId records to target user", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", status: "approved" } as any)
  // All updateMany calls return { count: 0 }
  Object.values(mockPrisma).forEach((m: any) => {
    if (m.updateMany) m.updateMany.mockResolvedValue({ count: 0 })
  })

  const res = await claimUnclaimed(makeRequest({ userId: "u1" }))
  expect(res.status).toBe(200)
  expect(mockPrisma.contact.updateMany).toHaveBeenCalledWith({
    where: { userId: null },
    data: { userId: "u1" },
  })
})
