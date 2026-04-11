import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import bcrypt from "bcryptjs"

type ValidationResult =
  | { valid: true; keyId: string; userId: string }
  | { valid: false; rateLimited?: boolean }

export async function validateHollyRequest(req: NextRequest): Promise<ValidationResult> {
  const apiKey = req.headers.get("x-holly-api-key")
  if (!apiKey || !apiKey.startsWith("hky_")) return { valid: false }

  const keys = await prisma.hollyApiKey.findMany()
  let matchedKeyId: string | undefined
  let matchedUserId: string | null | undefined
  for (const key of keys) {
    const match = await bcrypt.compare(apiKey, key.keyHash)
    if (match) {
      matchedKeyId = key.id
      matchedUserId = key.userId
      break
    }
  }

  if (!matchedKeyId) return { valid: false }

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

  // Reject unclaimed keys (no userId assigned) -- user must claim data first
  if (!matchedUserId) return { valid: false }

  prisma.hollyApiKey
    .update({ where: { id: matchedKeyId }, data: { lastUsed: new Date() } })
    .catch((err) => console.error("[holly-auth] lastUsed update failed", err))

  return { valid: true, keyId: matchedKeyId, userId: matchedUserId }
}
