import { listTasks, getTask, createTask, updateTask, deleteTask } from "@/lib/services/tasks"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    task: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    project: {
      findFirst: jest.fn(),
    },
    goal: {
      findFirst: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  },
}))

jest.mock("@/lib/services/goals", () => ({
  getOrCreateDefaultGoal: jest.fn().mockResolvedValue({ id: "default-goal-id", roleId: "default-role-id" }),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("listTasks", () => {
  it("returns tasks ordered by createdAt asc", async () => {
    const tasks = [{ id: "1", title: "T1" }]
    mockPrisma.task.findMany.mockResolvedValue(tasks as any)
    await listTasks({ userId: "user-1" })
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" } })
    )
  })

  it("scopes tasks to projects owned/shared or goals owned by the user", async () => {
    mockPrisma.task.findMany.mockResolvedValue([])
    await listTasks({ userId: "user-1" })
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { project: { OR: [{ userId: "user-1" }, { members: { some: { userId: "user-1" } } }, { visibility: "shared" }] } },
            { projectId: null, goal: { userId: "user-1" } },
          ],
        }),
      })
    )
  })

  it("filters by projectId when provided", async () => {
    mockPrisma.task.findMany.mockResolvedValue([])
    await listTasks({ projectId: "proj-1", userId: "user-1" })
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: "proj-1" }) })
    )
  })

  it("filters by status when provided", async () => {
    mockPrisma.task.findMany.mockResolvedValue([])
    await listTasks({ status: "todo", userId: "user-1" })
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "todo" }) })
    )
  })

  it("filters by roleId and goalId when provided", async () => {
    mockPrisma.task.findMany.mockResolvedValue([])
    await listTasks({ roleId: "role-1", goalId: "goal-1", userId: "user-1" })
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ roleId: "role-1", goalId: "goal-1" }),
      })
    )
  })
})

describe("getTask", () => {
  it("returns task with project, goal, role, and actionItems when user has access", async () => {
    const task = { id: "task-1", title: "T1", project: { id: "proj-1", title: "P1" }, actionItems: [] }
    mockPrisma.task.findFirst.mockResolvedValue(task as any)
    const result = await getTask("task-1", "user-1")
    expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
      where: {
        id: "task-1",
        OR: [
          { project: { OR: [{ userId: "user-1" }, { members: { some: { userId: "user-1" } } }, { visibility: "shared" }] } },
          { projectId: null, goal: { userId: "user-1" } },
        ],
      },
      include: expect.objectContaining({
        project: expect.anything(),
        goal: expect.anything(),
        role: expect.anything(),
        actionItems: expect.anything(),
      }),
    })
    expect(result).toEqual(task)
  })

  it("returns null when user does not have access to the task's project", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(null)
    const result = await getTask("task-1", "other-user")
    expect(result).toBeNull()
  })
})

describe("createTask", () => {
  it("creates task and writes audit log when user has project access", async () => {
    const input = { projectId: "proj-1", goalId: "goal-1", title: "T1", description: "", status: "todo" as const, priority: "medium" as const, assignedTo: "ian" as const, dueDate: null, isMilestone: false }
    const created = { id: "task-1", ...input }
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "goal-1", roleId: "role-1", userId: "user-1" } as any)
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1", goalId: "goal-1" } as any)
    mockPrisma.task.create.mockResolvedValue(created as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    const result = await createTask(input, "ian", "user-1")
    expect(mockPrisma.task.create).toHaveBeenCalled()
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: "Task", entityId: "task-1", action: "create", actor: "ian", userId: "user-1" }),
    })
    expect(result).toEqual(created)
  })

  it("returns null when user does not have access to the project", async () => {
    const input = { projectId: "proj-1", goalId: "goal-1", title: "T1", description: "", status: "todo" as const, priority: "medium" as const, assignedTo: "ian" as const, dueDate: null, isMilestone: false }
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "goal-1", roleId: "role-1", userId: "user-1" } as any)
    mockPrisma.project.findFirst.mockResolvedValue(null)
    const result = await createTask(input, "ian", "other-user")
    expect(result).toBeNull()
    expect(mockPrisma.task.create).not.toHaveBeenCalled()
  })

  it("creates task with goalId and derives roleId", async () => {
    const input = { projectId: null, goalId: "goal-1", title: "T1", description: "", status: "todo" as const, priority: "medium" as const, assignedTo: "ian" as const, dueDate: null, isMilestone: false }
    const created = { id: "task-1", ...input, roleId: "role-1" }
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "goal-1", roleId: "role-1", userId: "user-1" } as any)
    mockPrisma.task.create.mockResolvedValue(created as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    const result = await createTask(input, "ian", "user-1")
    expect(mockPrisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ goalId: "goal-1", roleId: "role-1" }),
    })
    expect(result).toEqual(created)
  })

  it("creates task without projectId (directly under goal)", async () => {
    const input = { title: "T1", description: "", status: "todo" as const, priority: "medium" as const, assignedTo: "ian" as const, dueDate: null, isMilestone: false, goalId: "goal-1" }
    const created = { id: "task-1", ...input, projectId: null, roleId: "role-1" }
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "goal-1", roleId: "role-1", userId: "user-1" } as any)
    mockPrisma.task.create.mockResolvedValue(created as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    const result = await createTask(input, "ian", "user-1")
    expect(mockPrisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: null, goalId: "goal-1", roleId: "role-1" }),
    })
    expect(mockPrisma.project.findFirst).not.toHaveBeenCalled()
    expect(result).toEqual(created)
  })

  it("rejects when projectId goal does not match", async () => {
    const input = { projectId: "proj-1", goalId: "goal-1", title: "T1", description: "", status: "todo" as const, priority: "medium" as const, assignedTo: "ian" as const, dueDate: null, isMilestone: false }
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "goal-1", roleId: "role-1", userId: "user-1" } as any)
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1", goalId: "goal-2" } as any)
    const result = await createTask(input, "ian", "user-1")
    expect(result).toBeNull()
    expect(mockPrisma.task.create).not.toHaveBeenCalled()
  })

  it("falls back to default goal when goalId not provided", async () => {
    const { getOrCreateDefaultGoal } = require("@/lib/services/goals")
    const input = { title: "T1", description: "", status: "todo" as const, priority: "medium" as const, assignedTo: "ian" as const, dueDate: null, isMilestone: false }
    const created = { id: "task-1", ...input, goalId: "default-goal-id", roleId: "default-role-id", projectId: null }
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "default-goal-id", roleId: "default-role-id", userId: "user-1" } as any)
    mockPrisma.task.create.mockResolvedValue(created as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    const result = await createTask(input, "ian", "user-1")
    expect(getOrCreateDefaultGoal).toHaveBeenCalledWith("user-1")
    expect(mockPrisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ goalId: "default-goal-id", roleId: "default-role-id" }),
    })
    expect(result).toEqual(created)
  })
})

describe("updateTask", () => {
  it("updates task and writes audit log when user has project access", async () => {
    const existing = { id: "task-1", title: "Old", status: "todo" }
    const updated = { id: "task-1", title: "Old", status: "done" }
    mockPrisma.task.findFirst.mockResolvedValue(existing as any)
    mockPrisma.task.update.mockResolvedValue(updated as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    await updateTask("task-1", { status: "done" }, "ian", "user-1")
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "task-1" } })
    )
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity: "Task",
        entityId: "task-1",
        action: "update",
        userId: "user-1",
        diff: expect.objectContaining({ before: expect.anything(), after: expect.anything() }),
      }),
    })
  })

  it("returns null when user does not have access to the task's project", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(null)
    const result = await updateTask("task-1", { status: "done" }, "ian", "other-user")
    expect(result).toBeNull()
    expect(mockPrisma.task.update).not.toHaveBeenCalled()
  })
})

describe("deleteTask", () => {
  it("logs delete then removes the task when user is project owner", async () => {
    const existing = { id: "task-1", title: "T1" }
    mockPrisma.task.findFirst.mockResolvedValue(existing as any)
    mockPrisma.task.delete.mockResolvedValue({ id: "task-1" } as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    await deleteTask("task-1", "ian", "user-1")
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: "Task", entityId: "task-1", action: "delete", userId: "user-1" }),
    })
    expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: "task-1" } })
  })

  it("returns null when user is not the project owner", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(null)
    const result = await deleteTask("task-1", "ian", "member-user")
    expect(result).toBeNull()
    expect(mockPrisma.task.delete).not.toHaveBeenCalled()
  })

  it("uses owner-only check including goal ownership for tasks without projects", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(null)
    await deleteTask("task-1", "ian", "member-user")
    expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
      where: {
        id: "task-1",
        OR: [
          { project: { OR: [{ userId: "member-user" }, { members: { some: { userId: "member-user" } } }, { visibility: "shared" }] } },
          { projectId: null, goal: { userId: "member-user" } },
        ],
      },
    })
  })
})
