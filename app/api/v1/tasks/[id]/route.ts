import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getTask, updateTask, deleteTask } from "@/lib/services/tasks"
import { UpdateTaskSchema } from "@/lib/validations/task"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const task = await getTask(id)
  if (!task) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(task)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const parsed = UpdateTaskSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const task = await updateTask(id, parsed.data, "ian")
  return NextResponse.json(task)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  await deleteTask(id, "ian")
  return new NextResponse(null, { status: 204 })
}
