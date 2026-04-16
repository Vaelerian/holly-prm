# Sub-project 4: Schedule and Role Views - Design Specification

**Part of:** Mentor Scheduling Engine Integration for Holly PRM

**Goal:** Enhance the Tasks page with a "By Schedule" view mode showing tasks sorted by their assigned slot date, add per-task scheduling actions, display float (slack between scheduled and due dates), and add click-through navigation between the tasks page and calendar.

**Architecture:** Next.js App Router, purely UI enhancements with one helper function addition. No new models or API routes.

**Depends on:** Sub-projects 1-3 (Role/Goal Hierarchy, Time Slots, Scheduling Engine)

---

## 1. Tasks Page - Schedule View Mode

### 1.1 View Toggle

Add a view toggle to the Tasks page header alongside the existing filter controls. Two modes:

- **By Goal** (default, current behaviour): Tasks grouped by Role > Goal > Project
- **By Schedule**: Tasks sorted and grouped by their assigned time slot date

The toggle is a URL query parameter `?view=goal` (default) or `?view=schedule`, so it persists on refresh and is shareable.

### 1.2 "By Schedule" View Layout

When `?view=schedule` is active:

**Grouped by date:** Tasks are grouped into date sections based on their assigned time slot's date. Each section header shows the date formatted as "Monday 21 April 2026".

**Within each date group:** Tasks sorted by slot start time, then by task title. Each task row shows:
- Role colour dot
- Slot time range (e.g. "09:00-12:00") in secondary text
- Task title
- Effort size badge
- Float indicator (see section 3)
- Schedule state dot
- Per-task action button (see section 2)

**Special groups at the bottom:**
- "Needs Attention" - tasks with scheduleState "alert", showing alert reason in red subtitle
- "Unscheduled" - tasks with importance set but no timeSlotId, shown with a "Schedule" action button

### 1.3 Service Changes

Add an optional `includeSlot` parameter to `listTasks` in `lib/services/tasks.ts`. When true, include the timeSlot relation in the query:

```typescript
timeSlot: { select: { id: true, date: true, startMinutes: true, endMinutes: true, title: true } }
```

The tasks page passes `includeSlot: true` when `view=schedule`.

---

## 2. Per-Task Scheduling Actions

### 2.1 Action Buttons by State

Each task row shows a context-appropriate scheduling action based on its current state:

| Task State | Condition | Button | Action |
|------------|-----------|--------|--------|
| No importance | importance is undefined_imp | None | Task doesn't participate in scheduling |
| Unscheduled | importance set, no timeSlotId | "Schedule" icon | POST /api/v1/schedule/task/:id |
| Alert | scheduleState is "alert" | "Retry" icon | POST /api/v1/schedule/task/:id |
| Scheduled | scheduleState is floating/fixed | "Reschedule" icon | POST /api/v1/schedule/task/:id (if task already has a timeSlotId, the engine must unassign it first - decrement slot usedMinutes/taskCount, clear timeSlotId - then find a new slot. This is a minor addition to the existing scheduleTask function in scheduling-engine.ts.) |

### 2.2 Inline Feedback

After clicking a scheduling action:
- Show a small loading spinner replacing the button
- On success: update the task row with new schedule state and slot info (use router.refresh())
- On alert result: show the reason as a brief red tooltip or subtitle

### 2.3 Implementation

Create a client component `components/tasks/task-schedule-button.tsx` that:
- Accepts taskId, importance, scheduleState as props
- Renders the appropriate icon button based on state
- Handles the fetch call and loading/result state
- Calls router.refresh() on completion to update server-rendered data

---

## 3. Float Display

### 3.1 Calculation

For tasks with both a scheduled time slot date and a due date:

```
floatDays = Math.ceil((dueDate - slotDate) / 86400000)
```

### 3.2 Display Rules

| Float | Colour | Label |
|-------|--------|-------|
| 3+ days | Green (#00ff88) | "Float: X days" |
| 1-2 days | Amber (#ffaa00) | "Float: X day(s)" |
| 0 days | Amber (#ffaa00) | "Due today" |
| Negative | Red (#ff4444) | "Overdue by X days" |

Only displayed when both dates exist and the task is scheduled (has a timeSlotId).

### 3.3 Implementation

Add `calculateFloat(slotDate, dueDate)` to `lib/services/scheduling-helpers.ts`:

```typescript
interface FloatResult {
  days: number
  label: string
  colour: "green" | "amber" | "red"
}

function calculateFloat(slotDate: Date, dueDate: Date): FloatResult
```

Create a small `FloatBadge` component that renders the coloured label. Used in task rows in both view modes.

### 3.4 Where Float Appears

- Task rows in "By Goal" view (when task is scheduled and has a due date)
- Task rows in "By Schedule" view (same condition)
- Positioned after the due date display in the row

---

## 4. Click-Through Navigation

### 4.1 Task to Calendar

Scheduled tasks show their slot date/time as a clickable link. Clicking navigates to `/calendar?view=week&date=YYYY-MM-DD` which opens the calendar week view focused on that date, letting users see the task in its time-grid context.

### 4.2 Calendar to Task

In the calendar week view, task names shown inside slot blocks are clickable links:
- If the task has a projectId: link to `/projects/{projectId}` (existing behaviour)
- If the task has no project: link to `/tasks?view=schedule&goalId={goalId}`

These are simple `<Link>` elements - no new API work needed.

---

## 5. Testing

### 5.1 Unit Tests

**`__tests__/services/scheduling-helpers.test.ts`** - add calculateFloat tests:
- 5+ days float returns green, "Float: 5 days"
- 2 days float returns amber, "Float: 2 days"
- 1 day float returns amber, "Float: 1 day"
- 0 days float returns amber, "Due today"
- -3 days float returns red, "Overdue by 3 days"

### 5.2 Manual UI Testing

- Tasks page: toggle between "By Goal" and "By Schedule" views
- Schedule view shows tasks grouped by date, unscheduled and alert sections at bottom
- Per-task Schedule button on unscheduled tasks works, shows result
- Per-task Retry button on alert tasks works
- Float badges show correct colours and labels
- Clicking slot date on task navigates to calendar week view for that date
- Clicking task name in calendar slot block navigates to task context
- View toggle persists via URL query parameter
