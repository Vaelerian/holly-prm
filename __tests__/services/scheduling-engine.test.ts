import { scheduleTask, suggestDate, refreshUrgency } from "@/lib/services/scheduling-engine"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    task: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    timeSlot: {
      create: jest.fn(),
      update: jest.fn(),
    },
    userPreference: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock("@/lib/services/time-slots", () => ({
  listTimeSlotsForRange: jest.fn(),
}))

// Keep pure helpers real, but mock getSchedulingPrefs to avoid DB call
jest.mock("@/lib/services/scheduling-helpers", () => {
  const actual = jest.requireActual("@/lib/services/scheduling-helpers")
  return {
    ...actual,
    getSchedulingPrefs: jest.fn().mockResolvedValue(actual.getDefaultSchedulingPrefs()),
  }
})

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const { listTimeSlotsForRange } = jest.requireMock("@/lib/services/time-slots") as {
  listTimeSlotsForRange: jest.Mock
}

beforeEach(() => jest.clearAllMocks())

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Test Task",
    status: "todo",
    importance: "step",
    urgency: "soon",
    effortSize: "hour",
    effortMinutes: null,
    dueDate: null,
    roleId: "role-1",
    goalId: "goal-1",
    projectId: null,
    timeSlotId: null,
    scheduleState: "unscheduled",
    project: null,
    role: { id: "role-1" },
    ...overrides,
  }
}

function makeSlot(overrides: Record<string, unknown> = {}) {
  return {
    id: "slot-1",
    roleId: "role-1",
    date: "2026-04-16",
    startMinutes: 480,
    endMinutes: 720,
    capacityMinutes: 240,
    usedMinutes: 0,
    taskCount: 0,
    title: "Morning",
    isVirtual: false,
    repeatPatternId: null,
    ...overrides,
  }
}

describe("scheduleTask", () => {
  it("assigns task to first slot with capacity", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(makeTask() as any)
    listTimeSlotsForRange.mockResolvedValue([makeSlot()])
    mockPrisma.timeSlot.update.mockResolvedValue({} as any)
    mockPrisma.task.update.mockResolvedValue({} as any)

    const result = await scheduleTask("task-1", "user-1")

    expect(result.scheduled).toBe(true)
    expect(result.timeSlotId).toBe("slot-1")
    expect(result.date).toBe("2026-04-16")
    expect(mockPrisma.timeSlot.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "slot-1" },
        data: { usedMinutes: { increment: 90 }, taskCount: { increment: 1 } },
      })
    )
  })

  it("returns alert when no slot has capacity", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(makeTask() as any)
    listTimeSlotsForRange.mockResolvedValue([
      makeSlot({ capacityMinutes: 240, usedMinutes: 200 }),
    ])
    mockPrisma.task.update.mockResolvedValue({} as any)

    const result = await scheduleTask("task-1", "user-1")

    expect(result.scheduled).toBe(false)
    expect(result.scheduleState).toBe("alert")
    expect(result.reason).toContain("No slot")
  })

  it("sets fixed schedule state for core importance", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(
      makeTask({ importance: "core" }) as any
    )
    listTimeSlotsForRange.mockResolvedValue([makeSlot()])
    mockPrisma.timeSlot.update.mockResolvedValue({} as any)
    mockPrisma.task.update.mockResolvedValue({} as any)

    const result = await scheduleTask("task-1", "user-1")

    expect(result.scheduled).toBe(true)
    expect(result.scheduleState).toBe("fixed")
  })

  it("materialises virtual slots before assigning", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(makeTask() as any)
    listTimeSlotsForRange.mockResolvedValue([
      makeSlot({ isVirtual: true, id: "virtual-1", repeatPatternId: "rp-1" }),
    ])
    mockPrisma.timeSlot.create.mockResolvedValue({ id: "new-slot-1" } as any)
    mockPrisma.timeSlot.update.mockResolvedValue({} as any)
    mockPrisma.task.update.mockResolvedValue({} as any)

    const result = await scheduleTask("task-1", "user-1")

    expect(result.scheduled).toBe(true)
    expect(result.timeSlotId).toBe("new-slot-1")
    expect(mockPrisma.timeSlot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          repeatPatternId: "rp-1",
          roleId: "role-1",
        }),
      })
    )
  })

  it("rejects task with undefined_imp importance", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(
      makeTask({ importance: "undefined_imp" }) as any
    )

    const result = await scheduleTask("task-1", "user-1")

    expect(result.scheduled).toBe(false)
    expect(result.reason).toContain("undefined")
  })

  it("rejects completed tasks", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(
      makeTask({ status: "done" }) as any
    )

    const result = await scheduleTask("task-1", "user-1")

    expect(result.scheduled).toBe(false)
    expect(result.reason).toContain("done")
  })
})

describe("suggestDate", () => {
  it("returns suggestion without modifying data", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(makeTask() as any)
    listTimeSlotsForRange.mockResolvedValue([makeSlot()])

    const result = await suggestDate("task-1", "user-1")

    expect(result.found).toBe(true)
    expect(result.date).toBe("2026-04-16")
    expect(result.slotId).toBe("slot-1")
    // Should NOT have called any update methods
    expect(mockPrisma.task.update).not.toHaveBeenCalled()
    expect(mockPrisma.timeSlot.update).not.toHaveBeenCalled()
    expect(mockPrisma.timeSlot.create).not.toHaveBeenCalled()
  })

  it("returns not found when no capacity", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(makeTask() as any)
    listTimeSlotsForRange.mockResolvedValue([
      makeSlot({ capacityMinutes: 10, usedMinutes: 10 }),
    ])

    const result = await suggestDate("task-1", "user-1")

    expect(result.found).toBe(false)
    expect(result.reason).toContain("No slot")
  })
})

describe("refreshUrgency", () => {
  it("escalates to asap when due within asapDays", async () => {
    const tomorrow = new Date()
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

    mockPrisma.task.findMany.mockResolvedValue([
      {
        id: "task-1",
        urgency: "soon",
        dueDate: tomorrow,
        status: "todo",
      },
    ] as any)
    mockPrisma.task.update.mockResolvedValue({} as any)

    const count = await refreshUrgency("user-1")

    expect(count).toBe(1)
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: { urgency: "asap" },
      })
    )
  })

  it("escalates to soon when due within soonDays but not asapDays", async () => {
    const inFiveDays = new Date()
    inFiveDays.setUTCDate(inFiveDays.getUTCDate() + 5)

    mockPrisma.task.findMany.mockResolvedValue([
      {
        id: "task-2",
        urgency: "sometime",
        dueDate: inFiveDays,
        status: "todo",
      },
    ] as any)
    mockPrisma.task.update.mockResolvedValue({} as any)

    const count = await refreshUrgency("user-1")

    expect(count).toBe(1)
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-2" },
        data: { urgency: "soon" },
      })
    )
  })

  it("does not demote urgency", async () => {
    const inTwentyDays = new Date()
    inTwentyDays.setUTCDate(inTwentyDays.getUTCDate() + 20)

    mockPrisma.task.findMany.mockResolvedValue([
      {
        id: "task-3",
        urgency: "asap",
        dueDate: inTwentyDays,
        status: "todo",
      },
    ] as any)

    const count = await refreshUrgency("user-1")

    expect(count).toBe(0)
    expect(mockPrisma.task.update).not.toHaveBeenCalled()
  })
})
