import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listContacts, createContact } from "@/lib/services/contacts"
import { CreateContactSchema } from "@/lib/validations/contact"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { searchParams } = req.nextUrl
  const contacts = await listContacts({
    q: searchParams.get("q") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    overdue: searchParams.get("overdue") === "true",
  })
  return NextResponse.json(contacts)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateContactSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const contact = await createContact(parsed.data, "ian")
  return NextResponse.json(contact, { status: 201 })
}
