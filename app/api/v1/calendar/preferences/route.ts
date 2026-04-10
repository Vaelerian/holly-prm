import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const FiltersSchema = z.object({
  tasks: z.boolean().default(true),
  projects: z.boolean().default(true),
  followUps: z.boolean().default(true),
  milestones: z.boolean().default(true),
  actionItems: z.boolean().default(true),
  googleEvents: z.boolean().default(true),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const pref = await prisma.userPreference.findFirst()
  const defaults = { tasks: true, projects: true, followUps: true, milestones: true, actionItems: true, googleEvents: true }
  return NextResponse.json(pref ? (pref.calendarFilters as typeof defaults) : defaults)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  const parsed = FiltersSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })

  const existing = await prisma.userPreference.findFirst()
  if (existing) {
    await prisma.userPreference.update({ where: { id: existing.id }, data: { calendarFilters: parsed.data } })
  } else {
    await prisma.userPreference.create({ data: { calendarFilters: parsed.data } })
  }
  return NextResponse.json(parsed.data)
}
