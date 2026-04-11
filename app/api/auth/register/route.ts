import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { z } from "zod"

const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = RegisterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 422 })
  }

  const { email, name, password } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 422 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.create({ data: { email, name, passwordHash, status: "pending" } })

  return NextResponse.json({ ok: true }, { status: 201 })
}
