import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { getProject, updateProject } from "@/lib/services/projects"
import { UpdateProjectSchema } from "@/lib/validations/project"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const { id } = await params
  const project = await getProject(id, authResult.userId)
  if (!project) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })

  const tasksTotal = project.tasks.length
  const tasksCompleted = project.tasks.filter(t => t.status === "done").length
  const milestones = project.tasks.filter(t => t.isMilestone)

  return NextResponse.json({
    ...project,
    tasksTotal,
    tasksCompleted,
    milestones,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 })
  }
  const parsed = UpdateProjectSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const existing = await getProject(id, authResult.userId)
  if (!existing) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  const project = await updateProject(id, parsed.data, "holly", authResult.userId)
  return NextResponse.json(project)
}
