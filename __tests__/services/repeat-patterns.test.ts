import {
  createRepeatPattern,
  deleteRepeatPattern,
  modifyRepeatInstance,
  skipRepeatInstance,
} from "@/lib/services/repeat-patterns"
import { prisma } from "@/lib/db"
import * as repeatExpand from "@/lib/services/repeat-expand"

jest.mock("@/lib/db", () => ({
  prisma: {
    repeatPattern: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    repeatException: {
      upsert: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
    },
    timeSlot: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock("@/lib/services/repeat-expand", () => ({
  isValidInstanceDate: jest.fn(),
  toDateStr: jest.requireActual("@/lib/services/repeat-expand").toDateStr,
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockIsValidInstanceDate = repeatExpand.isValidInstanceDate as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe("createRepeatPattern", () => {
  it("creates with valid data", async () => {
    const role = { id: "role-1", userId: "user-1" }
    ;(mockPrisma.role.findFirst as jest.Mock).mockResolvedValue(role)

    const created = {
      id: "rp-1",
      roleId: "role-1",
      repeatType: "weekly",
      intervalValue: 1,
      startDate: new Date("2025-01-06T00:00:00Z"),
      endDate: null,
      dayPattern: { days: [1, 3, 5] },
      startMinutes: 480,
      endMinutes: 600,
      title: "Standup",
      userId: "user-1",
    }
    ;(mockPrisma.repeatPattern.create as jest.Mock).mockResolvedValue(created)

    const result = await createRepeatPattern(
      {
        roleId: "role-1",
        repeatType: "weekly",
        intervalValue: 1,
        startDate: "2025-01-06",
        endDate: null,
        dayPattern: { days: [1, 3, 5] },
        startMinutes: 480,
        endMinutes: 600,
        title: "Standup",
      },
      "user-1"
    )

    expect(mockPrisma.repeatPattern.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roleId: "role-1",
        repeatType: "weekly",
        userId: "user-1",
      }),
    })
    expect(result).toEqual(created)
  })

  it("rejects non-owned role", async () => {
    ;(mockPrisma.role.findFirst as jest.Mock).mockResolvedValue(null)

    await expect(
      createRepeatPattern(
        {
          roleId: "role-other",
          repeatType: "daily",
          intervalValue: 1,
          startDate: "2025-01-01",
          endDate: null,
          dayPattern: {},
          startMinutes: 480,
          endMinutes: 600,
          title: "",
        },
        "user-1"
      )
    ).rejects.toThrow("Role not found or not owned by user")
  })
})

describe("deleteRepeatPattern", () => {
  it("scope 'all' deletes the pattern", async () => {
    const existing = { id: "rp-1", userId: "user-1" }
    ;(mockPrisma.repeatPattern.findFirst as jest.Mock).mockResolvedValue(existing)
    ;(mockPrisma.repeatPattern.delete as jest.Mock).mockResolvedValue(existing)

    const result = await deleteRepeatPattern("rp-1", "all", "user-1")

    expect(mockPrisma.repeatPattern.delete).toHaveBeenCalledWith({ where: { id: "rp-1" } })
    expect(result).toEqual(existing)
  })

  it("scope 'future' sets endDate to today", async () => {
    const existing = { id: "rp-1", userId: "user-1" }
    ;(mockPrisma.repeatPattern.findFirst as jest.Mock).mockResolvedValue(existing)
    ;(mockPrisma.repeatPattern.update as jest.Mock).mockResolvedValue({
      ...existing,
      endDate: expect.any(Date),
    })

    await deleteRepeatPattern("rp-1", "future", "user-1")

    expect(mockPrisma.repeatPattern.update).toHaveBeenCalledWith({
      where: { id: "rp-1" },
      data: { endDate: expect.any(Date) },
    })
    expect(mockPrisma.repeatPattern.delete).not.toHaveBeenCalled()
  })
})

describe("modifyRepeatInstance", () => {
  it("creates exception with modified type", async () => {
    const pattern = {
      id: "rp-1",
      roleId: "role-1",
      repeatType: "daily",
      intervalValue: 1,
      startDate: new Date("2025-01-01T00:00:00Z"),
      endDate: null,
      dayPattern: {},
      startMinutes: 480,
      endMinutes: 600,
      title: "Morning",
      userId: "user-1",
    }
    ;(mockPrisma.repeatPattern.findFirst as jest.Mock).mockResolvedValue(pattern)
    mockIsValidInstanceDate.mockReturnValue(true)

    const exception = {
      id: "ex-1",
      repeatPatternId: "rp-1",
      exceptionDate: new Date("2025-01-15T00:00:00Z"),
      exceptionType: "modified",
      modifiedStartMinutes: 540,
      modifiedEndMinutes: null,
      modifiedTitle: null,
    }
    ;(mockPrisma.repeatException.upsert as jest.Mock).mockResolvedValue(exception)

    const result = await modifyRepeatInstance("rp-1", "2025-01-15", { startMinutes: 540 }, "user-1")

    expect(mockPrisma.repeatException.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          repeatPatternId_exceptionDate: {
            repeatPatternId: "rp-1",
            exceptionDate: new Date("2025-01-15T00:00:00Z"),
          },
        },
        create: expect.objectContaining({
          exceptionType: "modified",
          modifiedStartMinutes: 540,
        }),
      })
    )
    expect(result).toEqual(exception)
  })

  it("rejects invalid instance date", async () => {
    const pattern = {
      id: "rp-1",
      roleId: "role-1",
      repeatType: "daily",
      intervalValue: 1,
      startDate: new Date("2025-01-01T00:00:00Z"),
      endDate: null,
      dayPattern: {},
      startMinutes: 480,
      endMinutes: 600,
      title: "Morning",
      userId: "user-1",
    }
    ;(mockPrisma.repeatPattern.findFirst as jest.Mock).mockResolvedValue(pattern)
    mockIsValidInstanceDate.mockReturnValue(false)

    await expect(
      modifyRepeatInstance("rp-1", "2024-12-01", { startMinutes: 540 }, "user-1")
    ).rejects.toThrow("Date is not a valid instance of this pattern")
  })
})

describe("skipRepeatInstance", () => {
  it("creates skipped exception", async () => {
    const pattern = {
      id: "rp-1",
      roleId: "role-1",
      repeatType: "daily",
      intervalValue: 1,
      startDate: new Date("2025-01-01T00:00:00Z"),
      endDate: null,
      dayPattern: {},
      startMinutes: 480,
      endMinutes: 600,
      title: "Morning",
      userId: "user-1",
    }
    ;(mockPrisma.repeatPattern.findFirst as jest.Mock).mockResolvedValue(pattern)
    mockIsValidInstanceDate.mockReturnValue(true)
    ;(mockPrisma.timeSlot.findFirst as jest.Mock).mockResolvedValue(null)

    const exception = {
      id: "ex-1",
      repeatPatternId: "rp-1",
      exceptionDate: new Date("2025-01-15T00:00:00Z"),
      exceptionType: "skipped",
    }
    ;(mockPrisma.repeatException.upsert as jest.Mock).mockResolvedValue(exception)

    const result = await skipRepeatInstance("rp-1", "2025-01-15", "user-1")

    expect(mockPrisma.repeatException.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          exceptionType: "skipped",
        }),
      })
    )
    expect(result).toEqual(exception)
  })

  it("rejects when materialised slot has tasks", async () => {
    const pattern = {
      id: "rp-1",
      roleId: "role-1",
      repeatType: "daily",
      intervalValue: 1,
      startDate: new Date("2025-01-01T00:00:00Z"),
      endDate: null,
      dayPattern: {},
      startMinutes: 480,
      endMinutes: 600,
      title: "Morning",
      userId: "user-1",
    }
    ;(mockPrisma.repeatPattern.findFirst as jest.Mock).mockResolvedValue(pattern)
    mockIsValidInstanceDate.mockReturnValue(true)
    ;(mockPrisma.timeSlot.findFirst as jest.Mock).mockResolvedValue({
      id: "ts-1",
      taskCount: 2,
    })

    await expect(
      skipRepeatInstance("rp-1", "2025-01-15", "user-1")
    ).rejects.toThrow("Cannot skip an instance with assigned tasks")
    expect(mockPrisma.repeatException.upsert).not.toHaveBeenCalled()
  })
})
