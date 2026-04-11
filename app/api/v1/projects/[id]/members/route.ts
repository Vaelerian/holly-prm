import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const AddMemberSchema = z.object({ email: z.string().email() })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const { id: projectId } = await params

  // Only the project owner can add members
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
  if (!project) return NextResponse.json({ error: "Not found or not owner", code: "FORBIDDEN" }, { status: 403 })

  const body = await req.json()
  const parsed = AddMemberSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 422 })

  const targetUser = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (!targetUser || targetUser.status !== "approved") {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 })
  }

  const member = await prisma.projectMember.create({
    data: { projectId, userId: targetUser.id },
  })
  return NextResponse.json(member, { status: 201 })
}
