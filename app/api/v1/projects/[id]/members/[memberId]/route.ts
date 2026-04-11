import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

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

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId: memberId } },
  })
  return new NextResponse(null, { status: 204 })
}
