import { listTasks, getTask, createTask, updateTask, deleteTask } from "@/lib/services/tasks"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    task: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
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
    await listTasks({})
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" } })
    )
  })

  it("filters by projectId when provided", async () => {
    mockPrisma.task.findMany.mockResolvedValue([])
    await listTasks({ projectId: "proj-1" })
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: "proj-1" }) })
    )
  })

  it("filters by status when provided", async () => {
    mockPrisma.task.findMany.mockResolvedValue([])
    await listTasks({ status: "todo" })
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "todo" }) })
    )
  })
})

describe("createTask", () => {
  it("creates task and writes audit log", async () => {
    const input = { projectId: "proj-1", title: "T1", description: "", status: "todo" as const, priority: "medium" as const, assignedTo: "ian" as const, dueDate: null, isMilestone: false }
    const created = { id: "task-1", ...input }
    mockPrisma.task.create.mockResolvedValue(created as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    const result = await createTask(input, "ian")
    expect(mockPrisma.task.create).toHaveBeenCalled()
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: "Task", entityId: "task-1", action: "create", actor: "ian" }),
    })
    expect(result).toEqual(created)
  })
})

describe("updateTask", () => {
  it("updates task and writes audit log", async () => {
    const before = { id: "task-1", title: "Old", status: "todo" }
    const updated = { id: "task-1", title: "Updated", status: "done" }
    mockPrisma.task.findUnique.mockResolvedValue(before as any)
    mockPrisma.task.update.mockResolvedValue(updated as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    await updateTask("task-1", { status: "done" }, "ian")
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "task-1" } })
    )
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: "Task", entityId: "task-1", action: "update" }),
    })
  })
})
