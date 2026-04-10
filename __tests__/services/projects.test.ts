import { listProjects, getProject, createProject, updateProject, deleteProject } from "@/lib/services/projects"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    project: {
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

describe("listProjects", () => {
  it("returns all projects ordered by createdAt desc when no status filter", async () => {
    const projects = [{ id: "1", title: "A" }, { id: "2", title: "B" }]
    mockPrisma.project.findMany.mockResolvedValue(projects as any)
    const result = await listProjects({})
    expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    )
    expect(result).toEqual(projects)
  })

  it("filters by status when provided", async () => {
    mockPrisma.project.findMany.mockResolvedValue([])
    await listProjects({ status: "active" })
    expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "active" } })
    )
  })
})

describe("getProject", () => {
  it("returns project with tasks", async () => {
    const project = { id: "1", title: "A", tasks: [] }
    mockPrisma.project.findUnique.mockResolvedValue(project as any)
    const result = await getProject("1")
    expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
      where: { id: "1" },
      include: expect.objectContaining({ tasks: expect.anything() }),
    })
    expect(result).toEqual(project)
  })
})

describe("createProject", () => {
  it("creates project and writes audit log", async () => {
    const input = { title: "P1", description: "", category: "work" as const, status: "planning" as const, priority: "medium" as const, targetDate: null, notes: "" }
    const created = { id: "abc", ...input }
    mockPrisma.project.create.mockResolvedValue(created as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    const result = await createProject(input, "ian")
    expect(mockPrisma.project.create).toHaveBeenCalled()
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: "Project", entityId: "abc", action: "create", actor: "ian" }),
    })
    expect(result).toEqual(created)
  })
})
