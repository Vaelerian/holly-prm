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

  const rateLimitKey = `holly:ratelimit:${apiKey.slice(0, 24)}`
  const count = await redis.incr(rateLimitKey)
  if (count === 1) await redis.expire(rateLimitKey, 60)
  if (count > 1000) return { valid: false, rateLimited: true }

  const keys = await prisma.hollyApiKey.findMany()
  for (const key of keys) {
    const match = await bcrypt.compare(apiKey, key.keyHash)
    if (match) {
      await prisma.hollyApiKey.update({ where: { id: key.id }, data: { lastUsed: new Date() } })
      return { valid: true, keyId: key.id }
    }
  }

  return { valid: false }
}
