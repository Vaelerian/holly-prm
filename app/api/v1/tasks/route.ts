import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listTasks, createTask } from "@/lib/services/tasks"
import { CreateTaskSchema } from "@/lib/validations/task"

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { searchParams } = req.nextUrl
  const tasks = await listTasks({
    projectId: searchParams.get("projectId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    assignedTo: searchParams.get("assignedTo") ?? undefined,
    milestoneOnly: searchParams.get("milestoneOnly") === "true",
    userId,
  })
  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateTaskSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const task = await createTask(parsed.data, "ian", userId)
  if (!task) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(task, { status: 201 })
}
