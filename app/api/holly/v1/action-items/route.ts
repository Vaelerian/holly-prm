import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { createActionItem } from "@/lib/services/action-items"
import { CreateActionItemSchema } from "@/lib/validations/action-item"

export async function POST(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateActionItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const item = await createActionItem(parsed.data, "holly")
  return NextResponse.json(item, { status: 201 })
}
