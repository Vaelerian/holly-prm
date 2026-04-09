import Redis from "ioredis"

const globalForRedis = globalThis as unknown as { redis: Redis | undefined }

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  })

redis.on("error", (err) => {
  if (process.env.NODE_ENV !== "production") console.error("[redis]", err)
})

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis
