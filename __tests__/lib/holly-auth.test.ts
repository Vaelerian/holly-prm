import { validateHollyRequest } from "@/lib/holly-auth"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import bcrypt from "bcryptjs"
import { NextRequest } from "next/server"

jest.mock("@/lib/db", () => ({
  prisma: { hollyApiKey: { findMany: jest.fn(), update: jest.fn() } },
}))
jest.mock("@/lib/redis", () => ({
  redis: { incr: jest.fn(), expire: jest.fn() },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockRedis = redis as jest.Mocked<typeof redis>

beforeEach(() => jest.clearAllMocks())

function makeRequest(apiKey?: string) {
  const headers: Record<string, string> = {}
  if (apiKey) headers["x-holly-api-key"] = apiKey
  return new NextRequest("http://localhost/api/holly/v1/briefing", { headers })
}

it("rejects request with no API key", async () => {
  const result = await validateHollyRequest(makeRequest())
  expect(result.valid).toBe(false)
})

it("rejects request with wrong prefix", async () => {
  const result = await validateHollyRequest(makeRequest("wrong_abc123"))
  expect(result.valid).toBe(false)
})

it("returns valid=false when rate limit exceeded", async () => {
  mockRedis.incr.mockResolvedValue(1001 as any)
  mockRedis.expire.mockResolvedValue(1 as any)
  const result = await validateHollyRequest(makeRequest("hky_testkey"))
  expect(result.valid).toBe(false)
  expect(result.rateLimited).toBe(true)
})

it("returns valid=true when key matches stored hash", async () => {
  const plaintext = "hky_validkey123"
  const hash = await bcrypt.hash(plaintext, 1)
  mockRedis.incr.mockResolvedValue(1 as any)
  mockRedis.expire.mockResolvedValue(1 as any)
  mockPrisma.hollyApiKey.findMany.mockResolvedValue([{ id: "key-1", keyHash: hash, name: "test" }] as any)
  mockPrisma.hollyApiKey.update.mockResolvedValue({} as any)

  const result = await validateHollyRequest(makeRequest(plaintext))
  expect(result.valid).toBe(true)
})
