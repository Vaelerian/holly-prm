import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { getActionItem, updateActionItemStatus, deleteActionItem } from "@/lib/services/action-items"
import { UpdateActionItemSchema } from "@/lib/validations/action-item"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { userId } = authResult
  const { id } = await params
  const item = await getActionItem(id, userId)
  if (!item) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(item)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { userId } = authResult
  const { id } = await params
  const body = await req.json()
  const parsed = UpdateActionItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const item = await updateActionItemStatus(id, parsed.data, "holly", userId)
  if (!item) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(item)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { userId } = authResult
  const { id } = await params
  const result = await deleteActionItem(id, "holly", userId)
  if (!result) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
