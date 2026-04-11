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
    auditLog: { create: jest.fn() },
  },
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

  it("scopes tasks to projects owned or shared with the user", async () => {
    mockPrisma.task.findMany.mockResolvedValue([])
    await listTasks({ userId: "user-1" })
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          project: {
            OR: [
              { userId: "user-1" },
              { members: { some: { userId: "user-1" } } },
            ],
          },
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
})

describe("getTask", () => {
  it("returns task with project and actionItems when user has access", async () => {
    const task = { id: "task-1", title: "T1", project: { id: "proj-1", title: "P1" }, actionItems: [] }
    mockPrisma.task.findFirst.mockResolvedValue(task as any)
    const result = await getTask("task-1", "user-1")
    expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
      where: {
        id: "task-1",
        project: {
          OR: [
            { userId: "user-1" },
            { members: { some: { userId: "user-1" } } },
          ],
        },
      },
      include: expect.objectContaining({
        project: expect.anything(),
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
    const input = { projectId: "proj-1", title: "T1", description: "", status: "todo" as const, priority: "medium" as const, assignedTo: "ian" as const, dueDate: null, isMilestone: false }
    const created = { id: "task-1", ...input }
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" } as any)
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
    const input = { projectId: "proj-1", title: "T1", description: "", status: "todo" as const, priority: "medium" as const, assignedTo: "ian" as const, dueDate: null, isMilestone: false }
    mockPrisma.project.findFirst.mockResolvedValue(null)
    const result = await createTask(input, "ian", "other-user")
    expect(result).toBeNull()
    expect(mockPrisma.task.create).not.toHaveBeenCalled()
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

  it("uses owner-only check (does not allow members to delete)", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(null)
    await deleteTask("task-1", "ian", "member-user")
    expect(mockPrisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: "task-1", project: { userId: "member-user" } },
    })
  })
})
