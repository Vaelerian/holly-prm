import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { getNoteContent, createNote, updateNote, isVaultAccessible } from "@/lib/services/vault"

type AuthCheckResult = { ok: true } | { ok: false; response: NextResponse }

async function checkAuth(req: NextRequest): Promise<AuthCheckResult> {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    const status = authResult.rateLimited ? 429 : 401
    const error = authResult.rateLimited ? "Rate limit exceeded" : "Unauthorized"
    const code = authResult.rateLimited ? "RATE_LIMITED" : "UNAUTHORIZED"
    const headers = authResult.rateLimited ? { "Retry-After": "60" } : undefined
    return { ok: false, response: NextResponse.json({ error, code }, { status, headers }) }
  }
  return { ok: true }
}

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req)
  if (!auth.ok) return auth.response

  const accessible = await isVaultAccessible()
  if (!accessible) return NextResponse.json({ error: "vault_not_configured", code: "VAULT_NOT_CONFIGURED" }, { status: 503 })

  const notePath = req.nextUrl.searchParams.get("path")
  if (!notePath) return NextResponse.json({ error: "path parameter required" }, { status: 400 })

  const content = await getNoteContent(decodeURIComponent(notePath))
  if (content === null) return NextResponse.json({ error: "not_found" }, { status: 404 })

  return NextResponse.json({ path: notePath, content })
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req)
  if (!auth.ok) return auth.response

  const accessible = await isVaultAccessible()
  if (!accessible) return NextResponse.json({ error: "vault_not_configured", code: "VAULT_NOT_CONFIGURED" }, { status: 503 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { filename, entityType, entityId, content } = body as Record<string, string>
  if (!filename || !entityType || !entityId || content === undefined) {
    return NextResponse.json({ error: "filename, entityType, entityId, content are required" }, { status: 400 })
  }

  try {
    const notePath = await createNote(filename, entityType, entityId, content)
    return NextResponse.json({ path: notePath }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === "FILE_EXISTS") return NextResponse.json({ error: "file_exists" }, { status: 409 })
    if (msg.startsWith("Invalid filename")) return NextResponse.json({ error: msg }, { status: 422 })
    throw e
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await checkAuth(req)
  if (!auth.ok) return auth.response

  const accessible = await isVaultAccessible()
  if (!accessible) return NextResponse.json({ error: "vault_not_configured", code: "VAULT_NOT_CONFIGURED" }, { status: 503 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { path: notePath, content } = body as Record<string, string>
  if (!notePath || content === undefined) {
    return NextResponse.json({ error: "path and content are required" }, { status: 400 })
  }

  try {
    await updateNote(notePath, content)
    return NextResponse.json({ path: notePath })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === "NOTE_NOT_FOUND") return NextResponse.json({ error: "not_found" }, { status: 404 })
    if (msg.startsWith("Path traversal")) return NextResponse.json({ error: "invalid_path" }, { status: 400 })
    throw e
  }
}
