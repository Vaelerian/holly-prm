import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
})

export async function PATCH(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 422 })
  }

  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 422 })
  }

  const { name, email } = parsed.data

  if (email) {
    const conflict = await prisma.user.findFirst({ where: { email, NOT: { id: userId } } })
    if (conflict) {
      return NextResponse.json({ error: "Email already in use" }, { status: 422 })
    }
  }

  const data: Record<string, string> = {}
  if (name) data.name = name
  if (email) data.email = email

  const user = await prisma.user.update({ where: { id: userId }, data, select: { name: true, email: true } })
  return NextResponse.json(user)
}
