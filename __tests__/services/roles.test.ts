import {
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  getOrCreateDefaultRole,
} from "@/lib/services/roles"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    role: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    goal: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    project: { updateMany: jest.fn() },
    task: { updateMany: jest.fn() },
    $transaction: jest.fn((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("createRole", () => {
  it("creates a role with userId", async () => {
    const input = { name: "Work", description: "", colour: "#6366F1", icon: "" }
    const created = { id: "r1", ...input, userId: "user-1", isDefault: false, sortOrder: 0 }
    mockPrisma.role.create.mockResolvedValue(created as any)

    const result = await createRole(input, "user-1")

    expect(mockPrisma.role.create).toHaveBeenCalledWith({
      data: { ...input, userId: "user-1" },
    })
    expect(result).toEqual(created)
  })
})

describe("updateRole", () => {
  it("blocks name change on default role", async () => {
    const existing = { id: "r1", name: "General", isDefault: true, userId: "user-1" }
    mockPrisma.role.findFirst.mockResolvedValue(existing as any)

    await expect(updateRole("r1", { name: "Renamed" }, "user-1")).rejects.toThrow(
      "Cannot rename the default role"
    )
    expect(mockPrisma.role.update).not.toHaveBeenCalled()
  })

  it("allows colour change on default role", async () => {
    const existing = { id: "r1", name: "General", isDefault: true, userId: "user-1" }
    const updated = { ...existing, colour: "#FF0000" }
    mockPrisma.role.findFirst.mockResolvedValue(existing as any)
    mockPrisma.role.update.mockResolvedValue(updated as any)

    const result = await updateRole("r1", { colour: "#FF0000" }, "user-1")

    expect(mockPrisma.role.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { colour: "#FF0000" },
    })
    expect(result).toEqual(updated)
  })
})

describe("deleteRole", () => {
  it("blocks deletion of default role", async () => {
    const existing = { id: "r1", name: "General", isDefault: true, userId: "user-1" }
    mockPrisma.role.findFirst.mockResolvedValue(existing as any)

    await expect(deleteRole("r1", "r2", "user-1")).rejects.toThrow(
      "Cannot delete the default role"
    )
    expect(mockPrisma.role.delete).not.toHaveBeenCalled()
  })

  it("remaps goals, projects, and tasks then deletes", async () => {
    const existing = { id: "r1", name: "Old", isDefault: false, userId: "user-1" }
    mockPrisma.role.findFirst.mockResolvedValue(existing as any)
    mockPrisma.goal.updateMany.mockResolvedValue({ count: 1 } as any)
    mockPrisma.project.updateMany.mockResolvedValue({ count: 2 } as any)
    mockPrisma.task.updateMany.mockResolvedValue({ count: 3 } as any)
    mockPrisma.role.delete.mockResolvedValue(existing as any)

    await deleteRole("r1", "r2", "user-1")

    expect(mockPrisma.goal.updateMany).toHaveBeenCalledWith({
      where: { roleId: "r1" },
      data: { roleId: "r2" },
    })
    expect(mockPrisma.project.updateMany).toHaveBeenCalledWith({
      where: { roleId: "r1" },
      data: { roleId: "r2" },
    })
    expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
      where: { roleId: "r1" },
      data: { roleId: "r2" },
    })
    expect(mockPrisma.role.delete).toHaveBeenCalledWith({ where: { id: "r1" } })
  })
})

describe("getOrCreateDefaultRole", () => {
  it("returns existing default role", async () => {
    const existing = { id: "r1", name: "General", isDefault: true, userId: "user-1" }
    mockPrisma.role.findFirst.mockResolvedValue(existing as any)

    const result = await getOrCreateDefaultRole("user-1")

    expect(result).toEqual(existing)
    expect(mockPrisma.role.create).not.toHaveBeenCalled()
  })

  it("creates new default role and goal when none exists", async () => {
    mockPrisma.role.findFirst.mockResolvedValue(null)
    const createdRole = { id: "r-new", name: "General", isDefault: true, userId: "user-1" }
    mockPrisma.role.create.mockResolvedValue(createdRole as any)
    mockPrisma.goal.create.mockResolvedValue({ id: "g-new" } as any)

    const result = await getOrCreateDefaultRole("user-1")

    expect(result).toEqual(createdRole)
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

describe("listRoles", () => {
  it("returns roles ordered by sortOrder then name", async () => {
    const roles = [
      { id: "r1", name: "A", sortOrder: 0 },
      { id: "r2", name: "B", sortOrder: 1 },
    ]
    mockPrisma.role.findMany.mockResolvedValue(roles as any)

    const result = await listRoles("user-1")

    expect(mockPrisma.role.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      })
    )
    expect(result).toEqual(roles)
  })
})
