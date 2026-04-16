import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { rescheduleAll } from "@/lib/services/scheduling-engine"

export async function POST() {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const result = await rescheduleAll(userId)
  return NextResponse.json(result)
}
