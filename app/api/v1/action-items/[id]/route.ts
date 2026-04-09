import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateActionItemStatus } from "@/lib/services/action-items"
import { UpdateActionItemSchema } from "@/lib/validations/action-item"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const parsed = UpdateActionItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const item = await updateActionItemStatus(id, parsed.data, "ian")
  return NextResponse.json(item)
}
