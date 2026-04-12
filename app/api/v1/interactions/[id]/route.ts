import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getInteraction, getInteractionById, updateInteraction, deleteInteraction } from "@/lib/services/interactions"
import { UpdateInteractionSchema } from "@/lib/validations/interaction"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const interaction = await getInteraction(id, userId)
  if (!interaction) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(interaction)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const existing = await getInteractionById(id)
  if (!existing) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  if (existing.userId !== userId) return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 })
  const body = await req.json()
  const parsed = UpdateInteractionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const interaction = await updateInteraction(id, parsed.data, "ian", userId)
  if (!interaction) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(interaction)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const existing = await getInteractionById(id)
  if (!existing) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  if (existing.userId !== userId) return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 })
  const result = await deleteInteraction(id, "ian", userId)
  if (!result) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
