import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { listInteractions } from "@/lib/services/interactions"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const followUps = await listInteractions({ followUpRequired: true })
  return NextResponse.json(followUps)
}
