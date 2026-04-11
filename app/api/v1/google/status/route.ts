import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isGoogleConnected, getConnectedEmail } from "@/lib/google"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const connected = await isGoogleConnected(userId)
  const email = connected ? await getConnectedEmail(userId) : null
  return NextResponse.json({ connected, email })
}
