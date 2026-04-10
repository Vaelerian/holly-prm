import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/services/calendar-sync"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    calendarSync: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
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

describe("upsertCalendarEvent", () => {
  it("returns silently when Google not connected", async () => {
    mockGetGoogleClient.mockRejectedValue(new GoogleNotConnectedError())
    await expect(
      upsertCalendarEvent("task", "t1", { title: "My task", date: new Date("2026-05-01") })
    ).resolves.toBeUndefined()
    expect(mockPrisma.calendarSync.findUnique).not.toHaveBeenCalled()
  })
})

describe("deleteCalendarEvent", () => {
  it("returns silently when no CalendarSync row exists", async () => {
    mockGetGoogleClient.mockResolvedValue({} as any)
    mockPrisma.calendarSync.findUnique.mockResolvedValue(null)
    await expect(deleteCalendarEvent("task", "t1")).resolves.toBeUndefined()
    expect(mockPrisma.calendarSync.delete).not.toHaveBeenCalled()
  })
})
