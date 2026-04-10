# Phase 2: PPM + Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full project/task/action-item UI, dashboard enhancements, and browser push notifications for overdue contacts and pending follow-ups.

**Architecture:** Builds on Phase 1. Adds `PushSubscription` DB table, validation schemas for Project/Task, service + API layers for projects and tasks, seven new UI pages, enhancements to contacts detail and dashboard, and a cron endpoint that sends VAPID push notifications with Redis deduplication. The `app/page.tsx` root-redirect is replaced by a real dashboard at `app/(dashboard)/page.tsx`.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Zod v4, react-hook-form, `web-push` npm package, ioredis (already in repo), Tailwind CSS.

---

## File Map

**Create:**
- `lib/validations/project.ts` -- Zod schemas for project create/update
- `lib/validations/task.ts` -- Zod schemas for task create/update
- `lib/services/projects.ts` -- CRUD for Project
- `lib/services/tasks.ts` -- CRUD for Task + status update
- `lib/push.ts` -- VAPID init + sendPushNotification helper
- `app/api/v1/projects/route.ts` -- GET list, POST create
- `app/api/v1/projects/[id]/route.ts` -- GET, PUT, DELETE
- `app/api/v1/tasks/route.ts` -- GET list (accepts ?projectId), POST create
- `app/api/v1/tasks/[id]/route.ts` -- GET, PUT, DELETE
- `app/api/v1/push/subscribe/route.ts` -- POST save push subscription
- `app/api/v1/push/unsubscribe/route.ts` -- DELETE remove push subscription
- `app/api/v1/cron/notify/route.ts` -- POST send notifications (cron-secret protected)
- `components/projects/project-card.tsx` -- project list card
- `components/projects/project-form.tsx` -- create/edit form (react-hook-form)
- `components/tasks/task-row.tsx` -- task row with status cycle button ("use client")
- `components/tasks/add-task-form.tsx` -- inline add-task form ("use client")
- `components/action-items/action-item-row.tsx` -- row with mark-done + parent link ("use client")
- `components/action-items/add-action-item-form.tsx` -- inline add form ("use client")
- `app/(dashboard)/projects/new/page.tsx` -- create project form page
- `app/(dashboard)/projects/[id]/page.tsx` -- project detail
- `app/(dashboard)/projects/[id]/edit/page.tsx` -- edit project form page
- `app/(dashboard)/page.tsx` -- dashboard (milestones + action items)
- `public/sw.js` -- service worker with push handler
- `__tests__/services/projects.test.ts`
- `__tests__/services/tasks.test.ts`

**Modify:**
- `prisma/schema.prisma` -- add PushSubscription model
- `prisma/migrations/20260410000001_push_subscription/migration.sql` -- migration
- `lib/services/briefing.ts` -- add open projects count, tasks due today, milestones, action items queries
- `lib/services/contacts.ts` -- update getContact to include actionItems in interactions
- `components/dashboard/stats-row.tsx` -- add openProjects + tasksDueToday props
- `app/(dashboard)/projects/page.tsx` -- replace placeholder with real list
- `app/(dashboard)/tasks/page.tsx` -- replace placeholder with real all-tasks board
- `app/(dashboard)/contacts/[id]/page.tsx` -- add action items section
- `app/(dashboard)/settings/page.tsx` -- add notifications card
- `app/(auth)/login/page.tsx` -- redirect to `/` instead of `/contacts` after login
- `app/page.tsx` -- delete (replaced by `app/(dashboard)/page.tsx`)
- `package.json` -- add web-push + @types/web-push

---

## Task 1: PushSubscription DB model + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260410000001_push_subscription/migration.sql`

- [ ] **Step 1: Add PushSubscription model to schema.prisma**

At the bottom of `prisma/schema.prisma`, append:

```prisma
model PushSubscription {
  id        String   @id @default(uuid())
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Create migration SQL file**

Create `prisma/migrations/20260410000001_push_subscription/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
```

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `Prisma Client generated` (no errors)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260410000001_push_subscription/migration.sql
git commit -m "feat: add PushSubscription schema and migration"
```

---

## Task 2: Validation schemas for Project and Task

**Files:**
- Create: `lib/validations/project.ts`
- Create: `lib/validations/task.ts`

- [ ] **Step 1: Create `lib/validations/project.ts`**

```ts
import { z } from "zod"

export const CreateProjectSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().default(""),
  category: z.enum(["personal", "work", "volunteer"]),
  status: z.enum(["planning", "active", "on_hold", "done", "cancelled"]).default("planning"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  targetDate: z.string().datetime().nullable().default(null),
  notes: z.string().default(""),
})

export const UpdateProjectSchema = CreateProjectSchema.partial()

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
```

- [ ] **Step 2: Create `lib/validations/task.ts`**

```ts
import { z } from "zod"

export const CreateTaskSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().default(""),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  assignedTo: z.enum(["ian", "holly"]),
  dueDate: z.string().datetime().nullable().default(null),
  isMilestone: z.boolean().default(false),
})

export const UpdateTaskSchema = CreateTaskSchema.omit({ projectId: true }).partial()

export const UpdateTaskStatusSchema = z.object({
  status: z.enum(["todo", "in_progress", "done", "cancelled"]),
})

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>
export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusSchema>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add lib/validations/project.ts lib/validations/task.ts
git commit -m "feat: add project and task validation schemas"
```

---

## Task 3: Projects service + tests

**Files:**
- Create: `lib/services/projects.ts`
- Create: `__tests__/services/projects.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/services/projects.test.ts`:

```ts
import { listProjects, getProject, createProject, updateProject, deleteProject } from "@/lib/services/projects"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    project: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("listProjects", () => {
  it("returns all projects ordered by createdAt desc when no status filter", async () => {
    const projects = [{ id: "1", title: "A" }, { id: "2", title: "B" }]
    mockPrisma.project.findMany.mockResolvedValue(projects as any)
    const result = await listProjects({})
    expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    )
    expect(result).toEqual(projects)
  })

  it("filters by status when provided", async () => {
    mockPrisma.project.findMany.mockResolvedValue([])
    await listProjects({ status: "active" })
    expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "active" } })
    )
  })
})

describe("getProject", () => {
  it("returns project with tasks", async () => {
    const project = { id: "1", title: "A", tasks: [] }
    mockPrisma.project.findUnique.mockResolvedValue(project as any)
    const result = await getProject("1")
    expect(mockPrisma.project.findUnique).toHaveBeenCalledWith({
      where: { id: "1" },
      include: expect.objectContaining({ tasks: expect.anything() }),
    })
    expect(result).toEqual(project)
  })
})

describe("createProject", () => {
  it("creates project and writes audit log", async () => {
    const input = { title: "P1", description: "", category: "work" as const, status: "planning" as const, priority: "medium" as const, targetDate: null, notes: "" }
    const created = { id: "abc", ...input }
    mockPrisma.project.create.mockResolvedValue(created as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    const result = await createProject(input, "ian")
    expect(mockPrisma.project.create).toHaveBeenCalled()
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: "Project", entityId: "abc", action: "create", actor: "ian" }),
    })
    expect(result).toEqual(created)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/services/projects.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module '@/lib/services/projects'"

- [ ] **Step 3: Implement `lib/services/projects.ts`**

```ts
import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import type { CreateProjectInput, UpdateProjectInput } from "@/lib/validations/project"

interface ListProjectsOptions {
  status?: string
}

export async function listProjects(opts: ListProjectsOptions) {
  const where: Record<string, unknown> = {}
  if (opts.status) where.status = opts.status
  return prisma.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { tasks: true } },
      tasks: { select: { status: true } },
    },
  })
}

export async function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: [{ isMilestone: "desc" }, { createdAt: "asc" }],
        include: { actionItems: { orderBy: { createdAt: "asc" } } },
      },
    },
  })
}

export async function createProject(data: CreateProjectInput, actor: Actor) {
  const project = await prisma.project.create({
    data: {
      ...data,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: project.id, action: "create", actor },
  })
  return project
}

export async function updateProject(id: string, data: UpdateProjectInput, actor: Actor) {
  const project = await prisma.project.update({
    where: { id },
    data: {
      ...data,
      targetDate: data.targetDate !== undefined ? (data.targetDate ? new Date(data.targetDate) : null) : undefined,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: id, action: "update", actor },
  })
  return project
}

export async function deleteProject(id: string, actor: Actor) {
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: id, action: "delete", actor },
  })
  return prisma.project.delete({ where: { id } })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/services/projects.test.ts --no-coverage
```

Expected: PASS (3 describe blocks, all green)

- [ ] **Step 5: Commit**

```bash
git add lib/services/projects.ts __tests__/services/projects.test.ts
git commit -m "feat: add projects service with tests"
```

---

## Task 4: Tasks service + tests

**Files:**
- Create: `lib/services/tasks.ts`
- Create: `__tests__/services/tasks.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/services/tasks.test.ts`:

```ts
import { listTasks, getTask, createTask, updateTask, deleteTask } from "@/lib/services/tasks"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    task: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("listTasks", () => {
  it("returns tasks ordered by createdAt asc", async () => {
    const tasks = [{ id: "1", title: "T1" }]
    mockPrisma.task.findMany.mockResolvedValue(tasks as any)
    await listTasks({})
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" } })
    )
  })

  it("filters by projectId when provided", async () => {
    mockPrisma.task.findMany.mockResolvedValue([])
    await listTasks({ projectId: "proj-1" })
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: "proj-1" }) })
    )
  })

  it("filters by status when provided", async () => {
    mockPrisma.task.findMany.mockResolvedValue([])
    await listTasks({ status: "todo" })
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "todo" }) })
    )
  })
})

describe("createTask", () => {
  it("creates task and writes audit log", async () => {
    const input = { projectId: "proj-1", title: "T1", description: "", status: "todo" as const, priority: "medium" as const, assignedTo: "ian" as const, dueDate: null, isMilestone: false }
    const created = { id: "task-1", ...input }
    mockPrisma.task.create.mockResolvedValue(created as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    const result = await createTask(input, "ian")
    expect(mockPrisma.task.create).toHaveBeenCalled()
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: "Task", entityId: "task-1", action: "create", actor: "ian" }),
    })
    expect(result).toEqual(created)
  })
})

describe("updateTask", () => {
  it("updates task and writes audit log", async () => {
    const updated = { id: "task-1", title: "Updated", status: "done" }
    mockPrisma.task.update.mockResolvedValue(updated as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    await updateTask("task-1", { status: "done" }, "ian")
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "task-1" } })
    )
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: "Task", entityId: "task-1", action: "update" }),
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/services/tasks.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module '@/lib/services/tasks'"

- [ ] **Step 3: Implement `lib/services/tasks.ts`**

```ts
import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validations/task"

interface ListTasksOptions {
  projectId?: string
  status?: string
  assignedTo?: string
  milestoneOnly?: boolean
}

export async function listTasks(opts: ListTasksOptions) {
  const where: Record<string, unknown> = {}
  if (opts.projectId) where.projectId = opts.projectId
  if (opts.status) where.status = opts.status
  if (opts.assignedTo) where.assignedTo = opts.assignedTo
  if (opts.milestoneOnly) where.isMilestone = true
  return prisma.task.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: { project: { select: { id: true, title: true } } },
  })
}

export async function getTask(id: string) {
  return prisma.task.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, title: true } },
      actionItems: { orderBy: { createdAt: "asc" } },
    },
  })
}

export async function createTask(data: CreateTaskInput, actor: Actor) {
  const task = await prisma.task.create({
    data: {
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Task", entityId: task.id, action: "create", actor },
  })
  return task
}

export async function updateTask(id: string, data: UpdateTaskInput, actor: Actor) {
  const task = await prisma.task.update({
    where: { id },
    data: {
      ...data,
      dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Task", entityId: id, action: "update", actor },
  })
  return task
}

export async function deleteTask(id: string, actor: Actor) {
  await prisma.auditLog.create({
    data: { entity: "Task", entityId: id, action: "delete", actor },
  })
  return prisma.task.delete({ where: { id } })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/services/tasks.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Run all tests to check nothing is broken**

```bash
npx jest --no-coverage
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add lib/services/tasks.ts __tests__/services/tasks.test.ts
git commit -m "feat: add tasks service with tests"
```

---

## Task 5: Projects API routes

**Files:**
- Create: `app/api/v1/projects/route.ts`
- Create: `app/api/v1/projects/[id]/route.ts`

- [ ] **Step 1: Create `app/api/v1/projects/route.ts`**

```ts
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
```

- [ ] **Step 2: Create `app/api/v1/projects/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getProject, updateProject, deleteProject } from "@/lib/services/projects"
import { UpdateProjectSchema } from "@/lib/validations/project"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const project = await getProject(id)
  if (!project) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(project)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const parsed = UpdateProjectSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const project = await updateProject(id, parsed.data, "ian")
  return NextResponse.json(project)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  await deleteProject(id, "ian")
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/projects/
git commit -m "feat: add projects API routes"
```

---

## Task 6: Tasks API routes

**Files:**
- Create: `app/api/v1/tasks/route.ts`
- Create: `app/api/v1/tasks/[id]/route.ts`

- [ ] **Step 1: Create `app/api/v1/tasks/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listTasks, createTask } from "@/lib/services/tasks"
import { CreateTaskSchema } from "@/lib/validations/task"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { searchParams } = req.nextUrl
  const tasks = await listTasks({
    projectId: searchParams.get("projectId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    assignedTo: searchParams.get("assignedTo") ?? undefined,
    milestoneOnly: searchParams.get("milestoneOnly") === "true",
  })
  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateTaskSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const task = await createTask(parsed.data, "ian")
  return NextResponse.json(task, { status: 201 })
}
```

- [ ] **Step 2: Create `app/api/v1/tasks/[id]/route.ts`**

```ts
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
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/tasks/
git commit -m "feat: add tasks API routes"
```

---

## Task 7: Push notification library

**Files:**
- Modify: `package.json`
- Create: `lib/push.ts`

- [ ] **Step 1: Install web-push**

```bash
npm install web-push
npm install --save-dev @types/web-push
```

Expected: added `web-push` to dependencies, `@types/web-push` to devDependencies

- [ ] **Step 2: Create `lib/push.ts`**

```ts
import webpush from "web-push"

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidEmail = process.env.VAPID_EMAIL

if (vapidPublicKey && vapidPrivateKey && vapidEmail) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey)
}

export interface PushPayload {
  title: string
  body: string
  url: string
}

export interface PushSubscriptionData {
  endpoint: string
  p256dh: string
  auth: string
}

export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload
): Promise<void> {
  if (!vapidPublicKey || !vapidPrivateKey || !vapidEmail) {
    throw new Error("Push notifications not configured")
  }
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload)
  )
}

export const isPushConfigured = Boolean(vapidPublicKey && vapidPrivateKey && vapidEmail)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add lib/push.ts package.json package-lock.json
git commit -m "feat: add web-push library and push helper"
```

---

## Task 8: Push subscription API routes

**Files:**
- Create: `app/api/v1/push/subscribe/route.ts`
- Create: `app/api/v1/push/unsubscribe/route.ts`

- [ ] **Step 1: Create `app/api/v1/push/subscribe/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { isPushConfigured } from "@/lib/push"
import { z } from "zod"

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  if (!isPushConfigured) {
    return NextResponse.json({ error: "Push notifications not configured" }, { status: 503 })
  }

  const body = await req.json()
  const parsed = SubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  }

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    update: { p256dh: parsed.data.p256dh, auth: parsed.data.auth },
    create: { endpoint: parsed.data.endpoint, p256dh: parsed.data.p256dh, auth: parsed.data.auth },
  })

  return NextResponse.json(subscription, { status: 201 })
}
```

- [ ] **Step 2: Create `app/api/v1/push/unsubscribe/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const UnsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const body = await req.json()
  const parsed = UnsubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  }

  await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint } })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/push/
git commit -m "feat: add push subscribe/unsubscribe API routes"
```

---

## Task 9: Cron notify endpoint

**Files:**
- Create: `app/api/v1/cron/notify/route.ts`

- [ ] **Step 1: Create `app/api/v1/cron/notify/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import { sendPushNotification, isPushConfigured } from "@/lib/push"

const MAX_NOTIFICATIONS_PER_RUN = 5

function todayKey(): string {
  return new Date().toISOString().slice(0, 10) // "2026-04-10"
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isPushConfigured) {
    return NextResponse.json({ error: "Push notifications not configured" }, { status: 503 })
  }

  const subscriptions = await prisma.pushSubscription.findMany()
  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  const today = todayKey()
  let sent = 0

  // 1. Overdue contacts
  const overdueContacts = await prisma.contact.findMany({
    where: {
      interactionFreqDays: { not: null },
      OR: [{ healthScore: { lt: 100 } }, { lastInteraction: null }],
    },
    orderBy: { healthScore: "asc" },
    take: MAX_NOTIFICATIONS_PER_RUN,
  })

  for (const contact of overdueContacts) {
    if (sent >= MAX_NOTIFICATIONS_PER_RUN) break
    const dedupeKey = `notify:sent:overdue:${contact.id}:${today}`
    const already = await redis.get(dedupeKey)
    if (already) continue

    for (const sub of subscriptions) {
      try {
        await sendPushNotification(sub, {
          title: "Catch up reminder",
          body: `Catch up with ${contact.name} -- it's been a while.`,
          url: `/contacts/${contact.id}`,
        })
      } catch (e) {
        console.error("[cron/notify] push failed for overdue contact", contact.id, e)
      }
    }
    await redis.set(dedupeKey, "1", "EX", 86400)
    sent++
  }

  // 2. Follow-ups due
  const now = new Date()
  const pendingFollowUps = await prisma.interaction.findMany({
    where: {
      followUpRequired: true,
      followUpCompleted: false,
      followUpDate: { lte: now },
    },
    include: { contact: { select: { id: true, name: true } } },
    orderBy: { followUpDate: "asc" },
    take: MAX_NOTIFICATIONS_PER_RUN,
  })

  for (const interaction of pendingFollowUps) {
    if (sent >= MAX_NOTIFICATIONS_PER_RUN) break
    const dedupeKey = `notify:sent:followup:${interaction.id}:${today}`
    const already = await redis.get(dedupeKey)
    if (already) continue

    const summary = interaction.summary.length > 60
      ? interaction.summary.slice(0, 60) + "..."
      : interaction.summary

    for (const sub of subscriptions) {
      try {
        await sendPushNotification(sub, {
          title: "Follow-up due",
          body: `Follow up with ${interaction.contact.name}: ${summary}`,
          url: `/contacts/${interaction.contact.id}`,
        })
      } catch (e) {
        console.error("[cron/notify] push failed for follow-up", interaction.id, e)
      }
    }
    await redis.set(dedupeKey, "1", "EX", 86400)
    sent++
  }

  return NextResponse.json({ sent })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/cron/
git commit -m "feat: add cron notify endpoint with Redis deduplication"
```

---

## Task 10: Project UI components

**Files:**
- Create: `components/projects/project-card.tsx`
- Create: `components/projects/project-form.tsx`

- [ ] **Step 1: Create `components/projects/project-card.tsx`**

```tsx
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

interface ProjectCardProps {
  id: string
  title: string
  category: string
  status: string
  priority: string
  targetDate: Date | null
  taskDoneCount: number
  taskTotalCount: number
}

const statusVariant: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  planning: "default",
  active: "info",
  on_hold: "warning",
  done: "success",
  cancelled: "danger",
}

const priorityVariant: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  low: "default",
  medium: "default",
  high: "warning",
  critical: "danger",
}

export function ProjectCard({ id, title, category, status, priority, targetDate, taskDoneCount, taskTotalCount }: ProjectCardProps) {
  const progressPct = taskTotalCount > 0 ? Math.round((taskDoneCount / taskTotalCount) * 100) : 0

  return (
    <Link href={`/projects/${id}`} className="block bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-400 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Badge variant={statusVariant[status] ?? "default"}>{status.replace("_", " ")}</Badge>
          <Badge variant={priorityVariant[priority] ?? "default"}>{priority}</Badge>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-gray-400 capitalize">{category}</span>
        {targetDate && (
          <span className="text-xs text-gray-400">
            Due {new Date(targetDate).toLocaleDateString("en-GB")}
          </span>
        )}
      </div>
      {taskTotalCount > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-gray-500">{taskDoneCount} / {taskTotalCount} tasks</span>
            <span className="text-xs text-gray-400">{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}
    </Link>
  )
}
```

- [ ] **Step 2: Create `components/projects/project-form.tsx`**

This is a `"use client"` form component that uses react-hook-form + Zod, following the same pattern as `components/contacts/contact-form.tsx`.

```tsx
"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { CreateProjectSchema } from "@/lib/validations/project"

type FormInput = z.input<typeof CreateProjectSchema>
type FormOutput = z.infer<typeof CreateProjectSchema>

interface ProjectFormProps {
  defaultValues?: Partial<FormInput>
  projectId?: string
}

export function ProjectForm({ defaultValues, projectId }: ProjectFormProps) {
  const router = useRouter()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(CreateProjectSchema),
    defaultValues: defaultValues ?? {
      title: "",
      description: "",
      category: "personal",
      status: "planning",
      priority: "medium",
      targetDate: null,
      notes: "",
    },
  })

  async function onSubmit(data: FormOutput) {
    const url = projectId ? `/api/v1/projects/${projectId}` : "/api/v1/projects"
    const method = projectId ? "PUT" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const project = await res.json()
      router.push(`/projects/${project.id}`)
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
        <input {...register("title")} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea {...register("description")} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select {...register("category")} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="personal">Personal</option>
            <option value="work">Work</option>
            <option value="volunteer">Volunteer</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select {...register("status")} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
          <select {...register("priority")} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Target date</label>
        <input type="datetime-local" {...register("targetDate")} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
        <textarea {...register("notes")} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {isSubmitting ? "Saving..." : (projectId ? "Save changes" : "Create project")}
        </button>
        <button type="button" onClick={() => router.back()} className="text-sm text-gray-600 hover:text-gray-900">Cancel</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add components/projects/
git commit -m "feat: add project-card and project-form components"
```

---

## Task 11: Projects pages

**Files:**
- Modify: `app/(dashboard)/projects/page.tsx` (replace placeholder)
- Create: `app/(dashboard)/projects/new/page.tsx`
- Create: `app/(dashboard)/projects/[id]/page.tsx`
- Create: `app/(dashboard)/projects/[id]/edit/page.tsx`
- Create: `components/tasks/task-row.tsx`
- Create: `components/tasks/add-task-form.tsx`
- Create: `components/projects/delete-project-button.tsx`

Note: `task-row.tsx`, `add-task-form.tsx`, and `delete-project-button.tsx` are needed for the project detail page so they belong in this task.

- [ ] **Step 1: Replace `app/(dashboard)/projects/page.tsx`**

```tsx
import { listProjects } from "@/lib/services/projects"
import { ProjectCard } from "@/components/projects/project-card"
import Link from "next/link"

interface PageProps { searchParams: Promise<{ status?: string }> }

export default async function ProjectsPage({ searchParams }: PageProps) {
  const { status } = await searchParams
  let projects: Awaited<ReturnType<typeof listProjects>> = []
  let dbError = false
  try {
    projects = await listProjects({ status })
  } catch (e) {
    console.error("[projects page]", e)
    dbError = true
  }

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      {dbError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Database unavailable. Check server logs.
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Projects</h1>
        <Link href="/projects/new" className="bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700">
          + New project
        </Link>
      </div>

      <form className="flex gap-2">
        <select name="status" defaultValue={status ?? ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All statuses</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button type="submit" className="bg-gray-100 border border-gray-300 text-sm px-3 py-2 rounded-lg hover:bg-gray-200">Filter</button>
      </form>

      {projects.length === 0 ? (
        <p className="text-sm text-gray-500">No projects yet. Create your first project.</p>
      ) : (
        <div className="space-y-2">
          {projects.map(p => {
            const taskDoneCount = p.tasks.filter(t => t.status === "done").length
            return (
              <ProjectCard
                key={p.id}
                id={p.id}
                title={p.title}
                category={p.category}
                status={p.status}
                priority={p.priority}
                targetDate={p.targetDate}
                taskDoneCount={taskDoneCount}
                taskTotalCount={p.tasks.length}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(dashboard)/projects/new/page.tsx`**

```tsx
import { ProjectForm } from "@/components/projects/project-form"

export default function NewProjectPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">New project</h1>
      <ProjectForm />
    </div>
  )
}
```

- [ ] **Step 3: Create `components/projects/delete-project-button.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/v1/projects/${projectId}`, { method: "DELETE" })
    if (res.ok) router.push("/projects")
    setDeleting(false)
  }

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="text-sm text-red-600 hover:text-red-700">Delete</button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600">Delete project and all tasks?</span>
      <button onClick={handleDelete} disabled={deleting} className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50">
        {deleting ? "Deleting..." : "Yes, delete"}
      </button>
      <button onClick={() => setConfirming(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
    </div>
  )
}
```

- [ ] **Step 4: Create `components/tasks/task-row.tsx`**

```tsx
"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"

interface TaskRowProps {
  id: string
  title: string
  status: string
  priority: string
  assignedTo: string
  dueDate: Date | null
  isMilestone: boolean
  onStatusChange?: (id: string, newStatus: string) => void
}

const STATUS_CYCLE: Record<string, string> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
  cancelled: "cancelled",
}

const statusVariant: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  todo: "default",
  in_progress: "info",
  done: "success",
  cancelled: "danger",
}

const priorityVariant: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  low: "default",
  medium: "default",
  high: "warning",
  critical: "danger",
}

export function TaskRow({ id, title, status: initialStatus, priority, assignedTo, dueDate, isMilestone, onStatusChange }: TaskRowProps) {
  const [status, setStatus] = useState(initialStatus)
  const [saving, setSaving] = useState(false)

  async function cycleStatus() {
    const next = STATUS_CYCLE[status] ?? "todo"
    setSaving(true)
    const res = await fetch(`/api/v1/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
    if (res.ok) {
      setStatus(next)
      onStatusChange?.(id, next)
    }
    setSaving(false)
  }

  return (
    <div className={`flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-2.5 ${isMilestone ? "border-l-4 border-l-purple-400" : ""}`}>
      <button
        onClick={cycleStatus}
        disabled={saving || status === "cancelled"}
        className="flex-shrink-0"
        title="Click to advance status"
      >
        <Badge variant={statusVariant[status] ?? "default"}>
          {status.replace("_", " ")}
        </Badge>
      </button>
      <span className={`flex-1 text-sm ${status === "done" ? "line-through text-gray-400" : "text-gray-900"} ${isMilestone ? "font-semibold" : ""}`}>
        {isMilestone && <span className="mr-1">★</span>}
        {title}
      </span>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge variant={priorityVariant[priority] ?? "default"}>{priority}</Badge>
        <Badge variant="default">{assignedTo}</Badge>
        {dueDate && (
          <span className="text-xs text-gray-400">{new Date(dueDate).toLocaleDateString("en-GB")}</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `components/tasks/add-task-form.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface AddTaskFormProps {
  projectId: string
}

export function AddTaskForm({ projectId }: AddTaskFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [assignedTo, setAssignedTo] = useState<"ian" | "holly">("ian")
  const [priority, setPriority] = useState("medium")
  const [isMilestone, setIsMilestone] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!title.trim()) return
    setSaving(true)
    const res = await fetch("/api/v1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, title: title.trim(), assignedTo, priority, isMilestone }),
    })
    if (res.ok) {
      setTitle("")
      setOpen(false)
      router.refresh()
    }
    setSaving(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-blue-600 hover:text-blue-700 mt-2">
        + Add task
      </button>
    )
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mt-2 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Task title"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
      />
      <div className="flex items-center gap-3">
        <select value={assignedTo} onChange={e => setAssignedTo(e.target.value as "ian" | "holly")} className="border border-gray-300 rounded-lg px-2 py-1 text-sm">
          <option value="ian">Ian</option>
          <option value="holly">Holly</option>
        </select>
        <select value={priority} onChange={e => setPriority(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-sm">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-gray-600">
          <input type="checkbox" checked={isMilestone} onChange={e => setIsMilestone(e.target.checked)} />
          Milestone
        </label>
        <div className="flex gap-2 ml-auto">
          <button onClick={handleAdd} disabled={saving || !title.trim()} className="bg-blue-600 text-white text-sm px-3 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Adding..." : "Add"}
          </button>
          <button onClick={() => setOpen(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create `app/(dashboard)/projects/[id]/page.tsx`**

```tsx
import { getProject } from "@/lib/services/projects"
import { prisma } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { TaskRow } from "@/components/tasks/task-row"
import { AddTaskForm } from "@/components/tasks/add-task-form"
import { DeleteProjectButton } from "@/components/projects/delete-project-button"
import Link from "next/link"
import { notFound } from "next/navigation"

interface PageProps { params: Promise<{ id: string }> }

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const actionItems = await prisma.actionItem.findMany({
    where: { task: { projectId: id }, status: "todo" },
    include: { task: { select: { id: true, title: true } } },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
  })

  const milestones = project.tasks.filter(t => t.isMilestone)
  const tasks = project.tasks.filter(t => !t.isMilestone)

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{project.title}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge>{project.category}</Badge>
            <Badge variant={project.status === "active" ? "info" : project.status === "done" ? "success" : "default"}>
              {project.status.replace("_", " ")}
            </Badge>
            <Badge variant={project.priority === "critical" ? "danger" : project.priority === "high" ? "warning" : "default"}>
              {project.priority}
            </Badge>
            {project.targetDate && (
              <span className="text-xs text-gray-400">Due {new Date(project.targetDate).toLocaleDateString("en-GB")}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/projects/${id}/edit`} className="text-sm text-blue-600 hover:text-blue-700">Edit</Link>
          <DeleteProjectButton projectId={id} />
        </div>
      </div>

      {project.description && (
        <p className="text-sm text-gray-700">{project.description}</p>
      )}

      {milestones.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Milestones</h2>
          <div className="flex gap-4 flex-wrap">
            {milestones.map(m => (
              <div key={m.id} className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                <span className={`w-2 h-2 rounded-full ${m.status === "done" ? "bg-green-500" : m.status === "in_progress" ? "bg-blue-500" : "bg-gray-400"}`} />
                <span className="text-sm font-medium text-gray-900">{m.title}</span>
                {m.dueDate && <span className="text-xs text-gray-400">{new Date(m.dueDate).toLocaleDateString("en-GB")}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Tasks</h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-500">No tasks yet.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map(t => (
              <TaskRow
                key={t.id}
                id={t.id}
                title={t.title}
                status={t.status}
                priority={t.priority}
                assignedTo={t.assignedTo}
                dueDate={t.dueDate}
                isMilestone={t.isMilestone}
              />
            ))}
          </div>
        )}
        <AddTaskForm projectId={id} />
      </section>

      {actionItems.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Action items</h2>
          <div className="space-y-2">
            {actionItems.map(item => (
              <div key={item.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-2.5">
                <div>
                  <p className="text-sm text-gray-900">{item.title}</p>
                  {item.task && <p className="text-xs text-gray-400">Task: {item.task.title}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {item.dueDate && <span className="text-xs text-gray-400">{new Date(item.dueDate).toLocaleDateString("en-GB")}</span>}
                  <Badge>{item.assignedTo}</Badge>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Create `app/(dashboard)/projects/[id]/edit/page.tsx`**

```tsx
import { getProject } from "@/lib/services/projects"
import { ProjectForm } from "@/components/projects/project-form"
import { notFound } from "next/navigation"

interface PageProps { params: Promise<{ id: string }> }

export default async function EditProjectPage({ params }: PageProps) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Edit project</h1>
      <ProjectForm
        projectId={id}
        defaultValues={{
          title: project.title,
          description: project.description,
          category: project.category,
          status: project.status,
          priority: project.priority,
          targetDate: project.targetDate ? project.targetDate.toISOString() : null,
          notes: project.notes,
        }}
      />
    </div>
  )
}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add app/(dashboard)/projects/ components/tasks/task-row.tsx components/tasks/add-task-form.tsx components/projects/
git commit -m "feat: add projects pages and task row components"
```

---

## Task 12: All-tasks board page

**Files:**
- Modify: `app/(dashboard)/tasks/page.tsx` (replace placeholder)

- [ ] **Step 1: Replace `app/(dashboard)/tasks/page.tsx`**

```tsx
import { listTasks } from "@/lib/services/tasks"
import { listProjects } from "@/lib/services/projects"
import { TaskRow } from "@/components/tasks/task-row"

interface PageProps { searchParams: Promise<{ status?: string; assignedTo?: string; milestoneOnly?: string }> }

export default async function TasksPage({ searchParams }: PageProps) {
  const { status, assignedTo, milestoneOnly } = await searchParams
  let tasks: Awaited<ReturnType<typeof listTasks>> = []
  let projects: Awaited<ReturnType<typeof listProjects>> = []
  let dbError = false

  try {
    [tasks, projects] = await Promise.all([
      listTasks({ status, assignedTo, milestoneOnly: milestoneOnly === "true" }),
      listProjects({}),
    ])
  } catch (e) {
    console.error("[tasks page]", e)
    dbError = true
  }

  // Group tasks by project
  const projectMap = new Map(projects.map(p => [p.id, p.title]))
  const grouped = new Map<string, typeof tasks>()
  for (const task of tasks) {
    const projectTitle = projectMap.get(task.projectId) ?? task.projectId
    if (!grouped.has(projectTitle)) grouped.set(projectTitle, [])
    grouped.get(projectTitle)!.push(task)
  }

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      {dbError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Database unavailable. Check server logs.
        </div>
      )}
      <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>

      <form className="flex gap-2 flex-wrap">
        <select name="status" defaultValue={status ?? ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">All statuses</option>
          <option value="todo">Todo</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>
        <select name="assignedTo" defaultValue={assignedTo ?? ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">All assignees</option>
          <option value="ian">Ian</option>
          <option value="holly">Holly</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-2">
          <input type="checkbox" name="milestoneOnly" value="true" defaultChecked={milestoneOnly === "true"} />
          Milestones only
        </label>
        <button type="submit" className="bg-gray-100 border border-gray-300 text-sm px-3 py-2 rounded-lg hover:bg-gray-200">Filter</button>
      </form>

      {tasks.length === 0 ? (
        <p className="text-sm text-gray-500">No tasks match your filters.</p>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([projectTitle, projectTasks]) => (
            <section key={projectTitle}>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">{projectTitle}</h2>
              <div className="space-y-2">
                {projectTasks.map(t => (
                  <TaskRow
                    key={t.id}
                    id={t.id}
                    title={t.title}
                    status={t.status}
                    priority={t.priority}
                    assignedTo={t.assignedTo}
                    dueDate={t.dueDate}
                    isMilestone={t.isMilestone}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/tasks/page.tsx
git commit -m "feat: add all-tasks board page"
```

---

## Task 13: Action items UI and contact detail enhancements

**Files:**
- Create: `components/action-items/action-item-row.tsx`
- Create: `components/action-items/add-action-item-form.tsx`
- Modify: `lib/services/contacts.ts` (update getContact to include action items)
- Modify: `app/(dashboard)/contacts/[id]/page.tsx`

- [ ] **Step 1: Update `lib/services/contacts.ts` getContact query**

Change the `getContact` function to include action items within interactions:

```ts
export async function getContact(id: string) {
  return prisma.contact.findUnique({
    where: { id },
    include: {
      interactions: {
        orderBy: { occurredAt: "desc" },
        take: 20,
        include: { actionItems: { orderBy: { createdAt: "asc" } } },
      },
    },
  })
}
```

- [ ] **Step 2: Create `components/action-items/action-item-row.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

interface ActionItemRowProps {
  id: string
  title: string
  status: string
  priority: string
  assignedTo: string
  dueDate: Date | null
  interactionId: string | null
  taskId: string | null
  contactId?: string
  taskProjectId?: string
}

export function ActionItemRow({ id, title, status, priority, assignedTo, dueDate, interactionId, taskId, contactId, taskProjectId }: ActionItemRowProps) {
  const router = useRouter()
  const [marking, setMarking] = useState(false)
  const [done, setDone] = useState(status === "done")

  async function markDone() {
    setMarking(true)
    const res = await fetch(`/api/v1/action-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    })
    if (res.ok) {
      setDone(true)
      router.refresh()
    }
    setMarking(false)
  }

  const parentLink = interactionId && contactId
    ? { href: `/contacts/${contactId}`, label: "Interaction" }
    : taskId && taskProjectId
    ? { href: `/projects/${taskProjectId}`, label: "Task" }
    : null

  return (
    <div className={`flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-2.5 ${done ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <p className={`text-sm text-gray-900 ${done ? "line-through" : ""}`}>{title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {parentLink && (
            <Link href={parentLink.href} className="text-xs text-blue-500 hover:text-blue-700">{parentLink.label}</Link>
          )}
          {dueDate && <span className="text-xs text-gray-400">{new Date(dueDate).toLocaleDateString("en-GB")}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge variant="default">{assignedTo}</Badge>
        <Badge variant={priority === "critical" ? "danger" : priority === "high" ? "warning" : "default"}>{priority}</Badge>
        {!done && (
          <button onClick={markDone} disabled={marking} className="text-xs text-green-600 hover:text-green-800 border border-green-200 rounded px-2 py-0.5 disabled:opacity-50">
            {marking ? "..." : "Done"}
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `components/action-items/add-action-item-form.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface AddActionItemFormProps {
  interactionId?: string
  taskId?: string
}

export function AddActionItemForm({ interactionId, taskId }: AddActionItemFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [assignedTo, setAssignedTo] = useState<"ian" | "holly">("ian")
  const [priority, setPriority] = useState("medium")
  const [dueDate, setDueDate] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!title.trim()) return
    setSaving(true)
    const res = await fetch("/api/v1/action-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        assignedTo,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        interactionId: interactionId ?? null,
        taskId: taskId ?? null,
      }),
    })
    if (res.ok) {
      setTitle("")
      setDueDate("")
      setOpen(false)
      router.refresh()
    }
    setSaving(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-blue-600 hover:text-blue-700 mt-2">
        + Add action item
      </button>
    )
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mt-2 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Action item title"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
      />
      <div className="flex items-center gap-3 flex-wrap">
        <select value={assignedTo} onChange={e => setAssignedTo(e.target.value as "ian" | "holly")} className="border border-gray-300 rounded-lg px-2 py-1 text-sm">
          <option value="ian">Ian</option>
          <option value="holly">Holly</option>
        </select>
        <select value={priority} onChange={e => setPriority(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-sm">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-sm" />
        <div className="flex gap-2 ml-auto">
          <button onClick={handleAdd} disabled={saving || !title.trim()} className="bg-blue-600 text-white text-sm px-3 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Adding..." : "Add"}
          </button>
          <button onClick={() => setOpen(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Check if `/api/v1/action-items/[id]` PATCH route exists**

```bash
ls app/api/v1/action-items/
```

If `[id]/route.ts` does not exist, create `app/api/v1/action-items/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateActionItemStatus } from "@/lib/services/action-items"
import { UpdateActionItemSchema } from "@/lib/validations/action-item"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const parsed = UpdateActionItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const item = await updateActionItemStatus(id, parsed.data, "ian")
  return NextResponse.json(item)
}
```

- [ ] **Step 5: Update `app/(dashboard)/contacts/[id]/page.tsx`**

Replace the entire file with:

```tsx
import { getContact } from "@/lib/services/contacts"
import { InteractionList } from "@/components/interactions/interaction-list"
import { ActionItemRow } from "@/components/action-items/action-item-row"
import { AddActionItemForm } from "@/components/action-items/add-action-item-form"
import { HealthScoreBadge } from "@/components/contacts/health-score-badge"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { notFound } from "next/navigation"

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contact = await getContact(id)
  if (!contact) notFound()

  // Flatten all action items from all interactions for this contact
  const allActionItems = contact.interactions.flatMap(i =>
    (i.actionItems ?? []).map(ai => ({ ...ai, interactionId: i.id }))
  )
  const openActionItems = allActionItems.filter(ai => ai.status === "todo")

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{contact.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge>{contact.type}</Badge>
            <HealthScoreBadge score={contact.healthScore} />
            {contact.isFamilyMember && <Badge variant="info">Family</Badge>}
          </div>
        </div>
        <Link href={`/contacts/${contact.id}/edit`} className="text-sm text-blue-600 hover:text-blue-700">Edit</Link>
      </div>

      {contact.notes && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{contact.notes}</p>
        </div>
      )}

      {openActionItems.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Action items</h2>
          <div className="space-y-2">
            {openActionItems.map(item => (
              <ActionItemRow
                key={item.id}
                id={item.id}
                title={item.title}
                status={item.status}
                priority={item.priority}
                assignedTo={item.assignedTo}
                dueDate={item.dueDate}
                interactionId={item.interactionId}
                taskId={item.taskId}
                contactId={id}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Interactions</h2>
        </div>
        <InteractionList interactions={contact.interactions as any} />
        <AddActionItemForm interactionId={contact.interactions[0]?.id} />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add components/action-items/ lib/services/contacts.ts app/(dashboard)/contacts/ app/api/v1/action-items/
git commit -m "feat: add action items UI and contact detail enhancements"
```

---

## Task 14: Dashboard page + enhancements

This task creates the real dashboard page. Because `app/page.tsx` (which redirects to `/contacts`) and `app/(dashboard)/page.tsx` both map to `/` and would conflict, we delete `app/page.tsx` and create `app/(dashboard)/page.tsx` as the dashboard. We also update the login redirect to `/`.

**Files:**
- Modify: `lib/services/briefing.ts`
- Modify: `components/dashboard/stats-row.tsx`
- Create: `app/(dashboard)/page.tsx`
- Delete: `app/page.tsx` (replaced by dashboard)
- Modify: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Update `lib/services/briefing.ts`**

Replace the entire file:

```ts
import { prisma } from "@/lib/db"

export async function getBriefing() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const [
    overdueContacts,
    pendingFollowUps,
    openActionItems,
    openProjectsCount,
    tasksDueTodayCount,
    upcomingMilestones,
    myActionItems,
  ] = await Promise.all([
    prisma.contact.findMany({
      where: { interactionFreqDays: { not: null }, OR: [{ healthScore: { lt: 100 } }, { lastInteraction: null }] },
      orderBy: { healthScore: "asc" },
      take: 10,
    }),
    prisma.interaction.findMany({
      where: { followUpRequired: true, followUpCompleted: false },
      orderBy: { followUpDate: "asc" },
      take: 20,
      include: { contact: { select: { id: true, name: true } } },
    }),
    prisma.actionItem.findMany({
      where: { status: "todo" },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 20,
    }),
    prisma.project.count({
      where: { status: { in: ["planning", "active"] } },
    }),
    prisma.task.count({
      where: {
        dueDate: { gte: todayStart, lte: todayEnd },
        status: { notIn: ["done", "cancelled"] },
      },
    }),
    prisma.task.findMany({
      where: {
        isMilestone: true,
        status: { notIn: ["done", "cancelled"] },
        dueDate: { not: null },
      },
      orderBy: { dueDate: "asc" },
      take: 3,
      include: { project: { select: { id: true, title: true } } },
    }),
    prisma.actionItem.findMany({
      where: { assignedTo: "ian", status: "todo" },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 10,
      include: {
        interaction: {
          select: { id: true, contact: { select: { id: true, name: true } } },
        },
        task: {
          select: { id: true, title: true, projectId: true },
        },
      },
    }),
  ])

  return {
    overdueContacts,
    pendingFollowUps,
    openActionItems,
    openProjectsCount,
    tasksDueTodayCount,
    upcomingMilestones,
    myActionItems,
    generatedAt: new Date(),
  }
}
```

- [ ] **Step 2: Update `components/dashboard/stats-row.tsx`**

Replace the entire file:

```tsx
interface StatsRowProps {
  overdueCount: number
  followUpCount: number
  actionCount: number
  openProjectsCount: number
  tasksDueTodayCount: number
}

export function StatsRow({ overdueCount, followUpCount, actionCount, openProjectsCount, tasksDueTodayCount }: StatsRowProps) {
  return (
    <div className="flex gap-3 flex-wrap">
      {overdueCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-red-700">{overdueCount}</span>
          <span className="text-red-600 ml-1">contacts overdue</span>
        </div>
      )}
      {followUpCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-yellow-700">{followUpCount}</span>
          <span className="text-yellow-600 ml-1">follow-ups pending</span>
        </div>
      )}
      {actionCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-blue-700">{actionCount}</span>
          <span className="text-blue-600 ml-1">open actions</span>
        </div>
      )}
      {openProjectsCount > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-purple-700">{openProjectsCount}</span>
          <span className="text-purple-600 ml-1">open projects</span>
        </div>
      )}
      {tasksDueTodayCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-orange-700">{tasksDueTodayCount}</span>
          <span className="text-orange-600 ml-1">tasks due today</span>
        </div>
      )}
      {overdueCount === 0 && followUpCount === 0 && actionCount === 0 && openProjectsCount === 0 && tasksDueTodayCount === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">
          All caught up
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Delete `app/page.tsx`**

```bash
rm app/page.tsx
```

- [ ] **Step 4: Create `app/(dashboard)/page.tsx`**

```tsx
import { getBriefing } from "@/lib/services/briefing"
import { StatsRow } from "@/components/dashboard/stats-row"
import { ActionItemRow } from "@/components/action-items/action-item-row"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

export default async function DashboardPage() {
  let data: Awaited<ReturnType<typeof getBriefing>> | null = null
  let dbError = false
  try {
    data = await getBriefing()
  } catch (e) {
    console.error("[dashboard]", e)
    dbError = true
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>

      {dbError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Database unavailable. Check server logs.
        </div>
      )}

      {data && (
        <>
          <StatsRow
            overdueCount={data.overdueContacts.length}
            followUpCount={data.pendingFollowUps.length}
            actionCount={data.openActionItems.length}
            openProjectsCount={data.openProjectsCount}
            tasksDueTodayCount={data.tasksDueTodayCount}
          />

          {data.overdueContacts.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Overdue contacts</h2>
              <div className="space-y-2">
                {data.overdueContacts.map(c => (
                  <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between bg-white border border-red-200 rounded-lg px-4 py-2.5 hover:border-red-400 transition-colors">
                    <span className="text-sm font-medium text-gray-900">{c.name}</span>
                    <span className="text-xs text-red-600">Score: {c.healthScore}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.pendingFollowUps.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Pending follow-ups</h2>
              <div className="space-y-2">
                {data.pendingFollowUps.map(i => (
                  <Link key={i.id} href={`/contacts/${i.contact.id}`} className="flex items-center justify-between bg-white border border-yellow-200 rounded-lg px-4 py-2.5 hover:border-yellow-400 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{i.contact.name}</p>
                      <p className="text-xs text-gray-500 truncate max-w-xs">{i.summary}</p>
                    </div>
                    {i.followUpDate && (
                      <span className="text-xs text-gray-400 flex-shrink-0">{new Date(i.followUpDate).toLocaleDateString("en-GB")}</span>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.upcomingMilestones.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Upcoming milestones</h2>
              <div className="space-y-2">
                {data.upcomingMilestones.map(m => (
                  <Link key={m.id} href={`/projects/${m.project.id}`} className="flex items-center justify-between bg-white border border-purple-200 rounded-lg px-4 py-2.5 hover:border-purple-400 transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">★ {m.title}</p>
                      <p className="text-xs text-gray-500">{m.project.title}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={m.status === "in_progress" ? "info" : "default"}>{m.status.replace("_", " ")}</Badge>
                      {m.dueDate && <span className="text-xs text-gray-400">{new Date(m.dueDate).toLocaleDateString("en-GB")}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.myActionItems.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">My action items</h2>
              <div className="space-y-2">
                {data.myActionItems.map(item => (
                  <ActionItemRow
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    status={item.status}
                    priority={item.priority}
                    assignedTo={item.assignedTo}
                    dueDate={item.dueDate}
                    interactionId={item.interactionId}
                    taskId={item.taskId}
                    contactId={item.interaction?.contact?.id}
                    taskProjectId={item.task?.projectId}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Update login redirect to `/`**

In `app/(auth)/login/page.tsx`, change the post-login redirect:

```ts
// Find this line:
else window.location.href = "/contacts"
// Replace with:
else window.location.href = "/"
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add lib/services/briefing.ts components/dashboard/stats-row.tsx app/(dashboard)/page.tsx app/(auth)/login/page.tsx
git rm app/page.tsx
git commit -m "feat: add dashboard page with milestones and action items sections"
```

---

## Task 15: Service worker push handler + settings notifications card

**Files:**
- Create: `public/sw.js`
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create `public/sw.js`**

The existing service worker registered by `@ducanh2912/next-pwa` may already exist. Check first:

```bash
ls public/sw.js 2>/dev/null && echo "exists" || echo "not found"
```

If it does not exist, create `public/sw.js`:

```js
// Push notification handler
self.addEventListener('push', event => {
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      data: { url: data.url }
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})
```

If `public/sw.js` already exists (created by next-pwa), append the push handlers to the end of the file instead of replacing it.

- [ ] **Step 2: Update `app/(dashboard)/settings/page.tsx`**

The settings page is a `"use client"` component. Add a `NotificationsCard` section after the existing API keys section. The full updated file:

```tsx
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface ApiKey { id: string; name: string; lastUsed: string | null; createdAt: string }

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyPlaintext, setNewKeyPlaintext] = useState("")
  const [loading, setLoading] = useState(false)

  const [pushStatus, setPushStatus] = useState<"unknown" | "enabled" | "disabled" | "unsupported">("unknown")
  const [pushWorking, setPushWorking] = useState(false)

  async function loadKeys() {
    const res = await fetch("/api/v1/settings/api-keys")
    if (res.ok) setKeys(await res.json())
  }

  useEffect(() => {
    loadKeys()
    // Check push status
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("unsupported")
      return
    }
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setPushStatus(sub ? "enabled" : "disabled")
      })
    }).catch(() => setPushStatus("unsupported"))
  }, [])

  async function generateKey() {
    if (!newKeyName.trim()) return
    setLoading(true)
    const res = await fetch("/api/v1/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName }),
    })
    const data = await res.json()
    setNewKeyPlaintext(data.key)
    setNewKeyName("")
    await loadKeys()
    setLoading(false)
  }

  async function deleteKey(id: string) {
    await fetch(`/api/v1/settings/api-keys/${id}`, { method: "DELETE" })
    await loadKeys()
  }

  async function enableNotifications() {
    if (!("serviceWorker" in navigator)) return
    setPushWorking(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") { setPushWorking(false); return }

      const reg = await navigator.serviceWorker.ready
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidPublicKey) { setPushWorking(false); return }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
      const { endpoint, keys: { p256dh, auth } } = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }

      await fetch("/api/v1/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, p256dh, auth }),
      })
      setPushStatus("enabled")
    } catch (e) {
      console.error("[push] enable failed", e)
    }
    setPushWorking(false)
  }

  async function disableNotifications() {
    if (!("serviceWorker" in navigator)) return
    setPushWorking(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const { endpoint } = sub.toJSON() as { endpoint: string }
        await sub.unsubscribe()
        await fetch("/api/v1/push/unsubscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        })
      }
      setPushStatus("disabled")
    } catch (e) {
      console.error("[push] disable failed", e)
    }
    setPushWorking(false)
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">Settings</h1>

      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Holly API Keys</h2>
        <p className="text-sm text-gray-500 mb-4">API keys allow Holly (Openclaw) to access your data. Keys are shown once only.</p>

        {newKeyPlaintext && (
          <div className="bg-green-50 border border-green-300 rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-green-800 mb-1">New API key (copy now - not shown again):</p>
            <code className="text-sm font-mono text-green-900 break-all">{newKeyPlaintext}</code>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <Input placeholder="Key name (e.g. Holly production)" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} />
          <Button onClick={generateKey} disabled={loading || !newKeyName.trim()}>Generate</Button>
        </div>

        {keys.length === 0 ? (
          <p className="text-sm text-gray-500">No API keys yet.</p>
        ) : (
          <div className="space-y-2">
            {keys.map(k => (
              <div key={k.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="text-xs text-gray-400">
                    Last used: {k.lastUsed ? new Date(k.lastUsed).toLocaleDateString("en-GB") : "Never"}
                  </p>
                </div>
                <Button variant="danger" size="sm" onClick={() => deleteKey(k.id)}>Revoke</Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Notifications</h2>
        <p className="text-sm text-gray-500 mb-4">Receive push notifications for overdue contacts and pending follow-ups.</p>

        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Push notifications</p>
            <p className="text-xs text-gray-400">
              {pushStatus === "enabled" && "Enabled on this device"}
              {pushStatus === "disabled" && "Not enabled on this device"}
              {pushStatus === "unsupported" && "Not supported in this browser"}
              {pushStatus === "unknown" && "Checking..."}
            </p>
          </div>
          {pushStatus === "disabled" && (
            <Button onClick={enableNotifications} disabled={pushWorking}>
              {pushWorking ? "Enabling..." : "Enable"}
            </Button>
          )}
          {pushStatus === "enabled" && (
            <Button variant="danger" onClick={disableNotifications} disabled={pushWorking}>
              {pushWorking ? "Disabling..." : "Disable"}
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}
```

Note: The `NEXT_PUBLIC_VAPID_PUBLIC_KEY` env var needs to be set in Coolify alongside `VAPID_PUBLIC_KEY` so the browser can access it. Both should hold the same value.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add public/sw.js app/(dashboard)/settings/page.tsx
git commit -m "feat: add service worker push handler and notifications settings card"
```

---

## Task 16: Build verification + environment variable checklist

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: no TypeScript or compilation errors. Build succeeds.

- [ ] **Step 2: Verify required new env vars**

The following environment variables must be added to Coolify before deployment:

| Variable | How to get |
|---|---|
| `VAPID_PUBLIC_KEY` | Run `npx web-push generate-vapid-keys`, copy Public Key |
| `VAPID_PRIVATE_KEY` | Same command, copy Private Key |
| `VAPID_EMAIL` | Set to `mailto:your@email.com` |
| `CRON_SECRET` | Any random string, e.g. `openssl rand -hex 32` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Same value as `VAPID_PUBLIC_KEY` |

- [ ] **Step 3: Commit final build verification**

```bash
git add -A
git commit -m "feat: Phase 2 complete -- PPM UI, action items, push notifications"
```

---

## Coolify Cron Setup

After deployment, add the cron job in Coolify's scheduler:

- **URL:** `https://holly.vaelerian.uk/api/v1/cron/notify`
- **Method:** POST
- **Schedule:** `*/15 * * * *` (every 15 minutes)
- **Header:** `Authorization: Bearer <CRON_SECRET>`
