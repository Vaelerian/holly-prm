import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listProjects, createProject } from "@/lib/services/projects"
import { CreateProjectSchema } from "@/lib/validations/project"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { searchParams } = req.nextUrl
  const projects = await listProjects({ status: searchParams.get("status") ?? undefined })
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateProjectSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const project = await createProject(parsed.data, "ian")
  return NextResponse.json(project, { status: 201 })
}
