import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listContactShares, createContactShare } from "@/lib/services/sharing"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const shares = await listContactShares(id, userId)
  if (shares === null) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(shares)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  let email: unknown
  try {
    const body = await req.json()
    email = body.email
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!email) return NextResponse.json({ error: "email required" }, { status: 422 })
  const result = await createContactShare(id, email as string, userId)
  if (result === null) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (result === "user_not_found") return NextResponse.json({ error: "User not found" }, { status: 404 })
  if (result === "already_exists") return NextResponse.json({ error: "Already shared with this user" }, { status: 409 })
  return NextResponse.json(result, { status: 201 })
}
