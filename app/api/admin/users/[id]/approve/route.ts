import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 403 })
  }
  const { id } = await params
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 })
  }
  const user = await prisma.user.update({ where: { id }, data: { status: "approved" } })
  return NextResponse.json({ ok: true, user })
}
