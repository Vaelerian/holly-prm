import { NextRequest } from "next/server"
import Redis from "ioredis"
import { validateHollyRequest } from "@/lib/holly-auth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", code: "RATE_LIMITED" }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } }
      )
    }
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    )
  }

  const encoder = new TextEncoder()
  let pingInterval: ReturnType<typeof setInterval> | undefined
  let subscriber: Redis | undefined

  const stream = new ReadableStream({
    start(controller) {
      subscriber = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
        maxRetriesPerRequest: 3,
        lazyConnect: false,
      })

      subscriber.subscribe("holly:events", (err) => {
        if (err) {
          console.error("[sse] subscribe error", err)
          try { controller.close() } catch {}
          return
        }
        try {
          controller.enqueue(encoder.encode(`data: {"type":"connected"}\n\n`))
        } catch {}
      })

      subscriber.on("message", (_channel: string, message: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`))
        } catch (err) {
          console.error("[sse] enqueue failed", err)
        }
      })

      subscriber.on("error", (err) => {
        console.error("[sse] redis subscriber error", err)
      })

      pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch {
          clearInterval(pingInterval)
        }
      }, 30000)

      req.signal.addEventListener("abort", () => {
        clearInterval(pingInterval)
        subscriber?.unsubscribe("holly:events").catch(() => {})
        subscriber?.quit().catch(() => {})
      })
    },
    cancel() {
      clearInterval(pingInterval)
      subscriber?.unsubscribe("holly:events").catch(() => {})
      subscriber?.quit().catch(() => {})
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
