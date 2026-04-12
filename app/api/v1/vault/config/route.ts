import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const VALID_WORKDAY_CRONS = [
  "0 * * * 1-5",
  "0 */2 * * 1-5",
  "0 */4 * * 1-5",
  "0 9,17 * * 1-5",
  "0 9 * * 1-5",
]

const VALID_WEEKEND_CRONS = [
  "0 * * * 0,6",
  "0 */2 * * 0,6",
  "0 */4 * * 0,6",
  "0 9,17 * * 0,6",
  "0 9 * * 0,6",
]

const ConfigSchema = z.object({
  couchDbUrl: z.string().url().default("http://localhost:5984"),
  couchDbDatabase: z.string().min(1).default("obsidian"),
  couchDbUsername: z.string().min(1),
  couchDbPassword: z.string().min(1),
  e2ePassphrase: z.string().min(1),
  workdayCron: z.string().refine(v => VALID_WORKDAY_CRONS.includes(v), {
    message: "Invalid workday cron expression",
  }),
  weekendCron: z.string().refine(v => VALID_WEEKEND_CRONS.includes(v), {
    message: "Invalid weekend cron expression",
  }),
  enabled: z.boolean(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = ConfigSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })
  }

  const existing = await prisma.vaultConfig.findFirst({ where: { userId } })
  const config = existing
    ? await prisma.vaultConfig.update({
        where: { id: existing.id },
        data: parsed.data,
      })
    : await prisma.vaultConfig.create({ data: { ...parsed.data, userId } })

  return NextResponse.json(config)
}
