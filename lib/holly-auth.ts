import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import bcrypt from "bcryptjs"

interface ValidationResult {
  valid: boolean
  rateLimited?: boolean
  keyId?: string
}

export async function validateHollyRequest(req: NextRequest): Promise<ValidationResult> {
  const apiKey = req.headers.get("x-holly-api-key")
  if (!apiKey || !apiKey.startsWith("hky_")) return { valid: false }

  // Validate key before consuming rate limit quota
  const keys = await prisma.hollyApiKey.findMany()
  let matchedKeyId: string | undefined
  for (const key of keys) {
    const match = await bcrypt.compare(apiKey, key.keyHash)
    if (match) {
      matchedKeyId = key.id
      break
    }
  }

  if (!matchedKeyId) return { valid: false }

  // Rate limit using atomic pipeline with EXPIRE NX to prevent permanent TTL loss
  const rateLimitKey = `holly:ratelimit:${apiKey.slice(0, 24)}`
  let count: number
  try {
    const pipeline = redis.pipeline()
    pipeline.incr(rateLimitKey)
    pipeline.expire(rateLimitKey, 60, "NX")
    const results = await pipeline.exec()
    count = (results?.[0]?.[1] as number) ?? 0
  } catch {
    return { valid: false, rateLimited: true }
  }

  if (count > 1000) return { valid: false, rateLimited: true }

  // Fire-and-forget lastUsed update (audit write should not fail the auth check)
  prisma.hollyApiKey
    .update({ where: { id: matchedKeyId }, data: { lastUsed: new Date() } })
    .catch((err) => console.error("[holly-auth] lastUsed update failed", err))

  return { valid: true, keyId: matchedKeyId }
}
