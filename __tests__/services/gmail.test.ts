import { fetchRecentEmails, getEmailThread } from "@/lib/services/gmail"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    contact: { findMany: jest.fn() },
    googleToken: { findFirst: jest.fn() },
  },
}))

jest.mock("@/lib/google", () => ({
  getGoogleClient: jest.fn(),
  GoogleNotConnectedError: class GoogleNotConnectedError extends Error {
    constructor() { super("not connected"); this.name = "GoogleNotConnectedError" }
  },
}))

import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google"
const mockGetGoogleClient = getGoogleClient as jest.MockedFunction<typeof getGoogleClient>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("fetchRecentEmails", () => {
  it("returns empty array when Google not connected", async () => {
    mockGetGoogleClient.mockRejectedValue(new GoogleNotConnectedError())
    const result = await fetchRecentEmails()
    expect(result).toEqual([])
  })

  it("returns empty array when no contacts have emails", async () => {
    mockGetGoogleClient.mockResolvedValue({} as any)
    mockPrisma.contact.findMany.mockResolvedValue([])
    const result = await fetchRecentEmails()
    expect(result).toEqual([])
  })
})

describe("getEmailThread", () => {
  it("returns null when Google not connected", async () => {
    mockGetGoogleClient.mockRejectedValue(new GoogleNotConnectedError())
    const result = await getEmailThread("thread-123")
    expect(result).toBeNull()
  })
})
