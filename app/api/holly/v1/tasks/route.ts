import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { listTasks, createTask } from "@/lib/services/tasks"
import { CreateTaskSchema } from "@/lib/validations/task"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const { searchParams } = req.nextUrl
  const tasks = await listTasks({
    projectId: searchParams.get("projectId") ?? undefined,
    assignedTo: searchParams.get("assignedTo") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    milestoneOnly: searchParams.get("milestoneOnly") === "true",
    userId: authResult.userId,
  })
  return NextResponse.json(tasks)
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
  const parsed = CreateTaskSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const task = await createTask(parsed.data, "holly", authResult.userId)
  return NextResponse.json(task, { status: 201 })
}
