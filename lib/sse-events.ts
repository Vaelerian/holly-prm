import { redis } from "@/lib/redis"

export type SseEventType =
  | "interaction.created"
  | "action_item.created"
  | "action_item.completed"
  | "contact.overdue"

export async function publishSseEvent(
  type: SseEventType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await redis.publish(
      "holly:events",
      JSON.stringify({ type, payload, timestamp: new Date().toISOString() })
    )
  } catch (err) {
    console.error("[sse] publish failed", type, err)
  }
}
