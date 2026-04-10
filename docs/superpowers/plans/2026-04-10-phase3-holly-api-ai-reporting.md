# Phase 3 - Holly API Extended, AI Data Layer, Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Holly API with project/task endpoints, a real-time SSE event stream, and richer briefing data; add analytics endpoints for health trends, project velocity, and action item completion; and build a /reports UI page.

**Architecture:** Three pillars built API-first. A shared `lib/services/analytics.ts` powers both Holly API routes and Ian's session-auth routes. SSE events are published via Redis pub/sub from service functions; the stream endpoint creates a dedicated subscriber connection. The /reports page consumes the analytics service functions directly as a server component.

**Tech Stack:** Next.js 16 App Router, Prisma 7, ioredis pub/sub, Zod validation, Jest/ts-jest, Tailwind CSS.

---

## File Map

**Create:**
- `prisma/migrations/20260410000002_interaction_transcript/migration.sql`
- `lib/sse-events.ts` - Redis publish helper
- `app/api/holly/v1/stream/route.ts` - SSE endpoint
- `app/api/holly/v1/projects/route.ts` - Holly project list + create
- `app/api/holly/v1/projects/[id]/route.ts` - Holly project detail + update
- `app/api/holly/v1/tasks/route.ts` - Holly task list + create
- `app/api/holly/v1/tasks/[id]/route.ts` - Holly task update
- `app/api/holly/v1/analytics/health/route.ts`
- `app/api/holly/v1/analytics/velocity/route.ts`
- `app/api/holly/v1/analytics/completion/route.ts`
- `app/api/v1/analytics/health/route.ts`
- `app/api/v1/analytics/velocity/route.ts`
- `app/api/v1/analytics/completion/route.ts`
- `lib/services/analytics.ts`
- `app/(dashboard)/reports/page.tsx`
- `__tests__/lib/sse-events.test.ts`
- `__tests__/services/analytics.test.ts`
- `__tests__/services/action-items.test.ts`

**Modify:**
- `prisma/schema.prisma` - add `transcript` to Interaction
- `lib/validations/interaction.ts` - add optional transcript field
- `lib/services/interactions.ts` - pass transcript through + publish SSE
- `lib/services/action-items.ts` - publish SSE on create/complete
- `lib/services/briefing.ts` - add followUpCandidates, recentInteractions, projectHealth, extend milestones window
- `app/api/v1/cron/notify/route.ts` - publish contact.overdue SSE events
- `components/layout/sidebar.tsx` - add Reports link
- `components/layout/bottom-nav.tsx` - add Reports tab
- `__tests__/services/interactions.test.ts` - add transcript + SSE tests
- `__tests__/services/briefing.test.ts` - update for new fields

---

## Task 1: Schema migration - add transcript field to Interaction

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260410000002_interaction_transcript/migration.sql`

- [ ] **Step 1: Add transcript field to schema.prisma**

In `prisma/schema.prisma`, inside the `Interaction` model, add after `occurredAt DateTime`:

```prisma
  transcript        String?
```

The full Interaction model `transcript` placement (add after the `duration` field):

```prisma
  duration          Int?
  transcript        String?
  occurredAt        DateTime
```

- [ ] **Step 2: Create migration SQL**

Create file `prisma/migrations/20260410000002_interaction_transcript/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "Interaction" ADD COLUMN "transcript" TEXT;
```

- [ ] **Step 3: Regenerate Prisma client**

Run: `npx prisma generate`

Expected output contains: `Generated Prisma Client` with no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260410000002_interaction_transcript/migration.sql app/generated/
git commit -m "feat: add transcript field to Interaction schema"
```

---

## Task 2: SSE event publisher helper

**Files:**
- Create: `lib/sse-events.ts`
- Create: `__tests__/lib/sse-events.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/sse-events.test.ts`:

```ts
import { publishSseEvent } from "@/lib/sse-events"
import { redis } from "@/lib/redis"

jest.mock("@/lib/redis", () => ({
  redis: { publish: jest.fn() },
}))

const mockRedis = redis as jest.Mocked<typeof redis>

beforeEach(() => jest.clearAllMocks())

it("publishes a structured JSON event to the holly:events channel", async () => {
  mockRedis.publish.mockResolvedValue(1 as any)
  await publishSseEvent("interaction.created", { contactId: "c1", contactName: "Alice" })
  expect(mockRedis.publish).toHaveBeenCalledWith(
    "holly:events",
    expect.stringContaining('"type":"interaction.created"')
  )
  const [, message] = (mockRedis.publish as jest.Mock).mock.calls[0]
  const parsed = JSON.parse(message)
  expect(parsed.type).toBe("interaction.created")
  expect(parsed.payload.contactId).toBe("c1")
  expect(parsed.timestamp).toBeDefined()
})

it("does not throw when Redis publish fails", async () => {
  mockRedis.publish.mockRejectedValue(new Error("Redis down"))
  await expect(publishSseEvent("action_item.created", { id: "a1" })).resolves.not.toThrow()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/sse-events.test.ts --no-coverage`

Expected: FAIL - `Cannot find module '@/lib/sse-events'`

- [ ] **Step 3: Create lib/sse-events.ts**

```ts
import { redis } from "@/lib/redis"

export type SseEventType =
  | "interaction.created"
  | "action_item.created"
  | "action_item.completed"
  | "contact.overdue"

export async function publishSseEvent(
  type: SseEventType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await redis.publish(
      "holly:events",
      JSON.stringify({ type, payload, timestamp: new Date().toISOString() })
    )
  } catch (err) {
    console.error("[sse] publish failed", type, err)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/sse-events.test.ts --no-coverage`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/sse-events.ts __tests__/lib/sse-events.test.ts
git commit -m "feat: add SSE event publisher helper"
```

---

## Task 3: Interaction service - transcript support and SSE publish

**Files:**
- Modify: `lib/validations/interaction.ts`
- Modify: `lib/services/interactions.ts`
- Modify: `__tests__/services/interactions.test.ts`

- [ ] **Step 1: Update CreateInteractionSchema**

In `lib/validations/interaction.ts`, add `transcript` to the schema:

```ts
import { z } from "zod"

export const InteractionTypeSchema = z.enum(["call", "meeting", "email", "message", "event"])
export const DirectionSchema = z.enum(["inbound", "outbound"])

export const CreateInteractionSchema = z.object({
  contactId: z.string().uuid(),
  type: InteractionTypeSchema,
  direction: DirectionSchema,
  summary: z.string().min(1, "Summary is required").max(2000),
  outcome: z.string().max(2000).nullable().default(null),
  followUpRequired: z.boolean().default(false),
  followUpDate: z.string().datetime().nullable().default(null),
  callbackExpected: z.boolean().default(false),
  location: z.string().max(200).nullable().default(null),
  duration: z.number().int().positive().nullable().default(null),
  transcript: z.string().nullable().default(null),
  occurredAt: z.string().datetime(),
})

export const UpdateInteractionSchema = CreateInteractionSchema.partial().extend({
  followUpCompleted: z.boolean().optional(),
})

export type CreateInteractionInput = z.infer<typeof CreateInteractionSchema>
export type UpdateInteractionInput = z.infer<typeof UpdateInteractionSchema>
```

- [ ] **Step 2: Write failing tests for transcript and SSE**

Add these tests to `__tests__/services/interactions.test.ts` (append after existing tests):

```ts
import { publishSseEvent } from "@/lib/sse-events"

// Add to existing jest.mock block at top - update the mock to include redis:
// jest.mock("@/lib/sse-events", () => ({ publishSseEvent: jest.fn() }))
// Add this mock at the top of the file after existing mocks:
```

Replace the entire `__tests__/services/interactions.test.ts` with:

```ts
import { createInteraction, listInteractions } from "@/lib/services/interactions"
import { prisma } from "@/lib/db"
import { computeHealthScore } from "@/lib/health-score"
import { publishSseEvent } from "@/lib/sse-events"

jest.mock("@/lib/db", () => ({
  prisma: {
    interaction: { create: jest.fn(), findMany: jest.fn() },
    contact: { findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}))

jest.mock("@/lib/health-score", () => ({
  computeHealthScore: jest.fn().mockReturnValue(75),
}))

jest.mock("@/lib/sse-events", () => ({
  publishSseEvent: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("createInteraction", () => {
  it("creates interaction and updates contact health score", async () => {
    const input = {
      contactId: "contact-1",
      type: "call" as const,
      direction: "outbound" as const,
      summary: "Caught up",
      outcome: null,
      followUpRequired: false,
      followUpDate: null,
      callbackExpected: false,
      location: null,
      duration: null,
      transcript: null,
      occurredAt: "2026-04-09T10:00:00Z",
    }
    const created = { id: "int-1", ...input, occurredAt: new Date(input.occurredAt) }
    mockPrisma.interaction.create.mockResolvedValue(created as any)
    mockPrisma.contact.findUnique.mockResolvedValue({ interactionFreqDays: 30 } as any)
    mockPrisma.contact.update.mockResolvedValue({} as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createInteraction(input, "ian")

    expect(mockPrisma.interaction.create).toHaveBeenCalled()
    expect(mockPrisma.contact.update).toHaveBeenCalledWith({
      where: { id: "contact-1" },
      data: { lastInteraction: created.occurredAt, healthScore: 75 },
    })
    expect(computeHealthScore).toHaveBeenCalledWith(created.occurredAt, 30)
  })

  it("stores transcript when provided", async () => {
    const input = {
      contactId: "contact-1",
      type: "call" as const,
      direction: "outbound" as const,
      summary: "Discussed project",
      outcome: null,
      followUpRequired: false,
      followUpDate: null,
      callbackExpected: false,
      location: null,
      duration: null,
      transcript: "Ian: Hey\nHolly: Hi",
      occurredAt: "2026-04-09T10:00:00Z",
    }
    const created = { id: "int-2", ...input, occurredAt: new Date(input.occurredAt) }
    mockPrisma.interaction.create.mockResolvedValue(created as any)
    mockPrisma.contact.findUnique.mockResolvedValue({ interactionFreqDays: null } as any)
    mockPrisma.contact.update.mockResolvedValue({} as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createInteraction(input, "holly")

    const createCall = (mockPrisma.interaction.create as jest.Mock).mock.calls[0][0]
    expect(createCall.data.transcript).toBe("Ian: Hey\nHolly: Hi")
  })

  it("publishes interaction.created SSE event", async () => {
    const input = {
      contactId: "contact-1",
      type: "meeting" as const,
      direction: "outbound" as const,
      summary: "Team standup",
      outcome: null,
      followUpRequired: false,
      followUpDate: null,
      callbackExpected: false,
      location: null,
      duration: null,
      transcript: null,
      occurredAt: "2026-04-09T10:00:00Z",
    }
    mockPrisma.interaction.create.mockResolvedValue({ id: "int-3", ...input, createdByHolly: false, occurredAt: new Date(input.occurredAt) } as any)
    mockPrisma.contact.findUnique.mockResolvedValue({ interactionFreqDays: null, name: "Alice" } as any)
    mockPrisma.contact.update.mockResolvedValue({} as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createInteraction(input, "ian")

    expect(publishSseEvent).toHaveBeenCalledWith(
      "interaction.created",
      expect.objectContaining({ contactId: "contact-1", type: "meeting" })
    )
  })
})

describe("listInteractions", () => {
  it("filters by contactId when provided", async () => {
    mockPrisma.interaction.findMany.mockResolvedValue([])
    await listInteractions({ contactId: "contact-1" })
    expect(mockPrisma.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ contactId: "contact-1" }) })
    )
  })

  it("filters followUpRequired when requested", async () => {
    mockPrisma.interaction.findMany.mockResolvedValue([])
    await listInteractions({ followUpRequired: true })
    expect(mockPrisma.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ followUpRequired: true, followUpCompleted: false }),
      })
    )
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest __tests__/services/interactions.test.ts --no-coverage`

Expected: FAIL on the new transcript and SSE tests.

- [ ] **Step 4: Update lib/services/interactions.ts**

Replace the entire file:

```ts
import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import { computeHealthScore } from "@/lib/health-score"
import { publishSseEvent } from "@/lib/sse-events"
import type { CreateInteractionInput, UpdateInteractionInput } from "@/lib/validations/interaction"

interface ListInteractionsOptions {
  contactId?: string
  followUpRequired?: boolean
  limit?: number
}

export async function listInteractions(opts: ListInteractionsOptions) {
  const where: Record<string, unknown> = {}
  if (opts.contactId) where.contactId = opts.contactId
  if (opts.followUpRequired) {
    where.followUpRequired = true
    where.followUpCompleted = false
  }
  return prisma.interaction.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take: opts.limit ?? 50,
    include: { contact: { select: { id: true, name: true } } },
  })
}

export async function getInteraction(id: string) {
  return prisma.interaction.findUnique({ where: { id }, include: { actionItems: true } })
}

export async function createInteraction(data: CreateInteractionInput, actor: Actor) {
  const interaction = await prisma.interaction.create({
    data: {
      ...data,
      occurredAt: new Date(data.occurredAt),
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
      createdByHolly: actor === "holly",
    },
    include: { contact: { select: { id: true, name: true } } },
  })

  const contact = await prisma.contact.findUnique({
    where: { id: data.contactId },
    select: { interactionFreqDays: true, name: true },
  })
  const healthScore = computeHealthScore(interaction.occurredAt, contact?.interactionFreqDays ?? null)
  await prisma.contact.update({
    where: { id: data.contactId },
    data: { lastInteraction: interaction.occurredAt, healthScore },
  })

  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: interaction.id, action: "create", actor },
  })

  await publishSseEvent("interaction.created", {
    contactId: data.contactId,
    contactName: contact?.name ?? "",
    type: data.type,
    summary: data.summary,
    createdByHolly: actor === "holly",
  })

  return interaction
}

export async function updateInteraction(id: string, data: UpdateInteractionInput, actor: Actor) {
  const interaction = await prisma.interaction.update({ where: { id }, data })
  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: id, action: "update", actor },
  })
  return interaction
}

export async function deleteInteraction(id: string, actor: Actor) {
  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: id, action: "delete", actor },
  })
  return prisma.interaction.delete({ where: { id } })
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/services/interactions.test.ts --no-coverage`

Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add lib/validations/interaction.ts lib/services/interactions.ts __tests__/services/interactions.test.ts
git commit -m "feat: add transcript field and SSE publish to interaction service"
```

---

## Task 4: Action-items service - SSE publish on create and complete

**Files:**
- Modify: `lib/services/action-items.ts`
- Create: `__tests__/services/action-items.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/services/action-items.test.ts`:

```ts
import { createActionItem, updateActionItemStatus } from "@/lib/services/action-items"
import { prisma } from "@/lib/db"
import { publishSseEvent } from "@/lib/sse-events"

jest.mock("@/lib/db", () => ({
  prisma: {
    actionItem: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}))

jest.mock("@/lib/sse-events", () => ({
  publishSseEvent: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("createActionItem", () => {
  it("creates action item and publishes SSE event", async () => {
    const input = {
      title: "Send email",
      status: "todo" as const,
      priority: "medium" as const,
      assignedTo: "ian" as const,
      dueDate: null,
      interactionId: null,
      taskId: null,
    }
    const created = { id: "a1", ...input }
    mockPrisma.actionItem.create.mockResolvedValue(created as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createActionItem(input, "ian")

    expect(mockPrisma.actionItem.create).toHaveBeenCalled()
    expect(publishSseEvent).toHaveBeenCalledWith(
      "action_item.created",
      expect.objectContaining({ id: "a1", title: "Send email", assignedTo: "ian" })
    )
  })
})

describe("updateActionItemStatus", () => {
  it("publishes action_item.completed when status changes to done", async () => {
    const existing = { id: "a1", title: "Send email", assignedTo: "ian", status: "todo" }
    const updated = { ...existing, status: "done" }
    mockPrisma.actionItem.findUnique.mockResolvedValue(existing as any)
    mockPrisma.actionItem.update.mockResolvedValue(updated as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await updateActionItemStatus("a1", { status: "done" }, "ian")

    expect(publishSseEvent).toHaveBeenCalledWith(
      "action_item.completed",
      expect.objectContaining({ id: "a1", title: "Send email", assignedTo: "ian" })
    )
  })

  it("does not publish SSE when status does not change to done", async () => {
    const existing = { id: "a1", title: "Send email", assignedTo: "ian", status: "todo" }
    const updated = { ...existing, status: "cancelled" }
    mockPrisma.actionItem.findUnique.mockResolvedValue(existing as any)
    mockPrisma.actionItem.update.mockResolvedValue(updated as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await updateActionItemStatus("a1", { status: "cancelled" }, "ian")

    expect(publishSseEvent).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/action-items.test.ts --no-coverage`

Expected: FAIL - `publishSseEvent` is not called.

- [ ] **Step 3: Update lib/services/action-items.ts**

```ts
import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import { publishSseEvent } from "@/lib/sse-events"
import type { CreateActionItemInput, UpdateActionItemInput } from "@/lib/validations/action-item"

export async function listActionItems(opts: { assignedTo?: Actor; status?: string } = {}) {
  const where: Record<string, unknown> = {}
  if (opts.assignedTo) where.assignedTo = opts.assignedTo
  if (opts.status) where.status = opts.status
  return prisma.actionItem.findMany({ where, orderBy: [{ priority: "desc" }, { dueDate: "asc" }] })
}

export async function createActionItem(data: CreateActionItemInput, actor: Actor) {
  const item = await prisma.actionItem.create({
    data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : null },
  })
  await prisma.auditLog.create({
    data: { entity: "ActionItem", entityId: item.id, action: "create", actor },
  })
  await publishSseEvent("action_item.created", {
    id: item.id,
    title: item.title,
    assignedTo: item.assignedTo,
    priority: item.priority,
    dueDate: item.dueDate ? item.dueDate.toISOString() : null,
  })
  return item
}

export async function updateActionItemStatus(id: string, data: UpdateActionItemInput, actor: Actor) {
  const before = await prisma.actionItem.findUnique({ where: { id } })
  const item = await prisma.actionItem.update({ where: { id }, data })
  await prisma.auditLog.create({
    data: { entity: "ActionItem", entityId: id, action: "update", actor, diff: { before, after: item } },
  })
  if (data.status === "done" && before?.status !== "done") {
    await publishSseEvent("action_item.completed", {
      id: item.id,
      title: item.title,
      assignedTo: item.assignedTo,
    })
  }
  return item
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/services/action-items.test.ts --no-coverage`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/action-items.ts __tests__/services/action-items.test.ts
git commit -m "feat: publish SSE events from action-items service"
```

---

## Task 5: Cron endpoint - publish contact.overdue SSE events

**Files:**
- Modify: `app/api/v1/cron/notify/route.ts`

- [ ] **Step 1: Update the cron endpoint**

The `contact.overdue` SSE event must be published when overdue contacts are found, regardless of whether push is configured. Restructure the endpoint so SSE publishing happens independently.

Replace the entire `app/api/v1/cron/notify/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import { sendPushNotification, isPushConfigured } from "@/lib/push"
import { publishSseEvent } from "@/lib/sse-events"

const MAX_NOTIFICATIONS_PER_RUN = 5

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
    take: 50,
  })

  // Publish SSE events for critically overdue contacts (healthScore < 40)
  for (const contact of overdueContacts) {
    if (contact.healthScore < 40) {
      const sseKey = `sse:sent:overdue:${contact.id}:${today}`
      const alreadySent = await redis.get(sseKey).catch(() => null)
      if (!alreadySent) {
        await publishSseEvent("contact.overdue", {
          id: contact.id,
          name: contact.name,
          healthScore: contact.healthScore,
        })
        await redis.set(sseKey, "1", "EX", 86400).catch(() => {})
      }
    }
  }

  if (!isPushConfigured) {
    return NextResponse.json({ sent: 0 })
  }

  const subscriptions = await prisma.pushSubscription.findMany()
  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

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
    take: 50,
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

- [ ] **Step 2: Verify build still compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/cron/notify/route.ts
git commit -m "feat: publish contact.overdue SSE events from cron endpoint"
```

---

## Task 6: SSE stream endpoint

**Files:**
- Create: `app/api/holly/v1/stream/route.ts`

- [ ] **Step 1: Create the SSE stream route**

Create `app/api/holly/v1/stream/route.ts`:

```ts
import { NextRequest } from "next/server"
import Redis from "ioredis"
import { validateHollyRequest } from "@/lib/holly-auth"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", code: "RATE_LIMITED" }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } }
      )
    }
    return new Response(
      JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    )
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const subscriber = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
        maxRetriesPerRequest: 3,
        lazyConnect: false,
      })

      subscriber.subscribe("holly:events", (err) => {
        if (err) {
          console.error("[sse] subscribe error", err)
          try { controller.close() } catch {}
          return
        }
        try {
          controller.enqueue(encoder.encode(`data: {"type":"connected"}\n\n`))
        } catch {}
      })

      subscriber.on("message", (_channel: string, message: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`))
        } catch {}
      })

      subscriber.on("error", (err) => {
        console.error("[sse] redis subscriber error", err)
      })

      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch {
          clearInterval(pingInterval)
        }
      }, 30000)

      req.signal.addEventListener("abort", () => {
        clearInterval(pingInterval)
        subscriber.unsubscribe("holly:events").catch(() => {})
        subscriber.quit().catch(() => {})
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/holly/v1/stream/route.ts
git commit -m "feat: add SSE event stream endpoint for Holly API"
```

---

## Task 7: Enrich briefing service

**Files:**
- Modify: `lib/services/briefing.ts`
- Modify: `__tests__/services/briefing.test.ts`

- [ ] **Step 1: Write failing tests for new briefing fields**

Replace `__tests__/services/briefing.test.ts`:

```ts
import { getBriefing } from "@/lib/services/briefing"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    contact: { findMany: jest.fn() },
    interaction: { findMany: jest.fn() },
    actionItem: { findMany: jest.fn() },
    project: { count: jest.fn(), findMany: jest.fn() },
    task: { count: jest.fn(), findMany: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

it("getBriefing returns all expected fields including new Phase 3 fields", async () => {
  // overdueContacts + followUpCandidates both use contact.findMany
  mockPrisma.contact.findMany
    .mockResolvedValueOnce([{ id: "c1", name: "Alice", healthScore: 40 }] as any)
    .mockResolvedValueOnce([
      { id: "c2", name: "Bob", healthScore: 100, lastInteraction: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), interactionFreqDays: 21 },
    ] as any)
  mockPrisma.interaction.findMany
    .mockResolvedValueOnce([{ id: "i1", followUpRequired: true }] as any) // pendingFollowUps
    .mockResolvedValueOnce([{ id: "i2", summary: "Chat", transcript: null }] as any) // recentInteractions
  mockPrisma.actionItem.findMany
    .mockResolvedValueOnce([{ id: "a1", status: "todo" }] as any) // openActionItems
    .mockResolvedValueOnce([{ id: "a2", status: "todo", assignedTo: "ian" }] as any) // myActionItems
  mockPrisma.project.count.mockResolvedValue(3 as any)
  mockPrisma.project.findMany.mockResolvedValue([
    { id: "p1", title: "Project A", status: "active", tasks: [{ status: "done" }, { status: "todo" }] },
  ] as any)
  mockPrisma.task.count.mockResolvedValue(2 as any)
  mockPrisma.task.findMany.mockResolvedValue([{ id: "t1", title: "Milestone 1", isMilestone: true }] as any)

  const result = await getBriefing()

  expect(result.overdueContacts).toHaveLength(1)
  expect(result.pendingFollowUps).toHaveLength(1)
  expect(result.openActionItems).toHaveLength(1)
  expect(result.openProjectsCount).toBe(3)
  expect(result.tasksDueTodayCount).toBe(2)
  expect(result.upcomingMilestones).toHaveLength(1)
  expect(result.myActionItems).toHaveLength(1)
  expect(result.recentInteractions).toHaveLength(1)
  expect(result.projectHealth).toHaveLength(1)
  expect(result.projectHealth[0]).toMatchObject({ id: "p1", tasksTotal: 2, tasksCompleted: 1, percentComplete: 50 })
  expect(result.generatedAt).toBeInstanceOf(Date)
})

it("followUpCandidates filters contacts approaching overdue threshold", async () => {
  const now = Date.now()
  // Contact with 21-day freq, last contact 18 days ago (> 80% of 21 = 16.8 days) - SHOULD appear
  const approaching = { id: "c3", name: "Carol", healthScore: 100, lastInteraction: new Date(now - 18 * 24 * 60 * 60 * 1000), interactionFreqDays: 21 }
  // Contact with 21-day freq, last contact 10 days ago (< 80%) - should NOT appear
  const notYet = { id: "c4", name: "Dave", healthScore: 100, lastInteraction: new Date(now - 10 * 24 * 60 * 60 * 1000), interactionFreqDays: 21 }

  mockPrisma.contact.findMany
    .mockResolvedValueOnce([]) // overdueContacts
    .mockResolvedValueOnce([approaching, notYet] as any) // candidates pool
  mockPrisma.interaction.findMany.mockResolvedValue([])
  mockPrisma.actionItem.findMany.mockResolvedValue([]).mockResolvedValue([])
  mockPrisma.project.count.mockResolvedValue(0 as any)
  mockPrisma.project.findMany.mockResolvedValue([])
  mockPrisma.task.count.mockResolvedValue(0 as any)
  mockPrisma.task.findMany.mockResolvedValue([])

  const result = await getBriefing()

  expect(result.followUpCandidates).toHaveLength(1)
  expect(result.followUpCandidates[0].id).toBe("c3")
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/briefing.test.ts --no-coverage`

Expected: FAIL - missing fields on result.

- [ ] **Step 3: Update lib/services/briefing.ts**

Replace the entire file:

```ts
import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/enums"

export async function getBriefing() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)
  const fourteenDaysFromNow = new Date()
  fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14)

  const [
    overdueContacts,
    pendingFollowUps,
    openActionItems,
    openProjectsCount,
    tasksDueTodayCount,
    upcomingMilestones,
    myActionItems,
    candidateContacts,
    recentInteractions,
    activeProjects,
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
        dueDate: { gte: todayStart, lte: fourteenDaysFromNow },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { project: { select: { id: true, title: true } } },
    }),
    prisma.actionItem.findMany({
      where: { assignedTo: Actor.ian, status: "todo" },
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
    // Contacts with a frequency target and full health (not yet overdue), for candidate filtering
    prisma.contact.findMany({
      where: { interactionFreqDays: { not: null }, healthScore: 100, lastInteraction: { not: null } },
      select: { id: true, name: true, lastInteraction: true, interactionFreqDays: true },
    }),
    // Last 5 interactions with full text
    prisma.interaction.findMany({
      orderBy: { occurredAt: "desc" },
      take: 5,
      include: { contact: { select: { id: true, name: true } } },
    }),
    // Active projects with task status breakdown
    prisma.project.findMany({
      where: { status: { in: ["planning", "active"] } },
      select: {
        id: true,
        title: true,
        status: true,
        tasks: { select: { status: true } },
      },
    }),
  ])

  const now = new Date()
  const followUpCandidates = candidateContacts.filter(c => {
    const daysSince = (now.getTime() - c.lastInteraction!.getTime()) / (1000 * 60 * 60 * 24)
    return daysSince > c.interactionFreqDays! * 0.8
  })

  const projectHealth = activeProjects.map(p => ({
    id: p.id,
    title: p.title,
    status: p.status,
    tasksTotal: p.tasks.length,
    tasksCompleted: p.tasks.filter(t => t.status === "done").length,
    percentComplete:
      p.tasks.length > 0
        ? Math.round((p.tasks.filter(t => t.status === "done").length / p.tasks.length) * 100)
        : 0,
  }))

  return {
    overdueContacts,
    pendingFollowUps,
    openActionItems,
    openProjectsCount,
    tasksDueTodayCount,
    upcomingMilestones,
    myActionItems,
    followUpCandidates,
    recentInteractions,
    projectHealth,
    generatedAt: new Date(),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/services/briefing.test.ts --no-coverage`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/briefing.ts __tests__/services/briefing.test.ts
git commit -m "feat: enrich briefing with followUpCandidates, recentInteractions, projectHealth, 14-day milestones"
```

---

## Task 8: Holly API project and task endpoints

**Files:**
- Create: `app/api/holly/v1/projects/route.ts`
- Create: `app/api/holly/v1/projects/[id]/route.ts`
- Create: `app/api/holly/v1/tasks/route.ts`
- Create: `app/api/holly/v1/tasks/[id]/route.ts`

- [ ] **Step 1: Create Holly project list + create route**

Create `app/api/holly/v1/projects/route.ts`:

```ts
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
  })
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const body = await req.json()
  const parsed = CreateProjectSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const project = await createProject(parsed.data, "holly")
  return NextResponse.json(project, { status: 201 })
}
```

- [ ] **Step 2: Create Holly project detail + update route**

Create `app/api/holly/v1/projects/[id]/route.ts`:

```ts
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
  const project = await getProject(id)
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
  const body = await req.json()
  const parsed = UpdateProjectSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const project = await updateProject(id, parsed.data, "holly")
  return NextResponse.json(project)
}
```

- [ ] **Step 3: Create Holly task list + create route**

Create `app/api/holly/v1/tasks/route.ts`:

```ts
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
  })
  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const body = await req.json()
  const parsed = CreateTaskSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const task = await createTask(parsed.data, "holly")
  return NextResponse.json(task, { status: 201 })
}
```

- [ ] **Step 4: Create Holly task update route**

Create `app/api/holly/v1/tasks/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { updateTask } from "@/lib/services/tasks"
import { UpdateTaskSchema } from "@/lib/validations/task"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json()
  const parsed = UpdateTaskSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const task = await updateTask(id, parsed.data, "holly")
  return NextResponse.json(task)
}
```

- [ ] **Step 5: Verify build compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/holly/v1/projects/ app/api/holly/v1/tasks/
git commit -m "feat: add Holly API project and task endpoints"
```

---

## Task 9: Analytics service

**Files:**
- Create: `lib/services/analytics.ts`
- Create: `__tests__/services/analytics.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/services/analytics.test.ts`:

```ts
import { getHealthAnalytics, getVelocityAnalytics, getCompletionAnalytics } from "@/lib/services/analytics"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    contact: { findMany: jest.fn() },
    project: { findMany: jest.fn() },
    actionItem: { findMany: jest.fn() },
    auditLog: { findMany: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("getHealthAnalytics", () => {
  it("returns contacts with trend based on AuditLog history", async () => {
    const contact = { id: "c1", name: "Alice", healthScore: 60, lastInteraction: new Date(), interactionFreqDays: 14 }
    mockPrisma.contact.findMany.mockResolvedValue([contact] as any)
    // AuditLog has an entry before the window showing healthScore was 90
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { entityId: "c1", diff: { after: { healthScore: 90 } }, occurredAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
    ] as any)

    const result = await getHealthAnalytics(30)

    expect(result.window).toBe(30)
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts[0].currentScore).toBe(60)
    expect(result.contacts[0].previousScore).toBe(90)
    expect(result.contacts[0].trend).toBe("declining")
  })

  it("returns insufficient_data when no AuditLog history exists", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c2", name: "Bob", healthScore: 80, lastInteraction: new Date(), interactionFreqDays: 21 },
    ] as any)
    mockPrisma.auditLog.findMany.mockResolvedValue([])

    const result = await getHealthAnalytics(30)

    expect(result.contacts[0].trend).toBe("insufficient_data")
    expect(result.contacts[0].previousScore).toBeNull()
  })
})

describe("getVelocityAnalytics", () => {
  it("computes weeklyRate and projectedCompletionDate from AuditLog", async () => {
    const project = {
      id: "p1", title: "Alpha", status: "active",
      tasks: [
        { id: "t1", status: "done" },
        { id: "t2", status: "done" },
        { id: "t3", status: "todo" },
        { id: "t4", status: "todo" },
      ],
    }
    mockPrisma.project.findMany.mockResolvedValue([project] as any)
    // t1 and t2 completed within window
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { entityId: "t1", diff: { after: { status: "done" } }, occurredAt: new Date() },
      { entityId: "t2", diff: { after: { status: "done" } }, occurredAt: new Date() },
    ] as any)

    const result = await getVelocityAnalytics(14)

    expect(result.projects[0].tasksTotal).toBe(4)
    expect(result.projects[0].tasksCompleted).toBe(2)
    expect(result.projects[0].completedInWindow).toBe(2)
    expect(result.projects[0].weeklyRate).toBeGreaterThan(0)
    expect(result.projects[0].projectedCompletionDate).toBeDefined()
  })

  it("returns null projectedCompletionDate when weeklyRate is 0", async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      { id: "p2", title: "Beta", status: "active", tasks: [{ id: "t5", status: "todo" }] },
    ] as any)
    mockPrisma.auditLog.findMany.mockResolvedValue([])

    const result = await getVelocityAnalytics(30)

    expect(result.projects[0].weeklyRate).toBe(0)
    expect(result.projects[0].projectedCompletionDate).toBeNull()
  })
})

describe("getCompletionAnalytics", () => {
  it("computes rates and byWeek breakdown", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { entityId: "a1", diff: { after: { status: "done" } }, occurredAt: new Date() },
    ] as any)
    mockPrisma.actionItem.findMany
      .mockResolvedValueOnce([{ id: "a1", assignedTo: "ian" }] as any) // completed items
      .mockResolvedValueOnce([]) // overdue todos
    
    const result = await getCompletionAnalytics(30)

    expect(result.window).toBe(30)
    expect(result.rates.ian).toBe(1)
    expect(result.rates.holly).toBe(0)
    expect(result.byWeek).toHaveLength(8)
  })

  it("returns zero rates when no completed items", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([])
    mockPrisma.actionItem.findMany.mockResolvedValue([])

    const result = await getCompletionAnalytics(30)

    expect(result.rates.ian).toBe(0)
    expect(result.rates.holly).toBe(0)
    expect(result.byWeek).toHaveLength(8)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/analytics.test.ts --no-coverage`

Expected: FAIL - `Cannot find module '@/lib/services/analytics'`

- [ ] **Step 3: Create lib/services/analytics.ts**

```ts
import { prisma } from "@/lib/db"

export async function getHealthAnalytics(days: number) {
  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - days)

  const contacts = await prisma.contact.findMany({
    where: { interactionFreqDays: { not: null } },
    select: { id: true, name: true, healthScore: true, lastInteraction: true, interactionFreqDays: true },
    orderBy: { healthScore: "asc" },
  })

  // Find the most recent health score for each contact from before the window
  const auditLogs = await prisma.auditLog.findMany({
    where: { entity: "Contact", action: "update", occurredAt: { lt: windowStart } },
    orderBy: { occurredAt: "desc" },
  })

  const historicalScores = new Map<string, number>()
  for (const log of auditLogs) {
    if (historicalScores.has(log.entityId)) continue
    const diff = log.diff as { after?: { healthScore?: number } } | null
    if (diff?.after?.healthScore !== undefined) {
      historicalScores.set(log.entityId, diff.after.healthScore)
    }
  }

  const now = new Date()
  return {
    window: days,
    contacts: contacts.map(c => {
      const previousScore = historicalScores.get(c.id)
      const trend =
        previousScore === undefined
          ? "insufficient_data"
          : c.healthScore > previousScore
          ? "improving"
          : c.healthScore < previousScore
          ? "declining"
          : "stable"
      const daysSinceLastInteraction = c.lastInteraction
        ? Math.floor((now.getTime() - c.lastInteraction.getTime()) / (1000 * 60 * 60 * 24))
        : null
      return {
        id: c.id,
        name: c.name,
        currentScore: c.healthScore,
        previousScore: previousScore ?? null,
        trend,
        daysSinceLastInteraction,
        frequencyTargetDays: c.interactionFreqDays,
      }
    }),
  }
}

export async function getVelocityAnalytics(days: number) {
  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - days)

  const projects = await prisma.project.findMany({
    where: { status: { in: ["planning", "active", "on_hold"] } },
    select: {
      id: true,
      title: true,
      status: true,
      tasks: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  // Tasks that transitioned to "done" within the window
  const taskLogs = await prisma.auditLog.findMany({
    where: { entity: "Task", action: "update", occurredAt: { gte: windowStart } },
  })
  const completedInWindowIds = new Set<string>()
  for (const log of taskLogs) {
    const diff = log.diff as { after?: { status?: string } } | null
    if (diff?.after?.status === "done") completedInWindowIds.add(log.entityId)
  }

  const weeksInWindow = days / 7

  return {
    window: days,
    projects: projects.map(p => {
      const tasksTotal = p.tasks.length
      const tasksCompleted = p.tasks.filter(t => t.status === "done").length
      const completedInWindow = p.tasks.filter(t => completedInWindowIds.has(t.id)).length
      const weeklyRate =
        weeksInWindow > 0
          ? Math.round((completedInWindow / weeksInWindow) * 100) / 100
          : 0
      const remaining = tasksTotal - tasksCompleted
      const projectedCompletionDate =
        weeklyRate > 0
          ? new Date(Date.now() + (remaining / weeklyRate) * 7 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0]
          : null
      return {
        id: p.id,
        title: p.title,
        status: p.status,
        tasksTotal,
        tasksCompleted,
        completedInWindow,
        weeklyRate,
        projectedCompletionDate,
      }
    }),
  }
}

export async function getCompletionAnalytics(days: number) {
  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - days)

  const actionItemLogs = await prisma.auditLog.findMany({
    where: { entity: "ActionItem", action: "update", occurredAt: { gte: windowStart } },
    orderBy: { occurredAt: "asc" },
  })

  const completedLogs = actionItemLogs.filter(log => {
    const diff = log.diff as { after?: { status?: string } } | null
    return diff?.after?.status === "done"
  })

  const completedItemIds = [...new Set(completedLogs.map(l => l.entityId))]
  const completedItems =
    completedItemIds.length > 0
      ? await prisma.actionItem.findMany({
          where: { id: { in: completedItemIds } },
          select: { id: true, assignedTo: true },
        })
      : []

  const assigneeMap = new Map(completedItems.map(i => [i.id, i.assignedTo]))

  const overdueItems = await prisma.actionItem.findMany({
    where: { status: "todo", dueDate: { gte: windowStart, lt: new Date() } },
    select: { id: true, assignedTo: true },
  })

  const doneIan = completedItems.filter(i => i.assignedTo === "ian").length
  const doneHolly = completedItems.filter(i => i.assignedTo === "holly").length
  const overdueIan = overdueItems.filter(i => i.assignedTo === "ian").length
  const overdueHolly = overdueItems.filter(i => i.assignedTo === "holly").length
  const totalIan = doneIan + overdueIan
  const totalHolly = doneHolly + overdueHolly

  // 8 weeks, most recent first
  const byWeek = Array.from({ length: 8 }, (_, i) => {
    const weekEnd = new Date()
    weekEnd.setDate(weekEnd.getDate() - i * 7)
    weekEnd.setHours(23, 59, 59, 999)
    const weekStart = new Date(weekEnd)
    weekStart.setDate(weekStart.getDate() - 6)
    weekStart.setHours(0, 0, 0, 0)

    const weekLogs = completedLogs.filter(
      l => l.occurredAt >= weekStart && l.occurredAt <= weekEnd
    )
    return {
      weekStart: weekStart.toISOString().split("T")[0],
      ian: weekLogs.filter(l => assigneeMap.get(l.entityId) === "ian").length,
      holly: weekLogs.filter(l => assigneeMap.get(l.entityId) === "holly").length,
    }
  })

  return {
    window: days,
    rates: {
      ian: totalIan > 0 ? Math.round((doneIan / totalIan) * 100) / 100 : 0,
      holly: totalHolly > 0 ? Math.round((doneHolly / totalHolly) * 100) / 100 : 0,
    },
    byWeek,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/services/analytics.test.ts --no-coverage`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/analytics.ts __tests__/services/analytics.test.ts
git commit -m "feat: add analytics service for health, velocity, and completion metrics"
```

---

## Task 10: Analytics API routes (Holly and Ian)

**Files:**
- Create: `app/api/holly/v1/analytics/health/route.ts`
- Create: `app/api/holly/v1/analytics/velocity/route.ts`
- Create: `app/api/holly/v1/analytics/completion/route.ts`
- Create: `app/api/v1/analytics/health/route.ts`
- Create: `app/api/v1/analytics/velocity/route.ts`
- Create: `app/api/v1/analytics/completion/route.ts`

- [ ] **Step 1: Create Holly analytics routes**

Create `app/api/holly/v1/analytics/health/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { getHealthAnalytics } from "@/lib/services/analytics"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30))
  return NextResponse.json(await getHealthAnalytics(days))
}
```

Create `app/api/holly/v1/analytics/velocity/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { getVelocityAnalytics } from "@/lib/services/analytics"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30))
  return NextResponse.json(await getVelocityAnalytics(days))
}
```

Create `app/api/holly/v1/analytics/completion/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { getCompletionAnalytics } from "@/lib/services/analytics"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30))
  return NextResponse.json(await getCompletionAnalytics(days))
}
```

- [ ] **Step 2: Create Ian's session-auth analytics routes**

Create `app/api/v1/analytics/health/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getHealthAnalytics } from "@/lib/services/analytics"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30))
  return NextResponse.json(await getHealthAnalytics(days))
}
```

Create `app/api/v1/analytics/velocity/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getVelocityAnalytics } from "@/lib/services/analytics"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30))
  return NextResponse.json(await getVelocityAnalytics(days))
}
```

Create `app/api/v1/analytics/completion/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCompletionAnalytics } from "@/lib/services/analytics"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const days = Math.min(365, Math.max(7, parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30))
  return NextResponse.json(await getCompletionAnalytics(days))
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/holly/v1/analytics/ app/api/v1/analytics/
git commit -m "feat: add analytics API routes for Holly and Ian"
```

---

## Task 11: Reports UI page

**Files:**
- Create: `app/(dashboard)/reports/page.tsx`

- [ ] **Step 1: Create the reports page**

Create `app/(dashboard)/reports/page.tsx`:

```tsx
import { getHealthAnalytics, getVelocityAnalytics, getCompletionAnalytics } from "@/lib/services/analytics"

interface PageProps {
  searchParams: Promise<{ days?: string }>
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const { days: daysParam } = await searchParams
  const days = Math.min(365, Math.max(7, parseInt(daysParam ?? "30", 10) || 30))

  let health: Awaited<ReturnType<typeof getHealthAnalytics>> | null = null
  let velocity: Awaited<ReturnType<typeof getVelocityAnalytics>> | null = null
  let completion: Awaited<ReturnType<typeof getCompletionAnalytics>> | null = null
  let dbError = false

  try {
    ;[health, velocity, completion] = await Promise.all([
      getHealthAnalytics(days),
      getVelocityAnalytics(days),
      getCompletionAnalytics(days),
    ])
  } catch (e) {
    console.error("[reports page]", e)
    dbError = true
  }

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#c0c0d0]">Reports</h1>
        <form className="flex items-center gap-2">
          <label className="text-sm text-[#666688]">Window:</label>
          <select
            name="days"
            defaultValue={String(days)}
            className="border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-1.5 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none"
          >
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 365 days</option>
          </select>
          <button
            type="submit"
            className="bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] text-[#c0c0d0] text-sm px-3 py-1.5 rounded-lg hover:bg-[rgba(0,255,136,0.08)]"
          >
            Apply
          </button>
        </form>
      </div>

      {dbError && (
        <div className="bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.25)] rounded-lg px-4 py-3 text-sm text-red-400">
          Database unavailable. Check server logs.
        </div>
      )}

      {health && (
        <section>
          <h2 className="text-base font-semibold text-[#c0c0d0] mb-3">Relationship Health</h2>
          {health.contacts.length === 0 ? (
            <p className="text-sm text-[#666688]">No contacts with frequency targets set.</p>
          ) : (
            <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(0,255,136,0.15)]">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Contact</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Score</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Trend</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Days Since</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {health.contacts.map((c, i) => (
                    <tr key={c.id} className={i < health!.contacts.length - 1 ? "border-b border-[rgba(0,255,136,0.08)]" : ""}>
                      <td className="px-4 py-2.5 text-[#c0c0d0] font-medium">{c.name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-medium ${c.currentScore >= 70 ? "text-[#00ff88]" : c.currentScore >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                          {c.currentScore}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[#666688]">
                        {c.trend === "improving" && <span className="text-[#00ff88]">up</span>}
                        {c.trend === "declining" && <span className="text-red-400">down</span>}
                        {c.trend === "stable" && <span className="text-[#666688]">stable</span>}
                        {c.trend === "insufficient_data" && <span className="text-[#444466]">-</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[#666688]">
                        {c.daysSinceLastInteraction !== null ? `${c.daysSinceLastInteraction}d` : "never"}
                      </td>
                      <td className="px-4 py-2.5 text-[#666688]">{c.frequencyTargetDays}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {velocity && (
        <section>
          <h2 className="text-base font-semibold text-[#c0c0d0] mb-3">Project Velocity</h2>
          {velocity.projects.length === 0 ? (
            <p className="text-sm text-[#666688]">No active projects.</p>
          ) : (
            <div className="space-y-3">
              {velocity.projects.map(p => {
                const pct = p.tasksTotal > 0 ? Math.round((p.tasksCompleted / p.tasksTotal) * 100) : 0
                return (
                  <div key={p.id} className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-[#c0c0d0]">{p.title}</p>
                      <span className="text-xs text-[#666688]">{p.tasksCompleted}/{p.tasksTotal} tasks</span>
                    </div>
                    <div className="w-full bg-[#0a0a1a] rounded-full h-1.5 mb-2">
                      <div
                        className="bg-[#00ff88] h-1.5 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#666688]">
                      <span>{p.weeklyRate} tasks/week</span>
                      {p.projectedCompletionDate ? (
                        <span>Est. done {p.projectedCompletionDate}</span>
                      ) : (
                        <span>No completion estimate</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {completion && (
        <section>
          <h2 className="text-base font-semibold text-[#c0c0d0] mb-3">Action Item Completion</h2>
          <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(0,255,136,0.15)]">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Person</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Completion Rate</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[rgba(0,255,136,0.08)]">
                  <td className="px-4 py-2.5 text-[#c0c0d0]">Ian</td>
                  <td className="px-4 py-2.5 text-[#00ff88] font-medium">{Math.round(completion.rates.ian * 100)}%</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-[#c0c0d0]">Holly</td>
                  <td className="px-4 py-2.5 text-[#00ff88] font-medium">{Math.round(completion.rates.holly * 100)}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-semibold text-[#666688] uppercase tracking-wide mb-2">Week by Week</h3>
          <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(0,255,136,0.15)]">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Week</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Ian</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Holly</th>
                </tr>
              </thead>
              <tbody>
                {completion.byWeek.map((w, i) => (
                  <tr key={w.weekStart} className={i < completion!.byWeek.length - 1 ? "border-b border-[rgba(0,255,136,0.08)]" : ""}>
                    <td className="px-4 py-2.5 text-[#666688]">{w.weekStart}</td>
                    <td className="px-4 py-2.5 text-[#c0c0d0]">{w.ian}</td>
                    <td className="px-4 py-2.5 text-[#c0c0d0]">{w.holly}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/reports/page.tsx
git commit -m "feat: add /reports page with health, velocity, and completion sections"
```

---

## Task 12: Navigation update

**Files:**
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/bottom-nav.tsx`

- [ ] **Step 1: Add Reports to sidebar**

In `components/layout/sidebar.tsx`, update the `links` array to add Reports:

```ts
const links = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/projects", label: "Projects" },
  { href: "/tasks", label: "Tasks" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
]
```

- [ ] **Step 2: Add Reports to bottom nav**

In `components/layout/bottom-nav.tsx`, update the `tabs` array to add Reports:

```ts
const tabs = [
  { href: "/", label: "Home", icon: "⊞" },
  { href: "/contacts", label: "Contacts", icon: "👤" },
  { href: "/log", label: "Log", icon: "+" },
  { href: "/projects", label: "Projects", icon: "📋" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
  { href: "/reports", label: "Reports", icon: "◈" },
]
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/layout/sidebar.tsx components/layout/bottom-nav.tsx
git commit -m "feat: add Reports to sidebar and bottom nav"
```

---

## Task 13: Run full test suite and push

- [ ] **Step 1: Run all tests**

Run: `npx jest --no-coverage`

Expected: All tests PASS. If any fail, fix before proceeding.

- [ ] **Step 2: Run production build**

Run: `npx next build --webpack`

Expected: Build completes without errors.

- [ ] **Step 3: Push to remote**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by task |
|---|---|
| transcript field on Interaction | Task 1, 3 |
| SSE stream endpoint | Task 6 |
| SSE events: interaction.created | Task 3 |
| SSE events: action_item.created, action_item.completed | Task 4 |
| SSE events: contact.overdue | Task 5 |
| Holly project endpoints (list, create, detail, update) | Task 8 |
| Holly task endpoints (list, create, update) | Task 8 |
| Enriched briefing (followUpCandidates, recentInteractions, projectHealth, 14d milestones) | Task 7 |
| Analytics: health trends | Task 9, 10 |
| Analytics: project velocity | Task 9, 10 |
| Analytics: completion rates | Task 9, 10 |
| Ian analytics API routes | Task 10 |
| Reports UI page | Task 11 |
| Reports navigation | Task 12 |

**Type consistency:** `publishSseEvent` defined in Task 2, consumed identically in Tasks 3, 4, 5. `getHealthAnalytics`, `getVelocityAnalytics`, `getCompletionAnalytics` defined in Task 9, consumed in Tasks 10 and 11 with matching signatures.

**Placeholder scan:** No TBDs or vague steps found.
