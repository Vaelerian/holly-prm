# Scheduling Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core scheduling engine that assigns tasks to time slots based on importance, urgency, effort size, and role matching, with urgency auto-escalation, project importance modifiers, and verbose failure reporting.

**Architecture:** New scheduling dimension fields on Task and Project. A scheduling engine service with pure helper functions for effort resolution and effective importance calculation. Greedy forward-scan algorithm that processes tasks in priority order. Cron integration for auto-escalation. Results cached in Redis for dashboard display.

**Tech Stack:** Next.js 16, Prisma 7, PostgreSQL, Jest, Zod, Redis

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `lib/services/scheduling-engine.ts` | Core engine: scheduleTask, suggestDate, rescheduleAll, refreshUrgency |
| `lib/services/scheduling-helpers.ts` | Pure functions: resolveEffortMinutes, calculateEffectiveImportance, getSchedulingPrefs |
| `__tests__/services/scheduling-helpers.test.ts` | Tests for pure helper functions |
| `__tests__/services/scheduling-engine.test.ts` | Tests for engine operations |
| `app/api/v1/schedule/task/[id]/route.ts` | POST schedule single task |
| `app/api/v1/schedule/suggest/[id]/route.ts` | POST suggest date for task |
| `app/api/v1/schedule/reschedule/route.ts` | POST reschedule all |
| `app/api/v1/schedule/refresh-urgency/route.ts` | POST refresh urgency |

### Modified Files
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add scheduling enums, new fields on Task and Project, tasks relation on TimeSlot |
| `lib/validations/task.ts` | Add scheduling dimension fields |
| `lib/validations/project.ts` | Add projectImportance field |
| `lib/services/time-slots.ts` | Include assigned tasks in listTimeSlotsForRange |
| `app/api/v1/cron/notify/route.ts` | Add scheduling step |
| `lib/services/briefing.ts` | Read cached schedule alerts |
| `app/(dashboard)/settings/page.tsx` | Add scheduling preferences section |
| `components/tasks/add-task-form.tsx` | Add scheduling fields |
| `components/projects/project-form.tsx` | Add projectImportance dropdown |
| `app/(dashboard)/tasks/page.tsx` | Add scheduleState badges and Schedule All button |
| `app/(dashboard)/page.tsx` | Show schedule alerts |
| `components/calendar/calendar-view.tsx` | Show assigned tasks in slot blocks |

---

### Task 1: Prisma Schema - Scheduling Dimensions

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add scheduling enums**

Add after the existing ExceptionType enum:

```prisma
enum Importance {
  undefined_imp
  core
  step
  bonus
}

enum Urgency {
  undefined_urg
  dated
  asap
  soon
  sometime
}

enum EffortSize {
  undefined_size
  minutes
  hour
  half_day
  day
  project_size
  milestone
}

enum ScheduleState {
  unscheduled
  floating
  fixed
  waiting
  alert
}

enum ProjectImportance {
  more
  same
  less
}
```

- [ ] **Step 2: Add scheduling fields to Task model**

In the Task model, add after the existing `createdAt` field:

```prisma
  importance    Importance    @default(undefined_imp)
  urgency       Urgency       @default(undefined_urg)
  effortSize    EffortSize    @default(undefined_size)
  effortMinutes Int?
  scheduleState ScheduleState @default(unscheduled)
  timeSlotId    String?
  timeSlot      TimeSlot?     @relation(fields: [timeSlotId], references: [id], onDelete: SetNull)
```

- [ ] **Step 3: Add projectImportance to Project model**

In the Project model, add after the `notes` field:

```prisma
  projectImportance ProjectImportance @default(same)
```

- [ ] **Step 4: Add tasks relation to TimeSlot model**

In the TimeSlot model, add:

```prisma
  tasks Task[]
```

- [ ] **Step 5: Generate client and create migration**

```bash
npx prisma generate
npx prisma migrate dev --name scheduling_dimensions --create-only
```

- [ ] **Step 6: Commit**

```bash
git add prisma/ app/generated/
git commit -m "feat: add scheduling dimension enums and fields to Task/Project"
```

---

### Task 2: Validation Schema Updates

**Files:**
- Modify: `lib/validations/task.ts`
- Modify: `lib/validations/project.ts`

- [ ] **Step 1: Add scheduling fields to task validation**

In `lib/validations/task.ts`, add to CreateTaskSchema:

```typescript
importance: z.enum(["undefined_imp", "core", "step", "bonus"]).optional(),
urgency: z.enum(["undefined_urg", "dated", "asap", "soon", "sometime"]).optional(),
effortSize: z.enum(["undefined_size", "minutes", "hour", "half_day", "day", "project_size", "milestone"]).optional(),
effortMinutes: z.number().int().min(0).nullable().optional(),
```

Add the same fields to UpdateTaskSchema (they should already be included if UpdateTaskSchema is derived from CreateTaskSchema.partial(), but verify).

- [ ] **Step 2: Add projectImportance to project validation**

In `lib/validations/project.ts`, add to CreateProjectSchema:

```typescript
projectImportance: z.enum(["more", "same", "less"]).default("same"),
```

Ensure UpdateProjectSchema includes it as optional.

- [ ] **Step 3: Commit**

```bash
git add lib/validations/task.ts lib/validations/project.ts
git commit -m "feat: add scheduling dimension fields to task/project validation"
```

---

### Task 3: Scheduling Helper Functions with Tests

**Files:**
- Create: `lib/services/scheduling-helpers.ts`
- Create: `__tests__/services/scheduling-helpers.test.ts`

- [ ] **Step 1: Write helper function tests**

Create `__tests__/services/scheduling-helpers.test.ts`:

```typescript
import { resolveEffortMinutes, calculateEffectiveImportance, getDefaultSchedulingPrefs } from "@/lib/services/scheduling-helpers"

const defaultPrefs = getDefaultSchedulingPrefs()

describe("resolveEffortMinutes", () => {
  it("returns effortMinutes when set (override)", () => {
    const task = { effortMinutes: 45, effortSize: "hour" as const }
    expect(resolveEffortMinutes(task, defaultPrefs)).toBe(45)
  })

  it("maps effortSize through preferences", () => {
    const task = { effortMinutes: null, effortSize: "hour" as const }
    expect(resolveEffortMinutes(task, defaultPrefs)).toBe(90)
  })

  it("maps minutes size", () => {
    const task = { effortMinutes: null, effortSize: "minutes" as const }
    expect(resolveEffortMinutes(task, defaultPrefs)).toBe(20)
  })

  it("maps half_day size", () => {
    const task = { effortMinutes: null, effortSize: "half_day" as const }
    expect(resolveEffortMinutes(task, defaultPrefs)).toBe(240)
  })

  it("maps day size", () => {
    const task = { effortMinutes: null, effortSize: "day" as const }
    expect(resolveEffortMinutes(task, defaultPrefs)).toBe(480)
  })

  it("maps project_size to day * 2", () => {
    const task = { effortMinutes: null, effortSize: "project_size" as const }
    expect(resolveEffortMinutes(task, defaultPrefs)).toBe(960)
  })

  it("maps milestone to 0", () => {
    const task = { effortMinutes: null, effortSize: "milestone" as const }
    expect(resolveEffortMinutes(task, defaultPrefs)).toBe(0)
  })

  it("returns 0 when both undefined", () => {
    const task = { effortMinutes: null, effortSize: "undefined_size" as const }
    expect(resolveEffortMinutes(task, defaultPrefs)).toBe(0)
  })
})

describe("calculateEffectiveImportance", () => {
  it("returns task importance when no project modifier", () => {
    expect(calculateEffectiveImportance("step", null)).toBe("step")
    expect(calculateEffectiveImportance("step", "same")).toBe("step")
  })

  it("promotes with 'more': step becomes core", () => {
    expect(calculateEffectiveImportance("step", "more")).toBe("core")
  })

  it("promotes with 'more': bonus becomes step", () => {
    expect(calculateEffectiveImportance("bonus", "more")).toBe("step")
  })

  it("core cannot be promoted further", () => {
    expect(calculateEffectiveImportance("core", "more")).toBe("core")
  })

  it("demotes with 'less': core becomes step", () => {
    expect(calculateEffectiveImportance("core", "less")).toBe("step")
  })

  it("demotes with 'less': step becomes bonus", () => {
    expect(calculateEffectiveImportance("step", "less")).toBe("bonus")
  })

  it("bonus cannot be demoted further", () => {
    expect(calculateEffectiveImportance("bonus", "less")).toBe("bonus")
  })

  it("undefined_imp stays undefined regardless of modifier", () => {
    expect(calculateEffectiveImportance("undefined_imp", "more")).toBe("undefined_imp")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/scheduling-helpers.test.ts --no-coverage`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement helper functions**

Create `lib/services/scheduling-helpers.ts`:

```typescript
import { prisma } from "@/lib/db"

export interface SchedulingPrefs {
  asapDays: number
  soonDays: number
  sometimeDays: number
  scanAheadDays: number
  sizeMinutes: number
  sizeHour: number
  sizeHalfDay: number
  sizeDay: number
}

export function getDefaultSchedulingPrefs(): SchedulingPrefs {
  return {
    asapDays: 1,
    soonDays: 7,
    sometimeDays: 30,
    scanAheadDays: 30,
    sizeMinutes: 20,
    sizeHour: 90,
    sizeHalfDay: 240,
    sizeDay: 480,
  }
}

export async function getSchedulingPrefs(userId: string): Promise<SchedulingPrefs> {
  const pref = await prisma.userPreference.findFirst({ where: { userId } })
  const defaults = getDefaultSchedulingPrefs()
  if (!pref) return defaults
  const prefs = pref.prefs as Record<string, unknown>
  const sched = (prefs.scheduling ?? {}) as Record<string, unknown>
  return {
    asapDays: (sched.asapDays as number) ?? defaults.asapDays,
    soonDays: (sched.soonDays as number) ?? defaults.soonDays,
    sometimeDays: (sched.sometimeDays as number) ?? defaults.sometimeDays,
    scanAheadDays: (sched.scanAheadDays as number) ?? defaults.scanAheadDays,
    sizeMinutes: (sched.sizeMinutes as number) ?? defaults.sizeMinutes,
    sizeHour: (sched.sizeHour as number) ?? defaults.sizeHour,
    sizeHalfDay: (sched.sizeHalfDay as number) ?? defaults.sizeHalfDay,
    sizeDay: (sched.sizeDay as number) ?? defaults.sizeDay,
  }
}

type ImportanceValue = "undefined_imp" | "core" | "step" | "bonus"
type ProjectImportanceValue = "more" | "same" | "less" | null

export function resolveEffortMinutes(
  task: { effortMinutes: number | null; effortSize: string },
  prefs: SchedulingPrefs
): number {
  if (task.effortMinutes !== null && task.effortMinutes !== undefined) return task.effortMinutes

  const sizeMap: Record<string, number> = {
    minutes: prefs.sizeMinutes,
    hour: prefs.sizeHour,
    half_day: prefs.sizeHalfDay,
    day: prefs.sizeDay,
    project_size: prefs.sizeDay * 2,
    milestone: 0,
    undefined_size: 0,
  }
  return sizeMap[task.effortSize] ?? 0
}

export function calculateEffectiveImportance(
  importance: ImportanceValue,
  projectImportance: ProjectImportanceValue
): ImportanceValue {
  if (importance === "undefined_imp") return "undefined_imp"
  if (!projectImportance || projectImportance === "same") return importance

  const levels: ImportanceValue[] = ["core", "step", "bonus"]
  const idx = levels.indexOf(importance)
  if (idx === -1) return importance

  if (projectImportance === "more") {
    return idx === 0 ? "core" : levels[idx - 1]
  }
  if (projectImportance === "less") {
    return idx === levels.length - 1 ? "bonus" : levels[idx + 1]
  }
  return importance
}

export function importanceToSortOrder(importance: ImportanceValue): number {
  const map: Record<ImportanceValue, number> = { undefined_imp: 99, core: 1, step: 2, bonus: 3 }
  return map[importance] ?? 99
}

export function urgencyToSortOrder(urgency: string): number {
  const map: Record<string, number> = { undefined_urg: 99, dated: 1, asap: 2, soon: 3, sometime: 4 }
  return map[urgency] ?? 99
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/services/scheduling-helpers.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/scheduling-helpers.ts __tests__/services/scheduling-helpers.test.ts
git commit -m "feat: scheduling helper functions with tests"
```

---

### Task 4: Scheduling Engine Service with Tests

**Files:**
- Create: `lib/services/scheduling-engine.ts`
- Create: `__tests__/services/scheduling-engine.test.ts`

- [ ] **Step 1: Write engine tests**

Create `__tests__/services/scheduling-engine.test.ts`:

```typescript
import { scheduleTask, suggestDate, rescheduleAll, refreshUrgency } from "@/lib/services/scheduling-engine"
import { prisma } from "@/lib/db"
import * as timeSlotService from "@/lib/services/time-slots"
import * as helpers from "@/lib/services/scheduling-helpers"

jest.mock("@/lib/db", () => ({
  prisma: {
    task: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
    timeSlot: { create: jest.fn(), update: jest.fn() },
    userPreference: { findFirst: jest.fn() },
  },
}))

jest.mock("@/lib/services/time-slots", () => ({
  listTimeSlotsForRange: jest.fn(),
}))

jest.mock("@/lib/services/scheduling-helpers", () => ({
  ...jest.requireActual("@/lib/services/scheduling-helpers"),
  getSchedulingPrefs: jest.fn(() => ({
    asapDays: 1, soonDays: 7, sometimeDays: 30, scanAheadDays: 30,
    sizeMinutes: 20, sizeHour: 90, sizeHalfDay: 240, sizeDay: 480,
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockTimeSlots = timeSlotService as jest.Mocked<typeof timeSlotService>

beforeEach(() => jest.clearAllMocks())

describe("scheduleTask", () => {
  const makeTask = (overrides = {}) => ({
    id: "t1", title: "Test task", roleId: "r1", goalId: "g1",
    importance: "step", urgency: "soon", effortSize: "hour", effortMinutes: null,
    status: "todo", scheduleState: "unscheduled", timeSlotId: null,
    project: null,
    role: { id: "r1", name: "Work", colour: "#FF0000" },
    ...overrides,
  })

  it("assigns task to first slot with capacity", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(makeTask() as any)
    mockTimeSlots.listTimeSlotsForRange.mockResolvedValue([
      { id: "ts1", roleId: "r1", date: "2026-04-20", startMinutes: 540, endMinutes: 720,
        capacityMinutes: 180, usedMinutes: 100, taskCount: 1, title: "Work", isVirtual: false, repeatPatternId: null },
    ])
    mockPrisma.task.update.mockResolvedValue({} as any)
    mockPrisma.timeSlot.update.mockResolvedValue({} as any)

    const result = await scheduleTask("t1", "u1")
    expect(result.task.status).toBe("scheduled")
    expect(mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: expect.objectContaining({ timeSlotId: "ts1", scheduleState: "floating" }),
    })
  })

  it("returns alert when no slot has capacity", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(makeTask() as any)
    mockTimeSlots.listTimeSlotsForRange.mockResolvedValue([
      { id: "ts1", roleId: "r1", date: "2026-04-20", startMinutes: 540, endMinutes: 720,
        capacityMinutes: 180, usedMinutes: 180, taskCount: 2, title: "Work", isVirtual: false, repeatPatternId: null },
    ])

    const result = await scheduleTask("t1", "u1")
    expect(result.task.status).toBe("alert")
    expect(result.task.reason).toContain("Work")
  })

  it("sets scheduleState to fixed for core importance", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(makeTask({ importance: "core" }) as any)
    mockTimeSlots.listTimeSlotsForRange.mockResolvedValue([
      { id: "ts1", roleId: "r1", date: "2026-04-20", startMinutes: 540, endMinutes: 720,
        capacityMinutes: 180, usedMinutes: 0, taskCount: 0, title: "Work", isVirtual: false, repeatPatternId: null },
    ])
    mockPrisma.task.update.mockResolvedValue({} as any)
    mockPrisma.timeSlot.update.mockResolvedValue({} as any)

    const result = await scheduleTask("t1", "u1")
    expect(mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: expect.objectContaining({ scheduleState: "fixed" }),
    })
  })

  it("materialises virtual slot before assigning", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(makeTask() as any)
    mockTimeSlots.listTimeSlotsForRange.mockResolvedValue([
      { id: "rp:rp1:2026-04-20", roleId: "r1", date: "2026-04-20", startMinutes: 540, endMinutes: 720,
        capacityMinutes: 180, usedMinutes: 0, taskCount: 0, title: "Work", isVirtual: true, repeatPatternId: "rp1" },
    ])
    mockPrisma.timeSlot.create.mockResolvedValue({ id: "ts-new" } as any)
    mockPrisma.task.update.mockResolvedValue({} as any)
    mockPrisma.timeSlot.update.mockResolvedValue({} as any)

    const result = await scheduleTask("t1", "u1")
    expect(mockPrisma.timeSlot.create).toHaveBeenCalled()
    expect(result.task.status).toBe("scheduled")
  })

  it("skips unschedulable tasks (undefined importance)", async () => {
    mockPrisma.task.findFirst.mockResolvedValue(makeTask({ importance: "undefined_imp" }) as any)
    const result = await scheduleTask("t1", "u1")
    expect(result.task.status).toBe("alert")
    expect(result.task.reason).toContain("not schedulable")
  })
})

describe("suggestDate", () => {
  it("returns suggestion without modifying data", async () => {
    mockPrisma.task.findFirst.mockResolvedValue({
      id: "t1", title: "Task", roleId: "r1", importance: "step", urgency: "soon",
      effortSize: "hour", effortMinutes: null, status: "todo", project: null,
      role: { id: "r1", name: "Work" },
    } as any)
    mockTimeSlots.listTimeSlotsForRange.mockResolvedValue([
      { id: "ts1", roleId: "r1", date: "2026-04-20", startMinutes: 540, endMinutes: 720,
        capacityMinutes: 180, usedMinutes: 0, taskCount: 0, title: "Work", isVirtual: false, repeatPatternId: null },
    ])

    const result = await suggestDate("t1", "u1")
    expect(result.found).toBe(true)
    expect(result.date).toBe("2026-04-20")
    expect(mockPrisma.task.update).not.toHaveBeenCalled()
  })
})

describe("refreshUrgency", () => {
  it("escalates sometime to asap when within asapDays", async () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    mockPrisma.task.findMany.mockResolvedValue([
      { id: "t1", urgency: "sometime", dueDate: tomorrow },
    ] as any)
    mockPrisma.task.update.mockResolvedValue({} as any)

    const count = await refreshUrgency("u1")
    expect(count).toBe(1)
    expect(mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { urgency: "asap" },
    })
  })

  it("does not demote urgency", async () => {
    const farFuture = new Date()
    farFuture.setDate(farFuture.getDate() + 90)
    mockPrisma.task.findMany.mockResolvedValue([
      { id: "t1", urgency: "asap", dueDate: farFuture },
    ] as any)

    const count = await refreshUrgency("u1")
    expect(count).toBe(0)
    expect(mockPrisma.task.update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/scheduling-engine.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement scheduling engine**

Create `lib/services/scheduling-engine.ts`:

```typescript
import { prisma } from "@/lib/db"
import { listTimeSlotsForRange, type ResolvedTimeSlot } from "@/lib/services/time-slots"
import {
  getSchedulingPrefs,
  resolveEffortMinutes,
  calculateEffectiveImportance,
  importanceToSortOrder,
  urgencyToSortOrder,
  type SchedulingPrefs,
} from "@/lib/services/scheduling-helpers"

export interface TaskResult {
  taskId: string
  title: string
  status: "scheduled" | "alert"
  slotDate?: string
  slotId?: string
  reason?: string
}

export interface ScheduleResult {
  task: TaskResult
}

export interface SuggestionResult {
  found: boolean
  date?: string
  slotId?: string
  slotTitle?: string
  reason?: string
}

export interface RescheduleResult {
  scheduled: TaskResult[]
  alerts: TaskResult[]
  urgencyEscalated: number
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function getDateRange(urgency: string, dueDate: Date | null, prefs: SchedulingPrefs): [Date, Date] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  switch (urgency) {
    case "asap": return [today, addDays(today, prefs.asapDays)]
    case "soon": return [today, addDays(today, prefs.soonDays)]
    case "sometime": return [today, addDays(today, prefs.sometimeDays)]
    case "dated": return [today, dueDate ?? addDays(today, prefs.scanAheadDays)]
    default: return [today, addDays(today, prefs.scanAheadDays)]
  }
}

async function findSlotForTask(
  roleId: string,
  effortMinutes: number,
  userId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<ResolvedTimeSlot | null> {
  const slots = await listTimeSlotsForRange(userId, rangeStart, rangeEnd)
  const roleSlots = slots.filter(s => s.roleId === roleId)

  for (const slot of roleSlots) {
    const available = slot.capacityMinutes - slot.usedMinutes
    if (available >= effortMinutes || effortMinutes === 0) {
      return slot
    }
  }
  return null
}

async function materialiseSlot(slot: ResolvedTimeSlot, userId: string): Promise<string> {
  const concrete = await prisma.timeSlot.create({
    data: {
      roleId: slot.roleId,
      date: new Date(slot.date),
      startMinutes: slot.startMinutes,
      endMinutes: slot.endMinutes,
      capacityMinutes: slot.capacityMinutes,
      usedMinutes: slot.usedMinutes,
      taskCount: slot.taskCount,
      title: slot.title,
      repeatPatternId: slot.repeatPatternId,
      userId,
    },
  })
  return concrete.id
}

async function assignTaskToSlot(
  taskId: string,
  slotId: string,
  effortMinutes: number,
  importance: string
): Promise<void> {
  const scheduleState = importance === "core" ? "fixed" : "floating"
  await prisma.task.update({
    where: { id: taskId },
    data: { timeSlotId: slotId, scheduleState },
  })
  await prisma.timeSlot.update({
    where: { id: slotId },
    data: {
      usedMinutes: { increment: effortMinutes },
      taskCount: { increment: 1 },
    },
  })
}

export async function scheduleTask(taskId: string, userId: string): Promise<ScheduleResult> {
  const task = await prisma.task.findFirst({
    where: { id: taskId },
    include: {
      project: { select: { projectImportance: true } },
      role: { select: { id: true, name: true } },
    },
  })
  if (!task) return { task: { taskId, title: "Unknown", status: "alert", reason: "Task not found" } }

  if (task.importance === "undefined_imp") {
    return { task: { taskId, title: task.title, status: "alert", reason: "Task importance is not set - not schedulable. Set importance to Core, Step, or Bonus." } }
  }
  if (task.status === "done" || task.status === "cancelled") {
    return { task: { taskId, title: task.title, status: "alert", reason: "Task is already completed or cancelled." } }
  }

  const prefs = await getSchedulingPrefs(userId)
  const effectiveImp = calculateEffectiveImportance(
    task.importance as any,
    (task.project?.projectImportance as any) ?? null
  )
  const effortMins = resolveEffortMinutes(
    { effortMinutes: task.effortMinutes, effortSize: task.effortSize },
    prefs
  )
  const [rangeStart, rangeEnd] = getDateRange(task.urgency, task.dueDate, prefs)

  const slot = await findSlotForTask(task.roleId, effortMins, userId, rangeStart, rangeEnd)

  if (!slot) {
    await prisma.task.update({ where: { id: taskId }, data: { scheduleState: "alert" } })
    const roleName = task.role?.name ?? "Unknown"
    return {
      task: {
        taskId,
        title: task.title,
        status: "alert",
        reason: `No ${roleName} time slots with ${effortMins}+ minutes available between ${rangeStart.toISOString().slice(0, 10)} and ${rangeEnd.toISOString().slice(0, 10)}. Create a ${roleName} time slot or extend the scan range in scheduling preferences.`,
      },
    }
  }

  let concreteSlotId = slot.id
  if (slot.isVirtual) {
    concreteSlotId = await materialiseSlot(slot, userId)
  }

  await assignTaskToSlot(taskId, concreteSlotId, effortMins, effectiveImp)

  return {
    task: {
      taskId,
      title: task.title,
      status: "scheduled",
      slotDate: slot.date,
      slotId: concreteSlotId,
    },
  }
}

export async function suggestDate(taskId: string, userId: string): Promise<SuggestionResult> {
  const task = await prisma.task.findFirst({
    where: { id: taskId },
    include: {
      project: { select: { projectImportance: true } },
      role: { select: { id: true, name: true } },
    },
  })
  if (!task) return { found: false, reason: "Task not found" }

  if (task.importance === "undefined_imp") {
    return { found: false, reason: "Task importance is not set. Set importance to Core, Step, or Bonus." }
  }

  const prefs = await getSchedulingPrefs(userId)
  const effortMins = resolveEffortMinutes(
    { effortMinutes: task.effortMinutes, effortSize: task.effortSize },
    prefs
  )
  const [rangeStart, rangeEnd] = getDateRange(task.urgency, task.dueDate, prefs)
  const slot = await findSlotForTask(task.roleId, effortMins, userId, rangeStart, rangeEnd)

  if (!slot) {
    const roleName = task.role?.name ?? "Unknown"
    return { found: false, reason: `No ${roleName} time slots with ${effortMins}+ minutes available between ${rangeStart.toISOString().slice(0, 10)} and ${rangeEnd.toISOString().slice(0, 10)}.` }
  }

  return { found: true, date: slot.date, slotId: slot.id, slotTitle: slot.title }
}

export async function rescheduleAll(userId: string): Promise<RescheduleResult> {
  const prefs = await getSchedulingPrefs(userId)
  const urgencyEscalated = await refreshUrgency(userId)

  // Get all schedulable tasks
  const tasks = await prisma.task.findMany({
    where: {
      role: { userId },
      importance: { not: "undefined_imp" },
      status: { in: ["todo", "in_progress"] },
    },
    include: {
      project: { select: { projectImportance: true } },
      role: { select: { id: true, name: true } },
    },
  })

  // Sort by priority
  const sorted = tasks.sort((a, b) => {
    // Role grouping
    if (a.roleId !== b.roleId) return a.roleId.localeCompare(b.roleId)
    // Effective importance
    const aImp = importanceToSortOrder(calculateEffectiveImportance(a.importance as any, (a.project?.projectImportance as any) ?? null))
    const bImp = importanceToSortOrder(calculateEffectiveImportance(b.importance as any, (b.project?.projectImportance as any) ?? null))
    if (aImp !== bImp) return aImp - bImp
    // Urgency
    const aUrg = urgencyToSortOrder(a.urgency)
    const bUrg = urgencyToSortOrder(b.urgency)
    if (aUrg !== bUrg) return aUrg - bUrg
    // Effort (smallest first)
    const aEff = resolveEffortMinutes({ effortMinutes: a.effortMinutes, effortSize: a.effortSize }, prefs)
    const bEff = resolveEffortMinutes({ effortMinutes: b.effortMinutes, effortSize: b.effortSize }, prefs)
    return aEff - bEff
  })

  // Unassign all currently scheduled tasks
  for (const task of sorted) {
    if (task.timeSlotId) {
      const effortMins = resolveEffortMinutes({ effortMinutes: task.effortMinutes, effortSize: task.effortSize }, prefs)
      await prisma.timeSlot.update({
        where: { id: task.timeSlotId },
        data: {
          usedMinutes: { decrement: effortMins },
          taskCount: { decrement: 1 },
        },
      })
      await prisma.task.update({
        where: { id: task.id },
        data: { timeSlotId: null, scheduleState: "unscheduled" },
      })
    }
  }

  // Reschedule each task
  const scheduled: TaskResult[] = []
  const alerts: TaskResult[] = []

  for (const task of sorted) {
    const effectiveImp = calculateEffectiveImportance(task.importance as any, (task.project?.projectImportance as any) ?? null)
    const effortMins = resolveEffortMinutes({ effortMinutes: task.effortMinutes, effortSize: task.effortSize }, prefs)
    const [rangeStart, rangeEnd] = getDateRange(task.urgency, task.dueDate, prefs)

    const slot = await findSlotForTask(task.roleId, effortMins, userId, rangeStart, rangeEnd)

    if (slot) {
      let concreteSlotId = slot.id
      if (slot.isVirtual) {
        concreteSlotId = await materialiseSlot(slot, userId)
      }
      await assignTaskToSlot(task.id, concreteSlotId, effortMins, effectiveImp)
      scheduled.push({ taskId: task.id, title: task.title, status: "scheduled", slotDate: slot.date, slotId: concreteSlotId })
    } else {
      await prisma.task.update({ where: { id: task.id }, data: { scheduleState: "alert" } })
      const roleName = task.role?.name ?? "Unknown"
      alerts.push({
        taskId: task.id, title: task.title, status: "alert",
        reason: `No ${roleName} time slots with ${effortMins}+ minutes available between ${rangeStart.toISOString().slice(0, 10)} and ${rangeEnd.toISOString().slice(0, 10)}.`,
      })
    }
  }

  return { scheduled, alerts, urgencyEscalated }
}

export async function refreshUrgency(userId: string): Promise<number> {
  const prefs = await getSchedulingPrefs(userId)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tasks = await prisma.task.findMany({
    where: {
      role: { userId },
      urgency: { notIn: ["dated", "undefined_urg"] },
      dueDate: { not: null },
      status: { in: ["todo", "in_progress"] },
    },
    select: { id: true, urgency: true, dueDate: true },
  })

  let escalated = 0

  for (const task of tasks) {
    const daysUntilDue = Math.ceil((task.dueDate!.getTime() - today.getTime()) / 86400000)
    let newUrgency: string | null = null

    if (daysUntilDue <= prefs.asapDays && task.urgency !== "asap") {
      newUrgency = "asap"
    } else if (daysUntilDue <= prefs.soonDays && task.urgency !== "asap" && task.urgency !== "soon") {
      newUrgency = "soon"
    }

    if (newUrgency) {
      await prisma.task.update({ where: { id: task.id }, data: { urgency: newUrgency as any } })
      escalated++
    }
  }

  return escalated
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/services/scheduling-engine.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/scheduling-engine.ts __tests__/services/scheduling-engine.test.ts
git commit -m "feat: scheduling engine with task assignment, reschedule, and urgency refresh"
```

---

### Task 5: API Routes for Scheduling

**Files:**
- Create: `app/api/v1/schedule/task/[id]/route.ts`
- Create: `app/api/v1/schedule/suggest/[id]/route.ts`
- Create: `app/api/v1/schedule/reschedule/route.ts`
- Create: `app/api/v1/schedule/refresh-urgency/route.ts`

- [ ] **Step 1: Create all four route files**

All follow the same pattern: auth check, call engine function, return JSON. No request body needed (task ID from params, userId from session).

`app/api/v1/schedule/task/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { scheduleTask } from "@/lib/services/scheduling-engine"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const result = await scheduleTask(id, session.userId)
  return NextResponse.json(result)
}
```

`app/api/v1/schedule/suggest/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { suggestDate } from "@/lib/services/scheduling-engine"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const result = await suggestDate(id, session.userId)
  return NextResponse.json(result)
}
```

`app/api/v1/schedule/reschedule/route.ts`:
```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { rescheduleAll } from "@/lib/services/scheduling-engine"

export async function POST() {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const result = await rescheduleAll(session.userId)
  return NextResponse.json(result)
}
```

`app/api/v1/schedule/refresh-urgency/route.ts`:
```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { refreshUrgency } from "@/lib/services/scheduling-engine"

export async function POST() {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const escalated = await refreshUrgency(session.userId)
  return NextResponse.json({ escalated })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/v1/schedule/
git commit -m "feat: API routes for scheduling engine operations"
```

---

### Task 6: Cron Integration and Dashboard Alerts

**Files:**
- Modify: `app/api/v1/cron/notify/route.ts`
- Modify: `lib/services/briefing.ts`
- Modify: `app/(dashboard)/page.tsx`

- [ ] **Step 1: Add scheduling step to cron**

In `app/api/v1/cron/notify/route.ts`, after the vault sync block (around line 69), add:

```typescript
import { refreshUrgency, rescheduleAll } from "@/lib/services/scheduling-engine"

// 4. Scheduling: refresh urgency and reschedule if needed
try {
  const escalated = await refreshUrgency(userId)
  const needsReschedule = await prisma.task.count({
    where: {
      role: { userId },
      scheduleState: { in: ["unscheduled", "alert"] },
      importance: { not: "undefined_imp" },
      status: { in: ["todo", "in_progress"] },
    },
  })
  if (needsReschedule > 0 || escalated > 0) {
    const result = await rescheduleAll(userId)
    await redis.set("schedule:results:latest", JSON.stringify(result), "EX", 7200)
  }
} catch (e) {
  console.error("[cron/notify] scheduling failed", e)
}
```

Note: this needs the userId. The cron route currently iterates users for Gmail polling. The scheduling step needs to run per-user similarly. Check how the cron currently gets userId and follow the same pattern.

- [ ] **Step 2: Add schedule alerts to briefing**

In `lib/services/briefing.ts`, add after the existing vaultUpdates block:

```typescript
let scheduleAlerts: unknown[] = []
try {
  const cached = await redis.get("schedule:results:latest")
  if (cached) {
    const parsed = JSON.parse(cached)
    scheduleAlerts = parsed.alerts ?? []
  }
} catch {
  // proceed with empty
}
```

Add `scheduleAlerts` to the return object.

- [ ] **Step 3: Show alerts on dashboard**

In `app/(dashboard)/page.tsx`, add a "Scheduling alerts" section after the existing sections:

```tsx
{data.scheduleAlerts && (data.scheduleAlerts as any[]).length > 0 && (
  <section>
    <h2 className="text-xs font-semibold text-[#ff4444] uppercase tracking-wide mb-3">Scheduling alerts</h2>
    <div className="space-y-2">
      {(data.scheduleAlerts as any[]).map((alert: any) => (
        <div key={alert.taskId} className="bg-[#111125] border border-[rgba(255,68,68,0.2)] rounded-lg px-4 py-2.5">
          <p className="text-sm font-medium text-[#c0c0d0]">{alert.title}</p>
          <p className="text-xs text-[#666688] mt-0.5">{alert.reason}</p>
        </div>
      ))}
    </div>
  </section>
)}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/cron/notify/route.ts lib/services/briefing.ts "app/(dashboard)/page.tsx"
git commit -m "feat: cron scheduling integration and dashboard alerts"
```

---

### Task 7: UI - Task and Project Form Updates

**Files:**
- Modify: `components/tasks/add-task-form.tsx`
- Modify: `components/projects/project-form.tsx`
- Modify: `app/(dashboard)/tasks/page.tsx`

- [ ] **Step 1: Add scheduling fields to task form**

In `components/tasks/add-task-form.tsx`, add a collapsible "Scheduling" section below the existing fields. The section contains:
- Importance dropdown: select with options Undefined/Core/Step/Bonus
- Urgency dropdown: select with options Undefined/Dated/ASAP/Soon/Sometime
- Effort dropdown: select with options Undefined/Minutes/Hour/Half Day/Day/Project/Milestone
- Custom minutes input: shown when a "Custom" link is clicked, number input

Include these in the POST body when creating a task.

- [ ] **Step 2: Add projectImportance to project form**

In `components/projects/project-form.tsx`, add a "Scheduling priority" dropdown after the existing priority field:
- Options: Same (default) / More Important / Less Important
- Register as `projectImportance` in the form
- Include in the submit body

- [ ] **Step 3: Add schedule state badges and Schedule All button to tasks page**

In `app/(dashboard)/tasks/page.tsx`:
- On each task row, show a coloured dot for scheduleState: green=floating, blue=fixed, red=alert, grey=unscheduled. Only show if importance is not undefined_imp.
- Add a "Schedule All" button in the page header (client component). On click, calls `POST /api/v1/schedule/reschedule`, shows loading, then shows results summary.

- [ ] **Step 4: Commit**

```bash
git add components/tasks/add-task-form.tsx components/projects/project-form.tsx "app/(dashboard)/tasks/page.tsx"
git commit -m "feat: scheduling fields in task/project forms, schedule all button"
```

---

### Task 8: Settings UI and Calendar Week View Updates

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`
- Modify: `components/calendar/calendar-view.tsx`
- Modify: `lib/services/time-slots.ts`

- [ ] **Step 1: Add scheduling preferences to settings**

In `app/(dashboard)/settings/page.tsx`, add a "Scheduling" section with number inputs for:
- ASAP days, Soon days, Sometime days, Scan ahead days
- Size mappings: Minutes, Hour, Half Day, Day

Load from existing UserPreference.prefs.scheduling on mount. Save via PUT to `/api/v1/preferences` (if that endpoint exists) or directly to the user preferences endpoint.

- [ ] **Step 2: Include assigned tasks in time slot query**

In `lib/services/time-slots.ts`, update `listTimeSlotsForRange` to include assigned tasks in concrete slots:

```typescript
const concreteSlots = await prisma.timeSlot.findMany({
  where: { userId, date: { gte: startDate, lte: endDate } },
  include: {
    role: { select: { id: true, name: true, colour: true } },
    tasks: { select: { id: true, title: true, effortSize: true, effortMinutes: true, scheduleState: true } },
  },
  orderBy: [{ date: "asc" }, { startMinutes: "asc" }],
})
```

Add `assignedTasks` to the ResolvedTimeSlot type and populate it from the query result.

- [ ] **Step 3: Show assigned tasks in calendar slot blocks**

In `components/calendar/calendar-view.tsx`, inside the WeekView time slot blocks, after the capacity bar, list assigned tasks:

```tsx
{slot.assignedTasks?.map(task => (
  <div key={task.id} className="text-[10px] text-[#c0c0d0] truncate mt-0.5">
    {task.title}
  </div>
))}
```

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/settings/page.tsx" lib/services/time-slots.ts components/calendar/calendar-view.tsx
git commit -m "feat: scheduling preferences UI, assigned tasks in calendar slots"
```

---

### Task 9: Full Test Suite and Push

**Files:** None new

- [ ] **Step 1: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Push all commits**

Run: `git push`
