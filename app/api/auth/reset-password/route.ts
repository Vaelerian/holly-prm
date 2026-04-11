import { NextRequest, NextResponse } from "next/server"
import { consumeResetToken } from "@/lib/services/password-reset"
import { z } from "zod"

const ResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const parsed = ResetSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  const { token, password } = parsed.data
  const ok = await consumeResetToken(token, password)
  if (!ok) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
