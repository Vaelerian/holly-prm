import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listInteractions, createInteraction } from "@/lib/services/interactions"
import { CreateInteractionSchema } from "@/lib/validations/interaction"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { searchParams } = req.nextUrl
  const interactions = await listInteractions({
    contactId: searchParams.get("contactId") ?? undefined,
    followUpRequired: searchParams.get("followUpRequired") === "true",
  })
  return NextResponse.json(interactions)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateInteractionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const interaction = await createInteraction(parsed.data, "ian")
  return NextResponse.json(interaction, { status: 201 })
}
