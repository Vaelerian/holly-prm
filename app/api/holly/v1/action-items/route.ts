import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { listActionItems, createActionItem } from "@/lib/services/action-items"
import { CreateActionItemSchema, ActorSchema } from "@/lib/validations/action-item"
import { z } from "zod"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { userId } = authResult
  const { searchParams } = req.nextUrl
  const rawAssignedTo = searchParams.get("assignedTo")
  const actorParsed = z.optional(ActorSchema).safeParse(rawAssignedTo ?? undefined)
  if (!actorParsed.success) return NextResponse.json({ error: "Invalid assignedTo value", code: "VALIDATION_ERROR" }, { status: 422 })
  const items = await listActionItems({
    assignedTo: actorParsed.data,
    status: searchParams.get("status") ?? undefined,
    userId,
  })
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { userId } = authResult
  const body = await req.json()
  const parsed = CreateActionItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const item = await createActionItem(parsed.data, "holly", userId)
  return NextResponse.json(item, { status: 201 })
}
