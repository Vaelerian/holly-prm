import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { updateActionItemStatus } from "@/lib/services/action-items"
import { UpdateActionItemSchema } from "@/lib/validations/action-item"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { userId } = authResult
  const { id } = await params
  const body = await req.json()
  const parsed = UpdateActionItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const item = await updateActionItemStatus(id, parsed.data, "holly", userId)
  return NextResponse.json(item)
}
