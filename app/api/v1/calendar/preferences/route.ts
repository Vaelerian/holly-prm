import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const SchedulingPrefsSchema = z.object({
  asapDays: z.number().int().min(1).optional(),
  soonDays: z.number().int().min(1).optional(),
  sometimeDays: z.number().int().min(1).optional(),
  scanAheadDays: z.number().int().min(1).optional(),
  sizeMinutes: z.number().int().min(1).optional(),
  sizeHour: z.number().int().min(1).optional(),
  sizeHalfDay: z.number().int().min(1).optional(),
  sizeDay: z.number().int().min(1).optional(),
}).optional()

const FiltersSchema = z.object({
  tasks: z.boolean().default(true),
  projects: z.boolean().default(true),
  followUps: z.boolean().default(true),
  milestones: z.boolean().default(true),
  actionItems: z.boolean().default(true),
  googleEvents: z.boolean().default(true),
  scheduling: SchedulingPrefsSchema,
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const pref = await prisma.userPreference.findFirst({ where: { userId } })
  const defaults = { tasks: true, projects: true, followUps: true, milestones: true, actionItems: true, googleEvents: true }
  return NextResponse.json(pref ? (pref.calendarFilters as typeof defaults) : defaults)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  const parsed = FiltersSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })

  const existing = await prisma.userPreference.findFirst({ where: { userId } })
  if (existing) {
    await prisma.userPreference.update({ where: { id: existing.id }, data: { calendarFilters: parsed.data } })
  } else {
    await prisma.userPreference.create({ data: { calendarFilters: parsed.data, userId } })
  }
  return NextResponse.json(parsed.data)
}
