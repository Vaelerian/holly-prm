import { GET, POST } from "@/app/api/v1/contacts/[id]/shares/route"
import { DELETE } from "@/app/api/v1/contacts/[id]/shares/[sharedUserId]/route"
import { NextRequest } from "next/server"

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/services/sharing", () => ({
  listContactShares: jest.fn(),
  createContactShare: jest.fn(),
  deleteContactShare: jest.fn(),
}))

import { auth } from "@/lib/auth"
import { listContactShares, createContactShare, deleteContactShare } from "@/lib/services/sharing"

const mockAuth = auth as jest.Mock

beforeEach(() => jest.clearAllMocks())

const contactParams = { params: Promise.resolve({ id: "c1" }) }
const shareParams = { params: Promise.resolve({ id: "c1", sharedUserId: "u2" }) }

it("GET returns 401 when unauthenticated", async () => {
  mockAuth.mockResolvedValue(null)
  const res = await GET(new NextRequest("http://localhost/"), contactParams)
  expect(res.status).toBe(401)
})

it("GET returns shares for contact owner", async () => {
  mockAuth.mockResolvedValue({ userId: "owner-1" })
  const shares = [{ id: "s1", user: { name: "Bob", email: "b@x.com" }, createdAt: new Date() }]
  ;(listContactShares as jest.Mock).mockResolvedValue(shares)
  const res = await GET(new NextRequest("http://localhost/"), contactParams)
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data).toHaveLength(1)
})

it("GET returns 404 when caller is not the contact owner", async () => {
  mockAuth.mockResolvedValue({ userId: "other-user" })
  ;(listContactShares as jest.Mock).mockResolvedValue(null)
  const res = await GET(new NextRequest("http://localhost/"), contactParams)
  expect(res.status).toBe(404)
})

it("POST shares contact with target user", async () => {
  mockAuth.mockResolvedValue({ userId: "owner-1" })
  ;(createContactShare as jest.Mock).mockResolvedValue({ id: "s1", contactId: "c1", userId: "u2" })
  const req = new NextRequest("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bob@x.com" }) })
  const res = await POST(req, contactParams)
  expect(res.status).toBe(201)
})

it("POST returns 404 when target email not found", async () => {
  mockAuth.mockResolvedValue({ userId: "owner-1" })
  ;(createContactShare as jest.Mock).mockResolvedValue("user_not_found")
  const req = new NextRequest("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "nope@x.com" }) })
  const res = await POST(req, contactParams)
  expect(res.status).toBe(404)
})

it("POST returns 403 when caller is not the contact owner", async () => {
  mockAuth.mockResolvedValue({ userId: "other-user" })
  ;(createContactShare as jest.Mock).mockResolvedValue(null)
  const req = new NextRequest("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bob@x.com" }) })
  const res = await POST(req, contactParams)
  expect(res.status).toBe(403)
})

it("POST returns 409 when contact already shared with user", async () => {
  mockAuth.mockResolvedValue({ userId: "owner-1" })
  ;(createContactShare as jest.Mock).mockResolvedValue("already_exists")
  const req = new NextRequest("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bob@x.com" }) })
  const res = await POST(req, contactParams)
  expect(res.status).toBe(409)
})

it("DELETE removes share", async () => {
  mockAuth.mockResolvedValue({ userId: "owner-1" })
  ;(deleteContactShare as jest.Mock).mockResolvedValue(true)
  const res = await DELETE(new NextRequest("http://localhost/"), shareParams)
  expect(res.status).toBe(200)
})

it("DELETE returns 404 when share not found", async () => {
  mockAuth.mockResolvedValue({ userId: "owner-1" })
  ;(deleteContactShare as jest.Mock).mockResolvedValue(false)
  const res = await DELETE(new NextRequest("http://localhost/"), shareParams)
  expect(res.status).toBe(404)
})
