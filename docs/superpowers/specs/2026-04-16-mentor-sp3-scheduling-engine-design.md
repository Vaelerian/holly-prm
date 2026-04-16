# Sub-project 3: Scheduling Engine - Design Specification

**Part of:** Mentor Scheduling Engine Integration for Holly PRM

**Goal:** Build the core scheduling engine that assigns tasks to time slots based on importance, urgency, effort size, and role matching. Includes urgency auto-escalation, per-project importance modifiers with bump logic, on-demand and cron-triggered scheduling, and verbose failure reporting.

**Architecture:** Next.js App Router, Prisma ORM, PostgreSQL

**Depends on:** Sub-project 1 (Role/Goal Hierarchy) and Sub-project 2 (Time Slots and Capacity)

---

## 1. Data Model Changes

### 1.1 New Enums

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

Note: enum values avoid the bare keyword `undefined` as it conflicts with TypeScript/Prisma. Using `undefined_imp`, `undefined_urg`, `undefined_size` instead.

### 1.2 Task Model - New Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| importance | Importance | undefined_imp | Commitment level: core (must do), step (committed but may slip), bonus (may drop) |
| urgency | Urgency | undefined_urg | Scheduling horizon: how soon to schedule |
| effortSize | EffortSize | undefined_size | Categorical effort estimate |
| effortMinutes | Int? | null | Custom minute override (takes precedence over effortSize mapping) |
| scheduleState | ScheduleState | unscheduled | Current scheduling outcome |
| timeSlotId | String? | null | FK to TimeSlot when assigned to a concrete slot |

New relation: `timeSlot TimeSlot? @relation(fields: [timeSlotId], references: [id], onDelete: SetNull)`

TimeSlot model gains: `tasks Task[]` relation.

### 1.3 Project Model - New Field

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| projectImportance | ProjectImportance | same | Adjusts effective importance of all tasks in this project during scheduling |

### 1.4 Effective Importance Calculation

A task's effective importance for scheduling purposes:

1. Start with the task's own `importance` value
2. If the task belongs to a project with `projectImportance`:
   - "more": promote by one level (bonus -> step, step -> core, core stays core)
   - "less": demote by one level (core -> step, step -> bonus, bonus stays bonus)
   - "same": no change
3. Tasks with `undefined_imp` importance are not schedulable (skipped by the engine)

Numeric mapping for sort order: core=1, step=2, bonus=3. Lower number = higher priority.

---

## 2. Scheduling Preferences

Stored in the existing `UserPreference.prefs` JSONB field under a `scheduling` key:

```json
{
  "scheduling": {
    "asapDays": 1,
    "soonDays": 7,
    "sometimeDays": 30,
    "scanAheadDays": 30,
    "sizeMinutes": 20,
    "sizeHour": 90,
    "sizeHalfDay": 240,
    "sizeDay": 480
  }
}
```

| Preference | Default | Description |
|------------|---------|-------------|
| asapDays | 1 | Schedule ASAP tasks within this many days from today |
| soonDays | 7 | Schedule Soon tasks within this many days |
| sometimeDays | 30 | Schedule Sometime tasks within this many days |
| scanAheadDays | 30 | Maximum days to scan forward for available slots |
| sizeMinutes | 20 | Minutes for "minutes" effort size |
| sizeHour | 90 | Minutes for "hour" effort size |
| sizeHalfDay | 240 | Minutes for "half_day" effort size |
| sizeDay | 480 | Minutes for "day" effort size |

"project_size" maps to sizeDay * 2. "milestone" maps to 0 (zero-size, can be placed in any slot without consuming capacity).

### 2.1 Effort Resolution

`resolveEffortMinutes(task, prefs)`:
1. If `task.effortMinutes` is set (not null), return it
2. If `task.effortSize` is set (not undefined_size), map through preferences
3. If both are undefined, return 0 (task has no effort estimate; schedulable but consumes no capacity, like a milestone)

---

## 3. Scheduling Engine

### 3.1 Service: `lib/services/scheduling-engine.ts`

**`scheduleTask(taskId: string, userId: string): Promise<ScheduleResult>`**

Schedule a single task into the best available slot:

1. Load the task with its project (for projectImportance) and role
2. Validate the task is schedulable: importance is not undefined_imp, status is not done/cancelled
3. Calculate effective importance and resolved effort minutes
4. Determine the date scan range:
   - urgency "asap": today to today + asapDays
   - urgency "soon": today to today + soonDays
   - urgency "sometime": today to today + sometimeDays
   - urgency "dated": today to task.dueDate (or today + scanAheadDays if no dueDate)
   - urgency "undefined_urg": today to today + scanAheadDays
5. Call `listTimeSlotsForRange(userId, rangeStart, rangeEnd)` filtered to task's roleId
6. For each slot in date order, check: `(slot.capacityMinutes - slot.usedMinutes) >= effortMinutes`
7. First matching slot: assign task
   - If slot is virtual (isVirtual=true), materialise it first (create concrete TimeSlot from the repeat pattern data)
   - Set `task.timeSlotId = slot.id`
   - Set `task.scheduleState` based on importance: core = "fixed", step/bonus = "floating"
   - Update slot: `usedMinutes += effortMinutes`, `taskCount += 1`
8. No matching slot found:
   - Set `task.scheduleState = "alert"`
   - Return verbose reason: "No {roleName} time slots with {effortMinutes}+ minutes available between {rangeStart} and {rangeEnd}. Create a {roleName} time slot or extend the scan range in scheduling preferences."

**`suggestDate(taskId: string, userId: string): Promise<SuggestionResult>`**

Same scan logic as scheduleTask but without making any changes. Returns:
```typescript
{ found: true, date: string, slotId: string, slotTitle: string }
| { found: false, reason: string }
```

**`rescheduleAll(userId: string): Promise<RescheduleResult>`**

Full reschedule of all active tasks:

1. Load scheduling preferences
2. Run `refreshUrgency(userId)` first to ensure urgencies are current
3. Get all schedulable tasks: status in (todo, in_progress), importance not undefined_imp. Include project relation for projectImportance.
4. Sort by: roleId ASC, effective importance ASC (core=1 first), urgency ASC (asap=2 first), resolved effort ASC (small first)
5. Unassign all currently scheduled tasks:
   - For each task with a timeSlotId: decrement the slot's usedMinutes and taskCount, clear task.timeSlotId, set scheduleState to "unscheduled"
6. For each task in priority order: run the slot-finding logic from scheduleTask
7. Return `{ scheduled: TaskResult[], alerts: TaskResult[] }`

**`refreshUrgency(userId: string): Promise<number>`**

Auto-escalate urgency based on due date proximity:

1. Load scheduling preferences (asapDays, soonDays)
2. Find all tasks where: userId matches (via role/goal), urgency is not "dated" and not "undefined_urg", dueDate is not null, status is not done/cancelled
3. For each task:
   - Calculate daysUntilDue = (dueDate - today) in days
   - If daysUntilDue <= asapDays and urgency is not already "asap": set to "asap"
   - Else if daysUntilDue <= soonDays and urgency is not already "asap" or "soon": set to "soon"
   - (Don't demote - urgency only escalates, never decreases)
4. Return count of tasks that were escalated

### 3.2 Materialisation

When the engine needs to assign a task to a virtual repeat-pattern slot, it must materialise it:

1. Create a concrete TimeSlot record with the virtual slot's date, startMinutes, endMinutes, capacityMinutes, roleId, repeatPatternId, userId
2. Return the new concrete slot's ID for the task assignment

### 3.3 Result Types

```typescript
interface TaskResult {
  taskId: string
  title: string
  status: "scheduled" | "alert"
  slotDate?: string
  slotId?: string
  reason?: string  // verbose explanation for alerts
}

interface ScheduleResult {
  task: TaskResult
}

interface SuggestionResult {
  found: boolean
  date?: string
  slotId?: string
  slotTitle?: string
  reason?: string
}

interface RescheduleResult {
  scheduled: TaskResult[]
  alerts: TaskResult[]
  urgencyEscalated: number
}
```

---

## 4. API Routes

### 4.1 New Routes

```
POST /api/v1/schedule/task/:id        - Schedule a single task
POST /api/v1/schedule/suggest/:id     - Get suggestion without assigning
POST /api/v1/schedule/reschedule      - Full reschedule all tasks
POST /api/v1/schedule/refresh-urgency - Refresh urgency levels
```

All require authentication. All return JSON with the result types from section 3.3.

The reschedule endpoint may take several seconds for users with many tasks. It runs synchronously (no background job needed at current scale).

### 4.2 Cron Integration

In `app/api/v1/cron/notify/route.ts`, add after the vault sync step:

```typescript
// 4. Scheduling: refresh urgency and reschedule if needed
try {
  const schedPrefs = await getSchedulingPrefs(userId)
  if (schedPrefs) {
    const escalated = await refreshUrgency(userId)
    // Check for unscheduled or alert tasks
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
  }
} catch (e) {
  console.error("[cron/notify] scheduling failed", e)
}
```

### 4.3 Dashboard Integration

In `lib/services/briefing.ts`, read cached schedule results:

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

Add `scheduleAlerts` to the briefing return object.

---

## 5. Validation Schemas

### 5.1 Modified Schemas

**Task validation** (`lib/validations/task.ts`):

Add optional fields to CreateTaskSchema and UpdateTaskSchema:
```typescript
importance: z.enum(["undefined_imp", "core", "step", "bonus"]).optional(),
urgency: z.enum(["undefined_urg", "dated", "asap", "soon", "sometime"]).optional(),
effortSize: z.enum(["undefined_size", "minutes", "hour", "half_day", "day", "project_size", "milestone"]).optional(),
effortMinutes: z.number().int().min(0).nullable().optional(),
```

**Project validation** (`lib/validations/project.ts`):

Add optional field to CreateProjectSchema and UpdateProjectSchema:
```typescript
projectImportance: z.enum(["more", "same", "less"]).optional(),
```

---

## 6. UI Changes

### 6.1 Task Forms

Add to task create/edit forms (both AddTaskForm and any edit forms):

- **Importance** dropdown: Undefined / Core / Step / Bonus. Label: "Importance". Help text: Core = must complete, Step = committed but may slip, Bonus = may drop.
- **Urgency** dropdown: Undefined / Dated / ASAP / Soon / Sometime. Label: "Urgency".
- **Effort** dropdown: Undefined / Minutes / Hour / Half Day / Day / Project / Milestone. Label: "Effort". With an expandable "Custom minutes" input that appears via a "Custom" link.

These appear in a collapsible "Scheduling" section below the existing fields, so they don't clutter the quick-add experience.

### 6.2 Project Form

Add **Project Importance** dropdown to the project form: More Important / Same / Less Important. Default: Same. Label: "Scheduling priority". Help text: Adjusts how this project's tasks compete for time slots.

### 6.3 Tasks Page

- Show `scheduleState` badge on each task row: green dot = floating, blue dot = fixed, red dot = alert, grey dot = unscheduled. No dot if importance is undefined (not participating in scheduling).
- "Schedule All" button in the page header. Clicking calls `POST /api/v1/schedule/reschedule`. Shows a loading spinner, then a results summary: "X tasks scheduled, Y alerts".
- If alerts exist, show them in an expandable panel below the button with each alert's task title and verbose reason.

### 6.4 Calendar Week View

Enhance the time slot blocks from SP2:
- Inside each slot block, below the capacity bar, show a list of tasks assigned to that slot (task title + effort badge)
- Tasks are loaded from the slot's task relation (added to the listTimeSlotsForRange query to include assigned tasks)

### 6.5 Settings Page

Add a "Scheduling" section to the settings page with inputs for:
- ASAP days (number input, default 1)
- Soon days (number input, default 7)
- Sometime days (number input, default 30)
- Scan ahead days (number input, default 30)
- Size mappings: Minutes (default 20), Hour (default 90), Half Day (default 240), Day (default 480)

Save to the existing UserPreference.prefs JSONB under the "scheduling" key.

### 6.6 Dashboard

If the briefing contains `scheduleAlerts` (non-empty array), show a "Scheduling alerts" section listing each alert's task title and reason. Coloured with the red alert theme.

---

## 7. Migration

### 7.1 Database Migration

1. Create new enums: Importance, Urgency, EffortSize, ScheduleState, ProjectImportance
2. Add columns to Task: importance (default undefined_imp), urgency (default undefined_urg), effortSize (default undefined_size), effortMinutes (nullable), scheduleState (default unscheduled), timeSlotId (nullable FK)
3. Add column to Project: projectImportance (default same)
4. Add tasks relation to TimeSlot model
5. No data backfill needed - all new fields have sensible defaults

---

## 8. Testing

### 8.1 Unit Tests - Engine Logic (Critical)

**`__tests__/services/scheduling-engine.test.ts`:**

Core engine tests:
- resolveEffortMinutes: effortMinutes override wins, effortSize maps through prefs, both undefined returns 0
- calculateEffectiveImportance: "more" promotes step to core, "less" demotes core to step, core can't promote further, bonus can't demote further, "same" has no effect, no project has no effect
- scheduleTask: assigns to first matching-role slot with capacity, skips full slots, sets scheduleState correctly (core=fixed, step=floating), updates slot usedMinutes/taskCount
- scheduleTask: returns alert with verbose reason when no slot found
- scheduleTask: materialises virtual slot before assigning
- suggestDate: returns suggestion without modifying data
- rescheduleAll: processes in correct priority order, clears all assignments first, returns both scheduled and alerts
- rescheduleAll: higher effective importance task claims slot over lower importance (bump behavior)
- refreshUrgency: escalates sometime to soon when within soonDays, soon to asap when within asapDays, does not demote, skips "dated" tasks, skips tasks without dueDate

### 8.2 API Route Tests

- POST /api/v1/schedule/task/:id - auth check, returns scheduled or alert
- POST /api/v1/schedule/reschedule - auth check, returns full results
- POST /api/v1/schedule/suggest/:id - returns suggestion without side effects

### 8.3 Manual UI Testing

- Set importance/urgency/effort on a task, click schedule, verify assignment
- Create competing tasks with different importances, reschedule all, verify priority ordering
- Set project importance to "more", verify its tasks win slots over "same" importance tasks
- Verify alert reasons are descriptive and actionable
- Verify urgency auto-escalation on cron run
- Verify scheduled tasks appear inside slot blocks in week view
- Verify scheduling preferences save and affect engine behavior
