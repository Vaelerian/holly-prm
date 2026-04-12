import { PUT, DELETE } from "@/app/api/v1/contacts/[id]/route"
import { NextRequest } from "next/server"

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/services/contacts", () => ({
  getContact: jest.fn(),
  updateContact: jest.fn(),
  deleteContact: jest.fn(),
  isContactOwner: jest.requireActual("@/lib/services/contacts").isContactOwner,
}))

import { auth } from "@/lib/auth"
import { getContact, updateContact, deleteContact } from "@/lib/services/contacts"

const mockAuth = auth as jest.Mock
const mockGetContact = getContact as jest.Mock
const mockUpdateContact = updateContact as jest.Mock
const mockDeleteContact = deleteContact as jest.Mock

beforeEach(() => jest.clearAllMocks())

const contactParams = { params: Promise.resolve({ id: "c1" }) }

const ownerContact = { id: "c1", userId: "u1", name: "Test Contact", type: "work", healthScore: null, lastInteraction: null, tags: [], user: { id: "u1", name: "Owner" } }
const putBody = { name: "Updated Contact" }

function makePutReq(body: object = putBody) {
  return new NextRequest("http://localhost/api/v1/contacts/c1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// PUT tests

it("PUT returns 401 when no session", async () => {
  mockAuth.mockResolvedValue(null)
  const res = await PUT(makePutReq(), contactParams)
  expect(res.status).toBe(401)
  const data = await res.json()
  expect(data.code).toBe("UNAUTHORIZED")
})

it("PUT returns 404 when contact not found", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  mockGetContact.mockResolvedValue(null)
  const res = await PUT(makePutReq(), contactParams)
  expect(res.status).toBe(404)
  const data = await res.json()
  expect(data.code).toBe("NOT_FOUND")
})

it("PUT returns 403 when caller is a contributor (not owner)", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  // Contact owned by someone else, but accessible via share
  mockGetContact.mockResolvedValue({ ...ownerContact, userId: "owner-id" })
  const res = await PUT(makePutReq(), contactParams)
  expect(res.status).toBe(403)
  const data = await res.json()
  expect(data.code).toBe("FORBIDDEN")
})

it("PUT returns 200 and calls updateContact when caller is owner", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  mockGetContact.mockResolvedValue(ownerContact)
  const updated = { ...ownerContact, name: "Updated Contact" }
  mockUpdateContact.mockResolvedValue(updated)
  const res = await PUT(makePutReq(), contactParams)
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data.name).toBe("Updated Contact")
  expect(mockUpdateContact).toHaveBeenCalledWith("c1", expect.objectContaining({ name: "Updated Contact" }), "ian", "u1")
})

// DELETE tests

it("DELETE returns 401 when no session", async () => {
  mockAuth.mockResolvedValue(null)
  const res = await DELETE(new NextRequest("http://localhost/api/v1/contacts/c1"), contactParams)
  expect(res.status).toBe(401)
  const data = await res.json()
  expect(data.code).toBe("UNAUTHORIZED")
})

it("DELETE returns 404 when contact not found", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  mockGetContact.mockResolvedValue(null)
  const res = await DELETE(new NextRequest("http://localhost/api/v1/contacts/c1"), contactParams)
  expect(res.status).toBe(404)
  const data = await res.json()
  expect(data.code).toBe("NOT_FOUND")
})

it("DELETE returns 403 when caller is a contributor (not owner)", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  mockGetContact.mockResolvedValue({ ...ownerContact, userId: "owner-id" })
  const res = await DELETE(new NextRequest("http://localhost/api/v1/contacts/c1"), contactParams)
  expect(res.status).toBe(403)
  const data = await res.json()
  expect(data.code).toBe("FORBIDDEN")
})

it("DELETE returns 204 when caller is owner", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  mockGetContact.mockResolvedValue(ownerContact)
  mockDeleteContact.mockResolvedValue(ownerContact)
  const res = await DELETE(new NextRequest("http://localhost/api/v1/contacts/c1"), contactParams)
  expect(res.status).toBe(204)
  expect(mockDeleteContact).toHaveBeenCalledWith("c1", "ian", "u1")
})
