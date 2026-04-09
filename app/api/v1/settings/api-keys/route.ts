import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listApiKeys, generateApiKey } from "@/lib/services/api-keys"
import { z } from "zod"

const CreateKeySchema = z.object({ name: z.string().min(1) })

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const keys = await listApiKeys()
  return NextResponse.json(keys)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateKeySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR" }, { status: 422 })
  const key = await generateApiKey(parsed.data.name)
  return NextResponse.json({ key }, { status: 201 })
}
