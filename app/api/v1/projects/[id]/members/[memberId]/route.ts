import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { Prisma } from "@/app/generated/prisma/client"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const { id: projectId, memberId } = await params

  // Only the project owner can remove members
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
  if (!project) return NextResponse.json({ error: "Not found or not owner", code: "FORBIDDEN" }, { status: 403 })

  try {
    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: memberId } },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Member not found", code: "NOT_FOUND" }, { status: 404 })
    }
    throw err
  }
  return new NextResponse(null, { status: 204 })
}
