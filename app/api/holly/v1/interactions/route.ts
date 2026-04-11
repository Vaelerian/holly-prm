import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { listInteractions, createInteraction } from "@/lib/services/interactions"
import { CreateInteractionSchema } from "@/lib/validations/interaction"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { userId } = authResult
  const { searchParams } = req.nextUrl
  const interactions = await listInteractions({
    contactId: searchParams.get("contactId") ?? undefined,
    followUpRequired: searchParams.get("followUpRequired") === "true",
    userId,
  })
  return NextResponse.json(interactions)
}

export async function POST(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { userId } = authResult
  const body = await req.json()
  const parsed = CreateInteractionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const interaction = await createInteraction(parsed.data, "holly", userId)
  return NextResponse.json(interaction, { status: 201 })
}
