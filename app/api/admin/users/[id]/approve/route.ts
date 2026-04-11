import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { sendEmail } from "@/lib/email"
import { accountApprovedEmail } from "@/lib/email-templates"

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
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const { subject, html } = accountApprovedEmail(existing.name, `${baseUrl}/login`)
  sendEmail(existing.email, subject, html)
  return NextResponse.json({ ok: true, user })
}
