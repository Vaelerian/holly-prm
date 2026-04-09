import { validateHollyRequest } from "@/lib/holly-auth"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import bcrypt from "bcryptjs"
import { NextRequest } from "next/server"

const mockPipeline = {
  incr: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  exec: jest.fn(),
}

jest.mock("@/lib/db", () => ({
  prisma: { hollyApiKey: { findMany: jest.fn(), update: jest.fn() } },
}))
jest.mock("@/lib/redis", () => ({
  redis: { pipeline: jest.fn() },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockRedis = redis as jest.Mocked<typeof redis>

beforeEach(() => {
  jest.clearAllMocks()
  mockRedis.pipeline.mockReturnValue(mockPipeline as any)
  mockPipeline.exec.mockResolvedValue([[null, 1], [null, 1]])
})

function makeRequest(apiKey?: string) {
  const headers: Record<string, string> = {}
  if (apiKey) headers["x-holly-api-key"] = apiKey
  return new NextRequest("http://localhost/api/holly/v1/briefing", { headers })
}

it("rejects request with no API key", async () => {
  const result = await validateHollyRequest(makeRequest())
  expect(result.valid).toBe(false)
  expect(mockPrisma.hollyApiKey.findMany).not.toHaveBeenCalled()
})

it("rejects request with wrong prefix", async () => {
  const result = await validateHollyRequest(makeRequest("wrong_abc123"))
  expect(result.valid).toBe(false)
  expect(mockPrisma.hollyApiKey.findMany).not.toHaveBeenCalled()
})

it("returns valid=false+rateLimited=true when rate limit exceeded", async () => {
  const plaintext = "hky_testkey"
  const hash = await bcrypt.hash(plaintext, 1)
  mockPrisma.hollyApiKey.findMany.mockResolvedValue([{ id: "key-1", keyHash: hash, name: "test" }] as any)
  mockPipeline.exec.mockResolvedValue([[null, 1001], [null, 1]])

  const result = await validateHollyRequest(makeRequest(plaintext))
  expect(result.valid).toBe(false)
  expect(result.rateLimited).toBe(true)
})

it("returns valid=true when key matches stored hash", async () => {
  const plaintext = "hky_validkey123"
  const hash = await bcrypt.hash(plaintext, 1)
  mockPrisma.hollyApiKey.findMany.mockResolvedValue([{ id: "key-1", keyHash: hash, name: "test" }] as any)
  mockPrisma.hollyApiKey.update.mockResolvedValue({} as any)

  const result = await validateHollyRequest(makeRequest(plaintext))
  expect(result.valid).toBe(true)
  expect(result.keyId).toBe("key-1")
})
