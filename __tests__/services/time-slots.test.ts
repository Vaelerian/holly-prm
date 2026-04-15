import {
  createTimeSlot,
  updateTimeSlot,
  deleteTimeSlot,
  listTimeSlotsForRange,
} from "@/lib/services/time-slots"
import { prisma } from "@/lib/db"
import * as repeatExpand from "@/lib/services/repeat-expand"

jest.mock("@/lib/db", () => ({
  prisma: {
    timeSlot: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
    },
    repeatPattern: {
      findMany: jest.fn(),
    },
  },
}))

jest.mock("@/lib/services/repeat-expand", () => ({
  expandPattern: jest.fn(),
  toDateStr: jest.requireActual("@/lib/services/repeat-expand").toDateStr,
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockExpandPattern = repeatExpand.expandPattern as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe("createTimeSlot", () => {
  it("creates with computed capacity", async () => {
    const role = { id: "role-1", userId: "user-1" }
    ;(mockPrisma.role.findFirst as jest.Mock).mockResolvedValue(role)

    const created = {
      id: "ts-1",
      roleId: "role-1",
      date: new Date("2025-01-15T00:00:00Z"),
      startMinutes: 480,
      endMinutes: 600,
      capacityMinutes: 120,
      usedMinutes: 0,
      taskCount: 0,
      title: "Work",
      userId: "user-1",
    }
    ;(mockPrisma.timeSlot.create as jest.Mock).mockResolvedValue(created)

    const result = await createTimeSlot(
      { roleId: "role-1", date: "2025-01-15", startMinutes: 480, endMinutes: 600, title: "Work" },
      "user-1"
    )

    expect(mockPrisma.timeSlot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        capacityMinutes: 120,
        startMinutes: 480,
        endMinutes: 600,
      }),
    })
    expect(result).toEqual(created)
  })

  it("rejects non-owned role", async () => {
    ;(mockPrisma.role.findFirst as jest.Mock).mockResolvedValue(null)

    await expect(
      createTimeSlot(
        { roleId: "role-other", date: "2025-01-15", startMinutes: 480, endMinutes: 600, title: "" },
        "user-1"
      )
    ).rejects.toThrow("Role not found or not owned by user")
  })
})

describe("deleteTimeSlot", () => {
  it("deletes when no tasks assigned", async () => {
    const existing = { id: "ts-1", userId: "user-1", taskCount: 0 }
    ;(mockPrisma.timeSlot.findFirst as jest.Mock).mockResolvedValue(existing)
    ;(mockPrisma.timeSlot.delete as jest.Mock).mockResolvedValue(existing)

    const result = await deleteTimeSlot("ts-1", "user-1")

    expect(mockPrisma.timeSlot.delete).toHaveBeenCalledWith({ where: { id: "ts-1" } })
    expect(result).toEqual(existing)
  })

  it("rejects when tasks are assigned", async () => {
    const existing = { id: "ts-1", userId: "user-1", taskCount: 3 }
    ;(mockPrisma.timeSlot.findFirst as jest.Mock).mockResolvedValue(existing)

    await expect(deleteTimeSlot("ts-1", "user-1")).rejects.toThrow(
      "Cannot delete a time slot with assigned tasks"
    )
    expect(mockPrisma.timeSlot.delete).not.toHaveBeenCalled()
  })
})

describe("listTimeSlotsForRange", () => {
  it("returns concrete slots", async () => {
    const concreteSlots = [
      {
        id: "ts-1",
        roleId: "role-1",
        date: new Date("2025-01-15T00:00:00Z"),
        startMinutes: 480,
        endMinutes: 600,
        capacityMinutes: 120,
        usedMinutes: 30,
        taskCount: 1,
        title: "Work",
        repeatPatternId: null,
        userId: "user-1",
      },
    ]
    ;(mockPrisma.timeSlot.findMany as jest.Mock).mockResolvedValue(concreteSlots)
    ;(mockPrisma.repeatPattern.findMany as jest.Mock).mockResolvedValue([])
    mockExpandPattern.mockReturnValue([])

    const result = await listTimeSlotsForRange("user-1", "2025-01-15", "2025-01-15")

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("ts-1")
    expect(result[0].isVirtual).toBe(false)
    expect(result[0].date).toBe("2025-01-15")
  })

  it("merges concrete and virtual slots sorted by date then startMinutes", async () => {
    const concreteSlots = [
      {
        id: "ts-1",
        roleId: "role-1",
        date: new Date("2025-01-15T00:00:00Z"),
        startMinutes: 600,
        endMinutes: 720,
        capacityMinutes: 120,
        usedMinutes: 0,
        taskCount: 0,
        title: "Afternoon",
        repeatPatternId: null,
        userId: "user-1",
      },
    ]
    const pattern = {
      id: "rp-1",
      roleId: "role-1",
      repeatType: "daily",
      intervalValue: 1,
      startDate: new Date("2025-01-01T00:00:00Z"),
      endDate: null,
      dayPattern: {},
      startMinutes: 480,
      endMinutes: 540,
      title: "Morning",
      userId: "user-1",
      exceptions: [],
    }
    ;(mockPrisma.timeSlot.findMany as jest.Mock).mockResolvedValue(concreteSlots)
    ;(mockPrisma.repeatPattern.findMany as jest.Mock).mockResolvedValue([pattern])
    mockExpandPattern.mockReturnValue([
      {
        id: "rp:rp-1:2025-01-15",
        roleId: "role-1",
        date: "2025-01-15",
        startMinutes: 480,
        endMinutes: 540,
        capacityMinutes: 60,
        usedMinutes: 0,
        taskCount: 0,
        title: "Morning",
        isVirtual: true,
        repeatPatternId: "rp-1",
      },
    ])

    const result = await listTimeSlotsForRange("user-1", "2025-01-15", "2025-01-15")

    expect(result).toHaveLength(2)
    // Virtual morning slot should come first (480 < 600)
    expect(result[0].startMinutes).toBe(480)
    expect(result[0].isVirtual).toBe(true)
    expect(result[1].startMinutes).toBe(600)
    expect(result[1].isVirtual).toBe(false)
  })
})
