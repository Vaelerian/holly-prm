import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google"

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const client = await getGoogleClient()
    const token = await prisma.googleToken.findFirst()
    if (token) {
      await client.revokeCredentials().catch(() => {})
    }
  } catch (err) {
    if (!(err instanceof GoogleNotConnectedError)) {
      console.error("[google/disconnect] revoke failed", err)
    }
  }

  await prisma.googleToken.deleteMany()

  return NextResponse.redirect(new URL("/settings", req.url))
}
