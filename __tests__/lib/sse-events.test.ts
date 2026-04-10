import { publishSseEvent } from "@/lib/sse-events"
import { redis } from "@/lib/redis"

jest.mock("@/lib/redis", () => ({
  redis: { publish: jest.fn() },
}))

const mockRedis = redis as jest.Mocked<typeof redis>

beforeEach(() => jest.clearAllMocks())

it("publishes a structured JSON event to the holly:events channel", async () => {
  mockRedis.publish.mockResolvedValue(1 as any)
  await publishSseEvent("interaction.created", { contactId: "c1", contactName: "Alice" })
  expect(mockRedis.publish).toHaveBeenCalledWith(
    "holly:events",
    expect.stringContaining('"type":"interaction.created"')
  )
  const [, message] = (mockRedis.publish as jest.Mock).mock.calls[0]
  const parsed = JSON.parse(message)
  expect(parsed.type).toBe("interaction.created")
  expect(parsed.payload.contactId).toBe("c1")
  expect(parsed.timestamp).toBeDefined()
})

it("does not throw when Redis publish fails", async () => {
  mockRedis.publish.mockRejectedValue(new Error("Redis down"))
  await expect(publishSseEvent("action_item.created", { id: "a1" })).resolves.not.toThrow()
})
