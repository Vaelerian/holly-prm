import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { createResetToken } from "@/lib/services/password-reset"
import { sendEmail } from "@/lib/email"
import { passwordResetEmail } from "@/lib/email-templates"

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({}, { status: 200 })
  }

  const email = typeof (body as any)?.email === "string" ? (body as any).email.trim().toLowerCase() : null
  if (!email) return NextResponse.json({}, { status: 200 })

  const user = await prisma.user.findUnique({ where: { email } })

  // Always return 200 — no user enumeration
  if (!user || !user.passwordHash || user.status !== "approved") {
    return NextResponse.json({}, { status: 200 })
  }

  const token = await createResetToken(user.id)
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`
  const { subject, html } = passwordResetEmail(user.name, resetUrl)
  await sendEmail(user.email, subject, html)

  return NextResponse.json({}, { status: 200 })
}
