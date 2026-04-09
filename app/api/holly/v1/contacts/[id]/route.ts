import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { getContact } from "@/lib/services/contacts"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const contact = await getContact(id)
  if (!contact) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(contact)
}
