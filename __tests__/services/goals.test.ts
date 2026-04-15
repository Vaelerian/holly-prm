import {
  listGoals,
  getGoal,
  createGoal,
  updateGoal,
  deleteGoal,
  completeGoal,
  getOrCreateDefaultGoal,
} from "@/lib/services/goals"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    role: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    goal: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    project: { updateMany: jest.fn() },
    task: { updateMany: jest.fn() },
    $transaction: jest.fn((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("createGoal", () => {
  it("creates a goal under a role", async () => {
    const input = {
      roleId: "r1",
      name: "Learn TypeScript",
      description: "",
      goalType: "completable" as const,
      targetDate: "2026-12-31",
    }
    const created = { id: "g1", ...input, targetDate: new Date("2026-12-31"), userId: "user-1", isDefault: false }
    mockPrisma.goal.create.mockResolvedValue(created as any)

    const result = await createGoal(input, "user-1")

    expect(mockPrisma.goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        roleId: "r1",
        name: "Learn TypeScript",
        userId: "user-1",
        targetDate: new Date("2026-12-31"),
      }),
    })
    expect(result).toEqual(created)
  })
})

describe("completeGoal", () => {
  it("completes a completable goal", async () => {
    const existing = { id: "g1", goalType: "completable", status: "active", userId: "user-1" }
    const updated = { ...existing, status: "completed" }
    mockPrisma.goal.findFirst.mockResolvedValue(existing as any)
    mockPrisma.goal.update.mockResolvedValue(updated as any)

    const result = await completeGoal("g1", "user-1")

    expect(mockPrisma.goal.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: { status: "completed" },
    })
    expect(result).toEqual(updated)
  })

  it("rejects completing an ongoing goal", async () => {
    const existing = { id: "g1", goalType: "ongoing", status: "active", userId: "user-1" }
    mockPrisma.goal.findFirst.mockResolvedValue(existing as any)

    await expect(completeGoal("g1", "user-1")).rejects.toThrow(
      "Cannot complete an ongoing goal"
    )
    expect(mockPrisma.goal.update).not.toHaveBeenCalled()
  })
})

describe("updateGoal", () => {
  it("blocks name change on default goal", async () => {
    const existing = { id: "g1", name: "Inbox", isDefault: true, userId: "user-1", roleId: "r1" }
    mockPrisma.goal.findFirst.mockResolvedValue(existing as any)

    await expect(updateGoal("g1", { name: "Renamed" }, "user-1")).rejects.toThrow(
      "Cannot rename the default goal"
    )
    expect(mockPrisma.goal.update).not.toHaveBeenCalled()
  })

  it("cascades roleId change to projects and tasks", async () => {
    const existing = { id: "g1", name: "Goal A", isDefault: false, userId: "user-1", roleId: "r1" }
    const updated = { ...existing, roleId: "r2" }
    mockPrisma.goal.findFirst.mockResolvedValue(existing as any)
    mockPrisma.goal.update.mockResolvedValue(updated as any)
    mockPrisma.project.updateMany.mockResolvedValue({ count: 1 } as any)
    mockPrisma.task.updateMany.mockResolvedValue({ count: 2 } as any)

    await updateGoal("g1", { roleId: "r2" }, "user-1")

    expect(mockPrisma.project.updateMany).toHaveBeenCalledWith({
      where: { goalId: "g1" },
      data: { roleId: "r2" },
    })
    expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
      where: { goalId: "g1" },
      data: { roleId: "r2" },
    })
  })
})

describe("deleteGoal", () => {
  it("blocks deletion of default goal", async () => {
    const existing = { id: "g1", name: "Inbox", isDefault: true, userId: "user-1" }
    mockPrisma.goal.findFirst.mockResolvedValue(existing as any)

    await expect(deleteGoal("g1", "g2", "user-1")).rejects.toThrow(
      "Cannot delete the default goal"
    )
    expect(mockPrisma.goal.delete).not.toHaveBeenCalled()
  })

  it("remaps projects and tasks with target roleId then deletes", async () => {
    const existing = { id: "g1", name: "Old Goal", isDefault: false, userId: "user-1", roleId: "r1" }
    const targetGoal = { id: "g2", name: "Target Goal", roleId: "r2", userId: "user-1" }
    // First call: find existing goal, second call: find target goal
    mockPrisma.goal.findFirst
      .mockResolvedValueOnce(existing as any)
      .mockResolvedValueOnce(targetGoal as any)
    mockPrisma.project.updateMany.mockResolvedValue({ count: 1 } as any)
    mockPrisma.task.updateMany.mockResolvedValue({ count: 2 } as any)
    mockPrisma.goal.delete.mockResolvedValue(existing as any)

    await deleteGoal("g1", "g2", "user-1")

    expect(mockPrisma.project.updateMany).toHaveBeenCalledWith({
      where: { goalId: "g1" },
      data: { goalId: "g2", roleId: "r2" },
    })
    expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
      where: { goalId: "g1" },
      data: { goalId: "g2", roleId: "r2" },
    })
    expect(mockPrisma.goal.delete).toHaveBeenCalledWith({ where: { id: "g1" } })
  })
})

describe("getOrCreateDefaultGoal", () => {
  it("returns existing default goal", async () => {
    const existingRole = { id: "r1", name: "General", isDefault: true, userId: "user-1" }
    const existingGoal = { id: "g1", name: "Inbox", isDefault: true, userId: "user-1" }
    mockPrisma.role.findFirst.mockResolvedValue(existingRole as any)
    mockPrisma.goal.findFirst.mockResolvedValue(existingGoal as any)

    const result = await getOrCreateDefaultGoal("user-1")

    expect(result).toEqual(existingGoal)
    expect(mockPrisma.goal.create).not.toHaveBeenCalled()
  })

  it("creates role and goal when none exist", async () => {
    mockPrisma.role.findFirst.mockResolvedValue(null)
    const createdRole = { id: "r-new", name: "General", isDefault: true, userId: "user-1" }
    mockPrisma.role.create.mockResolvedValue(createdRole as any)
    mockPrisma.goal.findFirst.mockResolvedValue(null)
    const createdGoal = { id: "g-new", name: "Inbox", isDefault: true, roleId: "r-new", userId: "user-1" }
    mockPrisma.goal.create.mockResolvedValue(createdGoal as any)

    const result = await getOrCreateDefaultGoal("user-1")

    expect(result).toEqual(createdGoal)
    expect(mockPrisma.role.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "General", isDefault: true, userId: "user-1" }),
    })
    expect(mockPrisma.goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Inbox",
        isDefault: true,
        roleId: "r-new",
        userId: "user-1",
      }),
    })
  })
})
