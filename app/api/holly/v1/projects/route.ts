import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { listProjects, createProject } from "@/lib/services/projects"
import { CreateProjectSchema } from "@/lib/validations/project"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const { searchParams } = req.nextUrl
  const projects = await listProjects({
    status: searchParams.get("status") ?? undefined,
    userId: authResult.userId,
  })
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 })
  }
  const parsed = CreateProjectSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const project = await createProject(parsed.data, "holly", authResult.userId)
  return NextResponse.json(project, { status: 201 })
}
