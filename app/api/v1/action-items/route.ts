import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listActionItems, createActionItem } from "@/lib/services/action-items"
import { CreateActionItemSchema } from "@/lib/validations/action-item"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { searchParams } = req.nextUrl
  const items = await listActionItems({ status: searchParams.get("status") ?? undefined })
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateActionItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const item = await createActionItem(parsed.data, "ian")
  return NextResponse.json(item, { status: 201 })
}
