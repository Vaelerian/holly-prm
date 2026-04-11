import { createActionItem, updateActionItemStatus } from "@/lib/services/action-items"
import { prisma } from "@/lib/db"
import { publishSseEvent } from "@/lib/sse-events"

jest.mock("@/lib/db", () => ({
  prisma: {
    actionItem: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}))

jest.mock("@/lib/sse-events", () => ({
  publishSseEvent: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("createActionItem", () => {
  it("creates action item and publishes SSE event", async () => {
    const input = {
      title: "Send email",
      status: "todo" as const,
      priority: "medium" as const,
      assignedTo: "ian" as const,
      dueDate: null,
      interactionId: null,
      taskId: null,
    }
    const created = { id: "a1", ...input }
    mockPrisma.actionItem.create.mockResolvedValue(created as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createActionItem(input, "ian", "user-1")

    expect(mockPrisma.actionItem.create).toHaveBeenCalled()
    expect(publishSseEvent).toHaveBeenCalledWith(
      "action_item.created",
      expect.objectContaining({ id: "a1", title: "Send email", assignedTo: "ian" })
    )
  })
})

describe("updateActionItemStatus", () => {
  it("publishes action_item.completed when status changes to done", async () => {
    const existing = { id: "a1", title: "Send email", assignedTo: "ian", status: "todo" }
    const updated = { ...existing, status: "done" }
    mockPrisma.actionItem.findFirst.mockResolvedValue(existing as any)
    mockPrisma.actionItem.update.mockResolvedValue(updated as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await updateActionItemStatus("a1", { status: "done" }, "ian", "user-1")

    expect(publishSseEvent).toHaveBeenCalledWith(
      "action_item.completed",
      expect.objectContaining({ id: "a1", title: "Send email", assignedTo: "ian" })
    )
  })

  it("does not publish SSE when status does not change to done", async () => {
    const existing = { id: "a1", title: "Send email", assignedTo: "ian", status: "todo" }
    const updated = { ...existing, status: "cancelled" }
    mockPrisma.actionItem.findFirst.mockResolvedValue(existing as any)
    mockPrisma.actionItem.update.mockResolvedValue(updated as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await updateActionItemStatus("a1", { status: "cancelled" }, "ian", "user-1")

    expect(publishSseEvent).not.toHaveBeenCalled()
  })
})
