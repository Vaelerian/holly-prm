import { POST as addMember } from "@/app/api/v1/projects/[id]/members/route"
import { DELETE as removeMember } from "@/app/api/v1/projects/[id]/members/[memberId]/route"
import { prisma } from "@/lib/db"
import { Prisma } from "@/app/generated/prisma/client"
import { NextRequest } from "next/server"

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    project: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    projectMember: { create: jest.fn(), delete: jest.fn() },
  },
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

it("POST /members returns 403 if caller is not project owner", async () => {
  mockAuth.mockResolvedValue({ userId: "user-2", role: "user" })
  mockPrisma.project.findFirst.mockResolvedValue(null) // not owner

  const res = await addMember(makeRequest({ email: "alice@example.com" }), {
    params: Promise.resolve({ id: "p1" }),
  })
  expect(res.status).toBe(403)
})

it("POST /members returns 404 if target email not found", async () => {
  mockAuth.mockResolvedValue({ userId: "user-1", role: "user" })
  mockPrisma.project.findFirst.mockResolvedValue({ id: "p1", userId: "user-1" } as any)
  mockPrisma.user.findUnique.mockResolvedValue(null)

  const res = await addMember(makeRequest({ email: "unknown@example.com" }), {
    params: Promise.resolve({ id: "p1" }),
  })
  expect(res.status).toBe(404)
})

it("POST /members creates a ProjectMember", async () => {
  mockAuth.mockResolvedValue({ userId: "user-1", role: "user" })
  mockPrisma.project.findFirst.mockResolvedValue({ id: "p1", userId: "user-1" } as any)
  mockPrisma.user.findUnique.mockResolvedValue({ id: "user-2", status: "approved" } as any)
  mockPrisma.projectMember.create.mockResolvedValue({ id: "pm1" } as any)

  const res = await addMember(makeRequest({ email: "alice@example.com" }), {
    params: Promise.resolve({ id: "p1" }),
  })
  expect(res.status).toBe(201)
  expect(mockPrisma.projectMember.create).toHaveBeenCalledWith({
    data: { projectId: "p1", userId: "user-2" },
  })
})

it("POST /members returns 409 if owner adds themselves", async () => {
  mockAuth.mockResolvedValue({ userId: "user-1", role: "user" })
  mockPrisma.project.findFirst.mockResolvedValue({ id: "p1", userId: "user-1" } as any)
  mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", status: "approved" } as any)

  const res = await addMember(makeRequest({ email: "owner@example.com" }), {
    params: Promise.resolve({ id: "p1" }),
  })
  expect(res.status).toBe(409)
  expect(mockPrisma.projectMember.create).not.toHaveBeenCalled()
})

it("POST /members returns 409 if member already exists", async () => {
  mockAuth.mockResolvedValue({ userId: "user-1", role: "user" })
  mockPrisma.project.findFirst.mockResolvedValue({ id: "p1", userId: "user-1" } as any)
  mockPrisma.user.findUnique.mockResolvedValue({ id: "user-2", status: "approved" } as any)
  mockPrisma.projectMember.create.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "7.0.0",
    })
  )

  const res = await addMember(makeRequest({ email: "alice@example.com" }), {
    params: Promise.resolve({ id: "p1" }),
  })
  expect(res.status).toBe(409)
})

it("DELETE /members returns 403 if caller is not project owner", async () => {
  mockAuth.mockResolvedValue({ userId: "user-2", role: "user" })
  mockPrisma.project.findFirst.mockResolvedValue(null) // not owner

  const res = await removeMember(new NextRequest("http://localhost/", { method: "DELETE" }), {
    params: Promise.resolve({ id: "p1", memberId: "user-3" }),
  })
  expect(res.status).toBe(403)
})

it("DELETE /members returns 404 if member not found", async () => {
  mockAuth.mockResolvedValue({ userId: "user-1", role: "user" })
  mockPrisma.project.findFirst.mockResolvedValue({ id: "p1", userId: "user-1" } as any)
  mockPrisma.projectMember.delete.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "7.0.0",
    })
  )

  const res = await removeMember(new NextRequest("http://localhost/", { method: "DELETE" }), {
    params: Promise.resolve({ id: "p1", memberId: "user-3" }),
  })
  expect(res.status).toBe(404)
})

it("DELETE /members returns 204 on success", async () => {
  mockAuth.mockResolvedValue({ userId: "user-1", role: "user" })
  mockPrisma.project.findFirst.mockResolvedValue({ id: "p1", userId: "user-1" } as any)
  mockPrisma.projectMember.delete.mockResolvedValue({} as any)

  const res = await removeMember(new NextRequest("http://localhost/", { method: "DELETE" }), {
    params: Promise.resolve({ id: "p1", memberId: "user-3" }),
  })
  expect(res.status).toBe(204)
  expect(mockPrisma.projectMember.delete).toHaveBeenCalledWith({
    where: { projectId_userId: { projectId: "p1", userId: "user-3" } },
  })
})
