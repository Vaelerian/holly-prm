import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const users = await prisma.user.findMany({
    where: { status: "approved" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(users)
}
