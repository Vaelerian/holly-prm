import { listProjects, getProject, createProject, updateProject, deleteProject } from "@/lib/services/projects"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    project: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("listProjects", () => {
  it("returns all projects ordered by createdAt desc when no status filter", async () => {
    const projects = [{ id: "1", title: "A" }, { id: "2", title: "B" }]
    mockPrisma.project.findMany.mockResolvedValue(projects as any)
    const result = await listProjects({ userId: "user-1" })
    expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    )
    expect(result).toEqual(projects)
  })

  it("filters by status when provided", async () => {
    mockPrisma.project.findMany.mockResolvedValue([])
    await listProjects({ status: "active", userId: "user-1" })
    expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "active" }),
      })
    )
  })

  it("listProjects returns owned and shared projects for userId", async () => {
    mockPrisma.project.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }] as any)

    await listProjects({ userId: "user-1" })

    expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { userId: "user-1" },
            { members: { some: { userId: "user-1" } } },
          ],
        },
      })
    )
  })
})

describe("getProject", () => {
  it("returns project with tasks", async () => {
    const project = { id: "1", title: "A", tasks: [] }
    mockPrisma.project.findFirst.mockResolvedValue(project as any)
    const result = await getProject("1", "user-1")
    expect(mockPrisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "1" }),
        include: expect.objectContaining({ tasks: expect.anything() }),
      })
    )
    expect(result).toEqual(project)
  })
})

describe("updateProject", () => {
  it("returns null when userId does not match (non-owner)", async () => {
    mockPrisma.project.findFirst.mockResolvedValue(null)
    const result = await updateProject("p1", { title: "X" } as any, "ian", "other-user")
    expect(result).toBeNull()
    expect(mockPrisma.project.update).not.toHaveBeenCalled()
  })

  it("folds userId into update where clause", async () => {
    const existing = { id: "p1", title: "Old", userId: "user-1" }
    const updated = { ...existing, title: "New" }
    mockPrisma.project.findFirst.mockResolvedValue(existing as any)
    mockPrisma.project.update.mockResolvedValue(updated as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    await updateProject("p1", { title: "New" } as any, "ian", "user-1")
    expect(mockPrisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "p1", userId: "user-1" }) })
    )
  })
})

describe("deleteProject", () => {
  it("returns null when userId does not match (non-owner)", async () => {
    mockPrisma.project.findFirst.mockResolvedValue(null)
    const result = await deleteProject("p1", "ian", "other-user")
    expect(result).toBeNull()
    expect(mockPrisma.project.delete).not.toHaveBeenCalled()
  })

  it("folds userId into delete where clause", async () => {
    const existing = { id: "p1", userId: "user-1" }
    mockPrisma.project.findFirst.mockResolvedValue(existing as any)
    mockPrisma.project.delete.mockResolvedValue(existing as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    await deleteProject("p1", "ian", "user-1")
    expect(mockPrisma.project.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "p1", userId: "user-1" }) })
    )
  })
})

describe("createProject", () => {
  it("creates project and writes audit log", async () => {
    const input = { title: "P1", description: "", category: "work" as const, status: "planning" as const, priority: "medium" as const, targetDate: null, notes: "" }
    const created = { id: "abc", ...input, userId: "user-1" }
    mockPrisma.project.create.mockResolvedValue(created as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    const result = await createProject(input, "ian", "user-1")
    expect(mockPrisma.project.create).toHaveBeenCalled()
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: "Project", entityId: "abc", action: "create", actor: "ian" }),
    })
    expect(result).toEqual(created)
  })

  it("createProject sets userId on the record", async () => {
    mockPrisma.project.create.mockResolvedValue({ id: "p1", userId: "user-1" } as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createProject({ title: "Project A" } as any, "ian", "user-1")

    expect(mockPrisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-1" }) })
    )
  })
})
