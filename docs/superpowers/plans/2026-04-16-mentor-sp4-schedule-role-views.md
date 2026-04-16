# Schedule and Role Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the Tasks page with a "By Schedule" view mode, per-task scheduling actions, float display, and click-through navigation between tasks and calendar.

**Architecture:** Primarily UI changes to the existing Tasks page and calendar components. One helper function addition (calculateFloat) and one service parameter addition (includeSlot on listTasks). A minor engine fix to handle rescheduling already-assigned tasks.

**Tech Stack:** Next.js 16, React, TypeScript, Jest

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `components/tasks/task-schedule-button.tsx` | Per-task schedule/retry/reschedule action button |
| `components/tasks/float-badge.tsx` | Colour-coded float indicator component |

### Modified Files
| File | Change |
|------|--------|
| `lib/services/scheduling-helpers.ts` | Add calculateFloat function |
| `__tests__/services/scheduling-helpers.test.ts` | Add calculateFloat tests |
| `lib/services/tasks.ts` | Add includeSlot param to listTasks |
| `lib/services/scheduling-engine.ts` | Handle rescheduling already-assigned tasks in scheduleTask |
| `app/(dashboard)/tasks/page.tsx` | Add view toggle, "By Schedule" layout, integrate new components |
| `components/tasks/task-row.tsx` | Add float badge, schedule button, slot info display |
| `components/calendar/calendar-view.tsx` | Make task names in slot blocks clickable |

---

### Task 1: calculateFloat Helper with Tests

**Files:**
- Modify: `lib/services/scheduling-helpers.ts`
- Modify: `__tests__/services/scheduling-helpers.test.ts`

- [ ] **Step 1: Add calculateFloat tests**

Add to `__tests__/services/scheduling-helpers.test.ts`:

```typescript
import { calculateFloat } from "@/lib/services/scheduling-helpers"

describe("calculateFloat", () => {
  it("returns green for 5+ days float", () => {
    const slot = new Date("2026-04-20")
    const due = new Date("2026-04-25")
    const result = calculateFloat(slot, due)
    expect(result.days).toBe(5)
    expect(result.colour).toBe("green")
    expect(result.label).toBe("Float: 5 days")
  })

  it("returns green for 3 days float", () => {
    const result = calculateFloat(new Date("2026-04-20"), new Date("2026-04-23"))
    expect(result.days).toBe(3)
    expect(result.colour).toBe("green")
  })

  it("returns amber for 2 days float", () => {
    const result = calculateFloat(new Date("2026-04-20"), new Date("2026-04-22"))
    expect(result.days).toBe(2)
    expect(result.colour).toBe("amber")
    expect(result.label).toBe("Float: 2 days")
  })

  it("returns amber for 1 day float with singular", () => {
    const result = calculateFloat(new Date("2026-04-20"), new Date("2026-04-21"))
    expect(result.days).toBe(1)
    expect(result.colour).toBe("amber")
    expect(result.label).toBe("Float: 1 day")
  })

  it("returns amber for 0 days (due today)", () => {
    const result = calculateFloat(new Date("2026-04-20"), new Date("2026-04-20"))
    expect(result.days).toBe(0)
    expect(result.colour).toBe("amber")
    expect(result.label).toBe("Due today")
  })

  it("returns red for negative float (overdue)", () => {
    const result = calculateFloat(new Date("2026-04-25"), new Date("2026-04-22"))
    expect(result.days).toBe(-3)
    expect(result.colour).toBe("red")
    expect(result.label).toBe("Overdue by 3 days")
  })

  it("returns null when slotDate is null", () => {
    expect(calculateFloat(null, new Date("2026-04-22"))).toBeNull()
  })

  it("returns null when dueDate is null", () => {
    expect(calculateFloat(new Date("2026-04-20"), null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/scheduling-helpers.test.ts --no-coverage`
Expected: FAIL (calculateFloat not found)

- [ ] **Step 3: Implement calculateFloat**

Add to `lib/services/scheduling-helpers.ts`:

```typescript
export interface FloatResult {
  days: number
  label: string
  colour: "green" | "amber" | "red"
}

export function calculateFloat(slotDate: Date | null, dueDate: Date | null): FloatResult | null {
  if (!slotDate || !dueDate) return null

  const days = Math.ceil((dueDate.getTime() - slotDate.getTime()) / 86400000)

  if (days < 0) {
    return { days, label: `Overdue by ${Math.abs(days)} days`, colour: "red" }
  }
  if (days === 0) {
    return { days, label: "Due today", colour: "amber" }
  }
  if (days <= 2) {
    return { days, label: `Float: ${days} day${days === 1 ? "" : "s"}`, colour: "amber" }
  }
  return { days, label: `Float: ${days} days`, colour: "green" }
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/services/scheduling-helpers.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/scheduling-helpers.ts __tests__/services/scheduling-helpers.test.ts
git commit -m "feat: calculateFloat helper with tests for schedule slack display"
```

---

### Task 2: Engine Fix - Handle Rescheduling Already-Assigned Tasks

**Files:**
- Modify: `lib/services/scheduling-engine.ts`

- [ ] **Step 1: Update scheduleTask to unassign before reassigning**

In `lib/services/scheduling-engine.ts`, in the `scheduleTask` function, after loading the task and before finding a slot, add unassignment logic:

```typescript
// If task is already assigned to a slot, unassign first
if (task.timeSlotId) {
  const effortMins = resolveEffortMinutes(
    { effortMinutes: task.effortMinutes, effortSize: task.effortSize },
    prefs
  )
  await prisma.timeSlot.update({
    where: { id: task.timeSlotId },
    data: {
      usedMinutes: { decrement: effortMins },
      taskCount: { decrement: 1 },
    },
  })
  await prisma.task.update({
    where: { id: taskId },
    data: { timeSlotId: null, scheduleState: "unscheduled" },
  })
}
```

This goes after the prefs are loaded (since we need resolveEffortMinutes) and before the `findSlotForTask` call.

- [ ] **Step 2: Run existing tests**

Run: `npx jest __tests__/services/scheduling-engine.test.ts --no-coverage`
Expected: PASS (existing tests should still pass)

- [ ] **Step 3: Commit**

```bash
git add lib/services/scheduling-engine.ts
git commit -m "fix: unassign task from current slot before rescheduling"
```

---

### Task 3: listTasks - includeSlot Parameter

**Files:**
- Modify: `lib/services/tasks.ts`

- [ ] **Step 1: Add includeSlot option to listTasks**

In `lib/services/tasks.ts`, add `includeSlot?: boolean` to the `ListTasksOptions` interface.

In the `listTasks` function, conditionally include the timeSlot relation in the query:

```typescript
const include: Record<string, unknown> = {
  project: { select: { id: true, title: true } },
  goal: { select: { id: true, name: true } },
  role: { select: { id: true, name: true, colour: true } },
}

if (opts.includeSlot) {
  include.timeSlot = {
    select: { id: true, date: true, startMinutes: true, endMinutes: true, title: true },
  }
}

return prisma.task.findMany({
  where,
  orderBy: { createdAt: "asc" },
  include,
})
```

- [ ] **Step 2: Commit**

```bash
git add lib/services/tasks.ts
git commit -m "feat: add includeSlot option to listTasks for schedule view"
```

---

### Task 4: FloatBadge and TaskScheduleButton Components

**Files:**
- Create: `components/tasks/float-badge.tsx`
- Create: `components/tasks/task-schedule-button.tsx`

- [ ] **Step 1: Create FloatBadge component**

Create `components/tasks/float-badge.tsx`:

```tsx
"use client"

interface FloatBadgeProps {
  slotDate: string | null  // ISO date from timeSlot.date
  dueDate: string | null   // ISO date from task.dueDate
}

const FLOAT_COLOURS = {
  green: "text-[#00ff88]",
  amber: "text-[#ffaa00]",
  red: "text-[#ff4444]",
}

export function FloatBadge({ slotDate, dueDate }: FloatBadgeProps) {
  if (!slotDate || !dueDate) return null

  const slot = new Date(slotDate)
  const due = new Date(dueDate)
  const days = Math.ceil((due.getTime() - slot.getTime()) / 86400000)

  let label: string
  let colour: "green" | "amber" | "red"

  if (days < 0) {
    label = `Overdue by ${Math.abs(days)}d`
    colour = "red"
  } else if (days === 0) {
    label = "Due today"
    colour = "amber"
  } else if (days <= 2) {
    label = `Float: ${days}d`
    colour = "amber"
  } else {
    label = `Float: ${days}d`
    colour = "green"
  }

  return <span className={`text-[10px] font-medium ${FLOAT_COLOURS[colour]}`}>{label}</span>
}
```

- [ ] **Step 2: Create TaskScheduleButton component**

Create `components/tasks/task-schedule-button.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface TaskScheduleButtonProps {
  taskId: string
  importance: string
  scheduleState: string
}

export function TaskScheduleButton({ taskId, importance, scheduleState }: TaskScheduleButtonProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ status: string; reason?: string } | null>(null)
  const router = useRouter()

  // Don't show for tasks not participating in scheduling
  if (importance === "undefined_imp") return null

  async function handleSchedule() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/v1/schedule/task/${taskId}`, { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        setResult({ status: data.task.status, reason: data.task.reason })
        router.refresh()
      }
    } catch {
      setResult({ status: "alert", reason: "Request failed" })
    } finally {
      setLoading(false)
    }
  }

  let buttonLabel: string
  let buttonTitle: string
  if (scheduleState === "alert") {
    buttonLabel = "retry"
    buttonTitle = "Retry scheduling"
  } else if (scheduleState === "floating" || scheduleState === "fixed") {
    buttonLabel = "resched"
    buttonTitle = "Reschedule to a different slot"
  } else {
    buttonLabel = "sched"
    buttonTitle = "Schedule this task"
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={handleSchedule}
        disabled={loading}
        title={buttonTitle}
        className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(0,255,136,0.1)] text-[#00ff88] hover:bg-[rgba(0,255,136,0.2)] disabled:opacity-50 transition-colors"
      >
        {loading ? "..." : buttonLabel}
      </button>
      {result?.status === "alert" && result.reason && (
        <span className="text-[10px] text-[#ff4444] max-w-[200px] truncate" title={result.reason}>
          {result.reason}
        </span>
      )}
    </span>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/tasks/float-badge.tsx components/tasks/task-schedule-button.tsx
git commit -m "feat: FloatBadge and TaskScheduleButton client components"
```

---

### Task 5: Tasks Page - View Toggle and Schedule View

**Files:**
- Modify: `app/(dashboard)/tasks/page.tsx`

- [ ] **Step 1: Add view parameter and conditional rendering**

In `app/(dashboard)/tasks/page.tsx`:

1. Add `view?: string` to the searchParams interface
2. Extract `view` from searchParams (default to "goal")
3. When `view === "schedule"`, pass `includeSlot: true` to `listTasks`
4. Add a view toggle in the header (two links: "By Goal" and "By Schedule" that set `?view=goal` or `?view=schedule`, preserving other query params)

```tsx
const viewMode = view === "schedule" ? "schedule" : "goal"

// In the Promise.all, conditionally include slot:
listTasks({ ...opts, includeSlot: viewMode === "schedule", userId: session.userId }),
```

5. Add the view toggle UI in the header, next to the existing ScheduleAllButton:

```tsx
<div className="flex gap-1">
  <a href={`/tasks?view=goal${status ? `&status=${status}` : ""}${roleId ? `&roleId=${roleId}` : ""}`}
    className={`px-2 py-1 text-xs rounded ${viewMode === "goal" ? "bg-[rgba(0,255,136,0.15)] text-[#00ff88]" : "text-[#666688] hover:text-[#c0c0d0]"}`}>
    By Goal
  </a>
  <a href={`/tasks?view=schedule${status ? `&status=${status}` : ""}${roleId ? `&roleId=${roleId}` : ""}`}
    className={`px-2 py-1 text-xs rounded ${viewMode === "schedule" ? "bg-[rgba(0,255,136,0.15)] text-[#00ff88]" : "text-[#666688] hover:text-[#c0c0d0]"}`}>
    By Schedule
  </a>
</div>
```

6. Add conditional rendering: if `viewMode === "schedule"`, render the schedule layout instead of the existing goal-based grouping.

**Schedule layout:**

Group tasks into three categories:
- `scheduledByDate`: tasks with a timeSlotId, grouped by slot date
- `needsAttention`: tasks with scheduleState "alert"
- `unscheduled`: tasks with importance set but no timeSlotId and scheduleState not "alert"

For the scheduled group, sort by slot date then slot startMinutes. Group into date sections.

```tsx
{viewMode === "schedule" ? (
  <div className="space-y-6">
    {/* Scheduled tasks grouped by date */}
    {Array.from(dateGroups.entries()).map(([dateStr, dateTasks]) => (
      <section key={dateStr}>
        <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-2">
          {new Date(dateStr + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </h2>
        <div className="space-y-1">
          {dateTasks.map(task => (
            <div key={task.id} className="bg-[#111125] border border-[rgba(0,255,136,0.1)] rounded-lg px-3 py-2 flex items-center gap-2">
              {task.role && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: task.role.colour }} />}
              {task.timeSlot && (
                <a href={`/calendar?date=${dateStr}`} className="text-[10px] text-[#666688] hover:text-[#00ff88] flex-shrink-0">
                  {minutesToTime(task.timeSlot.startMinutes)}-{minutesToTime(task.timeSlot.endMinutes)}
                </a>
              )}
              <span className="text-sm text-[#c0c0d0] truncate flex-1">{task.title}</span>
              {task.effortSize && task.effortSize !== "undefined_size" && (
                <span className="text-[10px] text-[#444466] flex-shrink-0">{task.effortSize.replace("_", " ")}</span>
              )}
              <FloatBadge
                slotDate={task.timeSlot?.date ? new Date(task.timeSlot.date).toISOString().slice(0, 10) : null}
                dueDate={task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : null}
              />
              <TaskScheduleButton taskId={task.id} importance={task.importance} scheduleState={task.scheduleState} />
            </div>
          ))}
        </div>
      </section>
    ))}

    {/* Needs Attention section */}
    {alertTasks.length > 0 && (
      <section>
        <h2 className="text-xs font-semibold text-[#ff4444] uppercase tracking-wide mb-2">Needs Attention</h2>
        <div className="space-y-1">
          {alertTasks.map(task => (
            <div key={task.id} className="bg-[#111125] border border-[rgba(255,68,68,0.2)] rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#c0c0d0] truncate flex-1">{task.title}</span>
                <TaskScheduleButton taskId={task.id} importance={task.importance} scheduleState={task.scheduleState} />
              </div>
            </div>
          ))}
        </div>
      </section>
    )}

    {/* Unscheduled section */}
    {unscheduledTasks.length > 0 && (
      <section>
        <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-2">Unscheduled</h2>
        <div className="space-y-1">
          {unscheduledTasks.map(task => (
            <div key={task.id} className="bg-[#111125] border border-[rgba(0,255,136,0.1)] rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-sm text-[#c0c0d0] truncate flex-1">{task.title}</span>
              <TaskScheduleButton taskId={task.id} importance={task.importance} scheduleState={task.scheduleState} />
            </div>
          ))}
        </div>
      </section>
    )}
  </div>
) : (
  /* existing "By Goal" grouping */
)}
```

Add a `minutesToTime` helper at the top of the file:
```typescript
function minutesToTime(m: number): string {
  return `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`
}
```

- [ ] **Step 2: Add FloatBadge and TaskScheduleButton to the existing goal view task rows**

In the existing "By Goal" view rendering, add the FloatBadge and TaskScheduleButton to each task row alongside the existing schedule state dot. Import the new components at the top of the file.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/tasks/page.tsx"
git commit -m "feat: schedule view mode with per-task actions and float display"
```

---

### Task 6: Calendar Click-Through Navigation

**Files:**
- Modify: `components/calendar/calendar-view.tsx`

- [ ] **Step 1: Make task names in slot blocks clickable**

In `components/calendar/calendar-view.tsx`, in the WeekView where assigned tasks are rendered inside slot blocks, wrap each task name in a Link:

```tsx
import Link from "next/link"

// Inside slot block assigned tasks rendering:
{slot.assignedTasks?.map(task => (
  <Link
    key={task.id}
    href={task.projectId ? `/projects/${task.projectId}` : `/tasks?view=schedule`}
    className="block text-[10px] text-[#c0c0d0] hover:text-[#00ff88] truncate mt-0.5"
  >
    {task.title}
  </Link>
))}
```

Note: This requires `projectId` to be available on the assigned task data. Check if the `assignedTasks` select in `lib/services/time-slots.ts` includes `projectId`. If not, add it:

In `lib/services/time-slots.ts`, update the tasks select to include projectId:
```typescript
tasks: { select: { id: true, title: true, effortSize: true, scheduleState: true, projectId: true } }
```

- [ ] **Step 2: Commit**

```bash
git add components/calendar/calendar-view.tsx lib/services/time-slots.ts
git commit -m "feat: clickable task links in calendar slot blocks"
```

---

### Task 7: Full Test Suite and Push

**Files:** None new

- [ ] **Step 1: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Push all commits**

Run: `git push`
