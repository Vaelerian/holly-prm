import { GET, POST } from "@/app/api/admin/access-grants/route"
import { DELETE } from "@/app/api/admin/access-grants/[id]/route"
import { NextRequest } from "next/server"

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/services/sharing", () => ({
  listAccessGrants: jest.fn(),
  createAccessGrant: jest.fn(),
  deleteAccessGrant: jest.fn(),
}))

import { auth } from "@/lib/auth"
import { listAccessGrants, createAccessGrant, deleteAccessGrant } from "@/lib/services/sharing"

const mockAuth = auth as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/admin/access-grants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
}

it("GET returns 401 for non-admin", async () => {
  mockAuth.mockResolvedValue({ role: "user", userId: "u1" })
  const res = await GET()
  expect(res.status).toBe(401)
})

it("GET returns all grants for admin", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  const grants = [{ id: "g1", grantor: { name: "A", email: "a@x.com" }, grantee: { name: "B", email: "b@x.com" }, createdAt: new Date() }]
  ;(listAccessGrants as jest.Mock).mockResolvedValue(grants)
  const res = await GET()
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data).toHaveLength(1)
})

it("POST returns 401 for non-admin", async () => {
  mockAuth.mockResolvedValue({ role: "user", userId: "u1" })
  const res = await POST(makeRequest({ grantorEmail: "a@x.com", granteeEmail: "b@x.com" }))
  expect(res.status).toBe(401)
})

it("POST creates grant for admin", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  ;(createAccessGrant as jest.Mock).mockResolvedValue({ id: "g1", grantorId: "u1", granteeId: "u2" })
  const res = await POST(makeRequest({ grantorEmail: "a@x.com", granteeEmail: "b@x.com" }))
  expect(res.status).toBe(201)
})

it("POST returns 404 with grantor message when createAccessGrant returns grantor_not_found", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  ;(createAccessGrant as jest.Mock).mockResolvedValue("grantor_not_found")
  const res = await POST(makeRequest({ grantorEmail: "nope@x.com", granteeEmail: "b@x.com" }))
  expect(res.status).toBe(404)
  const data = await res.json()
  expect(data.error).toContain("Grantor")
})

it("POST returns 404 with grantee message when createAccessGrant returns grantee_not_found", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  ;(createAccessGrant as jest.Mock).mockResolvedValue("grantee_not_found")
  const res = await POST(makeRequest({ grantorEmail: "a@x.com", granteeEmail: "nope@x.com" }))
  expect(res.status).toBe(404)
  const data = await res.json()
  expect(data.error).toContain("Grantee")
})

it("DELETE returns 401 for non-admin", async () => {
  mockAuth.mockResolvedValue({ role: "user", userId: "u1" })
  const res = await DELETE(new NextRequest("http://localhost/"), { params: Promise.resolve({ id: "g1" }) })
  expect(res.status).toBe(401)
})

it("DELETE revokes grant for admin", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  ;(deleteAccessGrant as jest.Mock).mockResolvedValue(true)
  const res = await DELETE(new NextRequest("http://localhost/"), { params: Promise.resolve({ id: "g1" }) })
  expect(res.status).toBe(200)
})

it("DELETE returns 404 when grant not found", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  ;(deleteAccessGrant as jest.Mock).mockResolvedValue(false)
  const res = await DELETE(new NextRequest("http://localhost/"), { params: Promise.resolve({ id: "nope" }) })
  expect(res.status).toBe(404)
})
