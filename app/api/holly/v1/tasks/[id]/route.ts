import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { getTask, updateTask, deleteTask } from "@/lib/services/tasks"
import { UpdateTaskSchema } from "@/lib/validations/task"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const { id } = await params
  const task = await getTask(id, authResult.userId)
  if (!task) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(task)
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
  const parsed = UpdateTaskSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const task = await updateTask(id, parsed.data, "holly", authResult.userId)
  return NextResponse.json(task)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const { id } = await params
  const result = await deleteTask(id, "holly", authResult.userId)
  if (!result) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
