import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const Body = z.object({
  vaultAccess: z.enum(["none", "read", "readwrite"]),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 403 })
  }

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })
  }

  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 })
  }

  const user = await prisma.user.update({
    where: { id },
    data: { vaultAccess: parsed.data.vaultAccess },
    select: { id: true, email: true, name: true, vaultAccess: true },
  })

  return NextResponse.json({ ok: true, user })
}
