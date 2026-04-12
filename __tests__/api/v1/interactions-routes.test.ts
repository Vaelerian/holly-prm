import { GET as listInteractionsRoute, POST as createInteractionRoute } from "@/app/api/v1/interactions/route"
import { PUT, DELETE } from "@/app/api/v1/interactions/[id]/route"
import { NextRequest } from "next/server"

jest.mock("@/lib/services/interactions", () => ({
  listInteractions: jest.fn(),
  createInteraction: jest.fn(),
  getInteractionById: jest.fn(),
  updateInteraction: jest.fn(),
  deleteInteraction: jest.fn(),
}))

jest.mock("@/lib/services/contacts", () => ({
  getContact: jest.fn(),
}))

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}))

import { auth } from "@/lib/auth"
import { createInteraction, getInteractionById, updateInteraction, deleteInteraction } from "@/lib/services/interactions"
import { getContact } from "@/lib/services/contacts"

const mockAuth = auth as jest.Mock
const mockCreateInteraction = createInteraction as jest.Mock
const mockGetInteractionById = getInteractionById as jest.Mock
const mockUpdateInteraction = updateInteraction as jest.Mock
const mockDeleteInteraction = deleteInteraction as jest.Mock
const mockGetContact = getContact as jest.Mock

beforeEach(() => jest.clearAllMocks())

const interactionParams = { params: Promise.resolve({ id: "i1" }) }

const ownerInteraction = {
  id: "i1",
  userId: "u1",
  contactId: "a1b2c3d4-e5f6-4789-ab12-cd34ef567890",
  type: "call",
  summary: "Test",
  occurredAt: new Date().toISOString(),
}

const ownerContact = {
  id: "a1b2c3d4-e5f6-4789-ab12-cd34ef567890",
  userId: "u1",
  name: "Test Contact",
}

const validPostBody = {
  contactId: "a1b2c3d4-e5f6-4789-ab12-cd34ef567890",
  type: "call",
  direction: "outbound",
  summary: "Test note",
  occurredAt: "2026-04-12T12:00:00.000Z",
}

function makePostReq(body: object = validPostBody) {
  return new NextRequest("http://localhost/api/v1/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function makePutReq(body: object = { summary: "Updated" }) {
  return new NextRequest("http://localhost/api/v1/interactions/i1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// POST tests

it("POST returns 401 when no session", async () => {
  mockAuth.mockResolvedValue(null)
  const res = await createInteractionRoute(makePostReq())
  expect(res.status).toBe(401)
  const data = await res.json()
  expect(data.code).toBe("UNAUTHORIZED")
})

it("POST returns 422 when body fails validation", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  const res = await createInteractionRoute(makePostReq({ invalid: true }))
  expect(res.status).toBe(422)
  const data = await res.json()
  expect(data.code).toBe("VALIDATION_ERROR")
})

it("POST returns 404 when contact not found", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  mockGetContact.mockResolvedValue(null)
  const res = await createInteractionRoute(makePostReq())
  expect(res.status).toBe(404)
  const data = await res.json()
  expect(data.code).toBe("NOT_FOUND")
})

it("POST returns 201 for owner (no contactOwnerId passed to createInteraction)", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  mockGetContact.mockResolvedValue(ownerContact)
  mockCreateInteraction.mockResolvedValue(ownerInteraction)
  const res = await createInteractionRoute(makePostReq())
  expect(res.status).toBe(201)
  const data = await res.json()
  expect(data.id).toBe("i1")
  // contactOwnerId should be undefined when user is the owner
  expect(mockCreateInteraction).toHaveBeenCalledWith(
    expect.objectContaining({ contactId: "a1b2c3d4-e5f6-4789-ab12-cd34ef567890" }),
    "ian",
    "u1",
    undefined
  )
})

it("POST returns 201 for contributor and passes contactOwnerId to createInteraction", async () => {
  mockAuth.mockResolvedValue({ userId: "contributor-id" })
  mockGetContact.mockResolvedValue({ ...ownerContact, userId: "owner-id" })
  mockCreateInteraction.mockResolvedValue({ ...ownerInteraction, userId: "owner-id", createdByUserId: "contributor-id" })
  const res = await createInteractionRoute(makePostReq())
  expect(res.status).toBe(201)
  expect(mockCreateInteraction).toHaveBeenCalledWith(
    expect.objectContaining({ contactId: "a1b2c3d4-e5f6-4789-ab12-cd34ef567890" }),
    "ian",
    "contributor-id",
    "owner-id"
  )
})

// PUT tests

it("PUT returns 401 when no session", async () => {
  mockAuth.mockResolvedValue(null)
  const res = await PUT(makePutReq(), interactionParams)
  expect(res.status).toBe(401)
  const data = await res.json()
  expect(data.code).toBe("UNAUTHORIZED")
})

it("PUT returns 404 when interaction not found", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  mockGetInteractionById.mockResolvedValue(null)
  const res = await PUT(makePutReq(), interactionParams)
  expect(res.status).toBe(404)
  const data = await res.json()
  expect(data.code).toBe("NOT_FOUND")
})

it("PUT returns 403 when caller is a contributor (not owner)", async () => {
  mockAuth.mockResolvedValue({ userId: "contributor-id" })
  mockGetInteractionById.mockResolvedValue({ ...ownerInteraction, userId: "owner-id" })
  const res = await PUT(makePutReq(), interactionParams)
  expect(res.status).toBe(403)
  const data = await res.json()
  expect(data.code).toBe("FORBIDDEN")
})

it("PUT returns 200 for owner", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  mockGetInteractionById.mockResolvedValue(ownerInteraction)
  const updated = { ...ownerInteraction, summary: "Updated" }
  mockUpdateInteraction.mockResolvedValue(updated)
  const res = await PUT(makePutReq(), interactionParams)
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data.summary).toBe("Updated")
  expect(mockUpdateInteraction).toHaveBeenCalledWith("i1", expect.objectContaining({ summary: "Updated" }), "ian", "u1")
})

// DELETE tests

it("DELETE returns 401 when no session", async () => {
  mockAuth.mockResolvedValue(null)
  const res = await DELETE(new NextRequest("http://localhost/api/v1/interactions/i1"), interactionParams)
  expect(res.status).toBe(401)
  const data = await res.json()
  expect(data.code).toBe("UNAUTHORIZED")
})

it("DELETE returns 404 when interaction not found", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  mockGetInteractionById.mockResolvedValue(null)
  const res = await DELETE(new NextRequest("http://localhost/api/v1/interactions/i1"), interactionParams)
  expect(res.status).toBe(404)
  const data = await res.json()
  expect(data.code).toBe("NOT_FOUND")
})

it("DELETE returns 403 when caller is not owner", async () => {
  mockAuth.mockResolvedValue({ userId: "contributor-id" })
  mockGetInteractionById.mockResolvedValue({ ...ownerInteraction, userId: "owner-id" })
  const res = await DELETE(new NextRequest("http://localhost/api/v1/interactions/i1"), interactionParams)
  expect(res.status).toBe(403)
  const data = await res.json()
  expect(data.code).toBe("FORBIDDEN")
})

it("DELETE returns 204 for owner", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  mockGetInteractionById.mockResolvedValue(ownerInteraction)
  mockDeleteInteraction.mockResolvedValue(ownerInteraction)
  const res = await DELETE(new NextRequest("http://localhost/api/v1/interactions/i1"), interactionParams)
  expect(res.status).toBe(204)
  expect(mockDeleteInteraction).toHaveBeenCalledWith("i1", "ian", "u1")
})
