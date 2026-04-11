import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listActionItems, createActionItem } from "@/lib/services/action-items"
import { CreateActionItemSchema } from "@/lib/validations/action-item"

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { searchParams } = req.nextUrl
  const items = await listActionItems({ status: searchParams.get("status") ?? undefined, userId })
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateActionItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const item = await createActionItem(parsed.data, "ian", userId)
  return NextResponse.json(item, { status: 201 })
}
