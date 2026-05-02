import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { listContacts, createContact } from "@/lib/services/contacts"
import { CreateContactSchema } from "@/lib/validations/contact"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const { userId } = authResult
  const { searchParams } = req.nextUrl
  const contacts = await listContacts({
    q: searchParams.get("q") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    overdue: searchParams.get("overdue") === "true",
    userId,
  })
  return NextResponse.json(contacts)
}

export async function POST(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const { userId } = authResult
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 })
  }
  const parsed = CreateContactSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const contact = await createContact(parsed.data, "holly", userId)
  return NextResponse.json(contact, { status: 201 })
}
