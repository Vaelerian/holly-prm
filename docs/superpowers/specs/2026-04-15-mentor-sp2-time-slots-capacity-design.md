# Sub-project 2: Time Slots and Capacity - Design Specification

**Part of:** Mentor Scheduling Engine Integration for Holly PRM

**Goal:** Add time slot capacity management to Holly PRM, enabling users to define blocks of time assigned to Roles, with repeating patterns and usage tracking. Enhance the existing calendar views to display time slots as a time-grid alongside Google Calendar events.

**Architecture:** Next.js App Router, Prisma ORM, PostgreSQL

**Depends on:** Sub-project 1 (Role/Goal Hierarchy) - Roles must exist for slot assignment.

---

## 1. Data Model

### 1.1 New Models

**TimeSlot**

| Field            | Type     | Constraints                          | Description                                        |
|------------------|----------|--------------------------------------|----------------------------------------------------|
| id               | UUID     | PK, default uuid                     | Unique identifier                                  |
| roleId           | String   | required, FK to Role                 | The role this slot belongs to                      |
| date             | DateTime | required                             | The date of the slot                               |
| startMinutes     | Int      | required, 0-1439                     | Start time in minutes from midnight (e.g. 540 = 9:00) |
| endMinutes       | Int      | required, 0-1439, > startMinutes     | End time in minutes from midnight                  |
| capacityMinutes  | Int      | required                             | Total capacity (endMinutes - startMinutes)         |
| usedMinutes      | Int      | default 0                            | Minutes consumed by assigned tasks (updated by SP3) |
| taskCount        | Int      | default 0                            | Number of tasks assigned (updated by SP3)          |
| title            | String   | default ""                           | Optional description                               |
| repeatPatternId  | String?  | nullable, FK to RepeatPattern        | If materialised from a repeat, references the pattern |
| userId           | String   | required, FK to User                 | Owner                                              |
| createdAt        | DateTime | default now()                        |                                                    |
| updatedAt        | DateTime | auto                                 |                                                    |

Relations: role (Role), repeatPattern (RepeatPattern?), user (User)

Index: [userId, date] for date-range queries

**RepeatPattern**

| Field          | Type     | Constraints                          | Description                                        |
|----------------|----------|--------------------------------------|----------------------------------------------------|
| id             | UUID     | PK, default uuid                     | Unique identifier                                  |
| roleId         | String   | required, FK to Role                 | The role for generated slots                       |
| repeatType     | Enum     | required                             | daily, weekly, monthly_by_date, monthly_by_day, yearly_by_date, yearly_by_day |
| intervalValue  | Int      | required, min 1, default 1           | Every N days/weeks/months/years                    |
| startDate      | DateTime | required                             | First date the pattern applies                     |
| endDate        | DateTime | nullable                             | Last date (null = repeat forever)                  |
| dayPattern     | Json     | default {}                           | Type-specific config (see 1.2)                     |
| startMinutes   | Int      | required, 0-1439                     | Template start time                                |
| endMinutes     | Int      | required, 0-1439, > startMinutes     | Template end time                                  |
| title          | String   | default ""                           | Template title                                     |
| userId         | String   | required, FK to User                 | Owner                                              |
| createdAt      | DateTime | default now()                        |                                                    |
| updatedAt      | DateTime | auto                                 |                                                    |

Relations: role (Role), exceptions (RepeatException[]), slots (TimeSlot[]), user (User)

**RepeatException**

| Field                | Type     | Constraints                          | Description                                        |
|----------------------|----------|--------------------------------------|----------------------------------------------------|
| id                   | UUID     | PK, default uuid                     | Unique identifier                                  |
| repeatPatternId      | String   | required, FK to RepeatPattern        | The pattern being overridden                       |
| exceptionDate        | DateTime | required                             | The specific date being modified or skipped        |
| exceptionType        | Enum     | "modified" or "skipped"              | Whether this date is changed or removed            |
| modifiedStartMinutes | Int?     | nullable                             | Override start time (modified type only)            |
| modifiedEndMinutes   | Int?     | nullable                             | Override end time (modified type only)              |
| modifiedTitle        | String?  | nullable                             | Override title (modified type only)                 |
| userId               | String   | required, FK to User                 | Owner                                              |
| createdAt            | DateTime | default now()                        |                                                    |

Relations: repeatPattern (RepeatPattern), user (User)

Unique constraint: [repeatPatternId, exceptionDate] (one exception per date per pattern)

### 1.2 Day Pattern JSON Structure

The `dayPattern` field on RepeatPattern holds type-specific recurrence configuration:

- **daily**: `{}` (no extra config needed, interval handles "every N days")
- **weekly**: `{"days": [1, 3, 5]}` (ISO weekday numbers: 1=Monday through 7=Sunday)
- **monthly_by_date**: `{"dates": [1, 15]}` (day-of-month numbers)
- **monthly_by_day**: `{"week": 2, "day": 1}` (2nd Monday)
- **yearly_by_date**: `{"month": 3, "date": 15}` (March 15)
- **yearly_by_day**: `{"month": 3, "week": 2, "day": 1}` (2nd Monday of March)

### 1.3 Virtual vs Concrete Instances

Repeat pattern instances are **virtual by default**. The `expandPattern` function generates them on-the-fly when querying a date range. A virtual instance becomes **concrete** (a real TimeSlot row) when:

1. A user modifies a single instance (creates a RepeatException with type "modified", and if tasks were assigned, materialises as a TimeSlot)
2. A task is assigned to the slot (SP3 creates the concrete TimeSlot row)
3. A user explicitly converts it (e.g. to add notes or custom capacity)

This keeps the database lean - a weekly pattern repeating forever produces zero TimeSlot rows until instances are interacted with.

### 1.4 Resolved Slot Type

The `listTimeSlotsForRange` service returns a unified type:

```typescript
interface ResolvedTimeSlot {
  id: string                    // TimeSlot.id for concrete, "rp:{patternId}:{date}" for virtual
  roleId: string
  roleName: string
  roleColour: string
  date: string                  // ISO date string
  startMinutes: number
  endMinutes: number
  capacityMinutes: number
  usedMinutes: number
  taskCount: number
  title: string
  isVirtual: boolean            // true if expanded from pattern, false if concrete
  repeatPatternId: string | null // non-null for repeat instances (virtual or materialised)
}
```

---

## 2. Prisma Schema Additions

```prisma
enum RepeatType {
  daily
  weekly
  monthly_by_date
  monthly_by_day
  yearly_by_date
  yearly_by_day
}

enum ExceptionType {
  modified
  skipped
}

model TimeSlot {
  id               String          @id @default(uuid())
  roleId           String
  role             Role            @relation(fields: [roleId], references: [id], onDelete: Cascade)
  date             DateTime
  startMinutes     Int
  endMinutes       Int
  capacityMinutes  Int
  usedMinutes      Int             @default(0)
  taskCount        Int             @default(0)
  title            String          @default("")
  repeatPatternId  String?
  repeatPattern    RepeatPattern?  @relation(fields: [repeatPatternId], references: [id], onDelete: SetNull)
  userId           String?
  user             User?           @relation(fields: [userId], references: [id], onDelete: SetNull)
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  @@index([userId, date])
}

model RepeatPattern {
  id             String          @id @default(uuid())
  roleId         String
  role           Role            @relation(fields: [roleId], references: [id], onDelete: Cascade)
  repeatType     RepeatType
  intervalValue  Int             @default(1)
  startDate      DateTime
  endDate        DateTime?
  dayPattern     Json            @default("{}")
  startMinutes   Int
  endMinutes     Int
  title          String          @default("")
  userId         String?
  user           User?           @relation(fields: [userId], references: [id], onDelete: SetNull)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  exceptions RepeatException[]
  slots      TimeSlot[]
}

model RepeatException {
  id                   String        @id @default(uuid())
  repeatPatternId      String
  repeatPattern        RepeatPattern @relation(fields: [repeatPatternId], references: [id], onDelete: Cascade)
  exceptionDate        DateTime
  exceptionType        ExceptionType
  modifiedStartMinutes Int?
  modifiedEndMinutes   Int?
  modifiedTitle        String?
  userId               String?
  user                 User?         @relation(fields: [userId], references: [id], onDelete: SetNull)
  createdAt            DateTime      @default(now())

  @@unique([repeatPatternId, exceptionDate])
}
```

User model gains relations: `timeSlots TimeSlot[]`, `repeatPatterns RepeatPattern[]`, `repeatExceptions RepeatException[]`

Role model gains relations: `timeSlots TimeSlot[]`, `repeatPatterns RepeatPattern[]`

---

## 3. API Routes

### 3.1 Time Slot Routes

```
GET    /api/v1/time-slots?from=YYYY-MM-DD&to=YYYY-MM-DD  - List resolved slots for date range
POST   /api/v1/time-slots                                  - Create one-off slot
PUT    /api/v1/time-slots/:id                              - Update concrete slot
DELETE /api/v1/time-slots/:id                              - Delete concrete slot
```

The GET endpoint is the primary query for calendar views. Both `from` and `to` are required. Returns `ResolvedTimeSlot[]` sorted by date then startMinutes.

POST validates: role ownership, startMinutes < endMinutes, date not in the past. Sets capacityMinutes = endMinutes - startMinutes.

PUT and DELETE only work on concrete slots (not virtual instances - those use the repeat pattern instance endpoints).

### 3.2 Repeat Pattern Routes

```
POST   /api/v1/repeat-patterns                              - Create repeat pattern
PUT    /api/v1/repeat-patterns/:id                          - Update pattern template
DELETE /api/v1/repeat-patterns/:id?scope=all|future          - Delete pattern
```

DELETE with scope=all removes the pattern, all exceptions, and all materialised slots. scope=future sets endDate to today (preserving past materialised slots).

### 3.3 Repeat Instance Routes

```
POST   /api/v1/repeat-patterns/:id/instances/:date/modify   - Modify single instance
POST   /api/v1/repeat-patterns/:id/instances/:date/skip     - Skip single instance
```

The `:date` parameter is YYYY-MM-DD format. The modify endpoint accepts optional startMinutes, endMinutes, and title overrides. Creates or updates a RepeatException record.

---

## 4. Validation Schemas

### 4.1 New Schemas

**`lib/validations/time-slot.ts`**

```typescript
CreateTimeSlotSchema = {
  roleId: UUID (required),
  date: date string (required),
  startMinutes: int (0-1439, required),
  endMinutes: int (0-1439, required, must be > startMinutes),
  title: string (optional, default "")
}

UpdateTimeSlotSchema = {
  startMinutes: int (0-1439, optional),
  endMinutes: int (0-1439, optional),
  title: string (optional),
  roleId: UUID (optional)
}
// Service validates endMinutes > startMinutes after merging with existing values
```

**`lib/validations/repeat-pattern.ts`**

```typescript
CreateRepeatPatternSchema = {
  roleId: UUID (required),
  repeatType: enum["daily", "weekly", "monthly_by_date", "monthly_by_day", "yearly_by_date", "yearly_by_day"] (required),
  intervalValue: int (min 1, default 1),
  startDate: date string (required),
  endDate: date string (nullable, default null),
  dayPattern: JSON (default {}),
  startMinutes: int (0-1439, required),
  endMinutes: int (0-1439, required, > startMinutes),
  title: string (optional, default "")
}

UpdateRepeatPatternSchema = partial of above (all fields optional)

ModifyInstanceSchema = {
  startMinutes: int (0-1439, optional),
  endMinutes: int (0-1439, optional),
  title: string (optional)
}
```

---

## 5. Service Layer

### 5.1 `lib/services/time-slots.ts`

**`listTimeSlotsForRange(userId, startDate, endDate): Promise<ResolvedTimeSlot[]>`**

The core query function. Steps:
1. Fetch concrete TimeSlots where userId matches and date is within range. Include role select (id, name, colour).
2. Fetch RepeatPatterns where userId matches and startDate <= endDate and (endDate is null OR endDate >= startDate). Include exceptions where exceptionDate is within range.
3. For each pattern, call `expandPattern(pattern, startDate, endDate, exceptions)` to generate virtual instances.
4. Filter out virtual instances where a concrete slot already exists for that pattern+date (already materialised).
5. Merge concrete + virtual, sort by date then startMinutes.
6. Return as ResolvedTimeSlot[].

**`createTimeSlot(data, userId): Promise<TimeSlot>`**
- Validate role ownership
- Validate date is not in the past
- Validate startMinutes < endMinutes
- Set capacityMinutes = endMinutes - startMinutes
- Create and return

**`updateTimeSlot(id, data, userId): Promise<TimeSlot>`**
- Find concrete slot, verify ownership
- If times change, recalculate capacityMinutes
- Update and return

**`deleteTimeSlot(id, userId): Promise<void>`**
- Find concrete slot, verify ownership
- If taskCount > 0, throw error "Slot has assigned tasks. Reschedule them first."
- Delete

### 5.2 `lib/services/repeat-patterns.ts`

**`createRepeatPattern(data, userId): Promise<RepeatPattern>`**
- Validate role ownership
- Validate startMinutes < endMinutes
- Validate dayPattern structure matches repeatType
- Create and return

**`updateRepeatPattern(id, data, userId): Promise<RepeatPattern>`**
- Find pattern, verify ownership
- Update template fields
- Return updated pattern

**`deleteRepeatPattern(id, scope, userId): Promise<void>`**
- Find pattern, verify ownership
- scope "all": delete pattern (cascades to exceptions and sets repeatPatternId null on materialised slots via SetNull)
- scope "future": set endDate to today's date

**`modifyRepeatInstance(patternId, date, data, userId): Promise<RepeatException>`**
- Find pattern, verify ownership
- Verify the date is a valid instance of the pattern (it falls on a recurrence date)
- Upsert RepeatException with type "modified" and the override fields

**`skipRepeatInstance(patternId, date, userId): Promise<RepeatException>`**
- Find pattern, verify ownership
- Verify the date is a valid instance
- If a materialised TimeSlot exists for this pattern+date with taskCount > 0, throw error
- Upsert RepeatException with type "skipped"

### 5.3 `lib/services/repeat-expand.ts`

Pure functions for date recurrence expansion. No database access.

**`expandPattern(pattern, rangeStart, rangeEnd, exceptions): ResolvedTimeSlot[]`**

Takes a RepeatPattern record, a date range, and a list of RepeatException records. Returns the list of virtual slot instances for the range.

Logic per repeat type:
- **daily**: Starting from pattern.startDate, step by intervalValue days. For each date in range, generate instance.
- **weekly**: Starting from pattern.startDate, step by intervalValue weeks. For each week, generate instances on the days specified in dayPattern.days.
- **monthly_by_date**: For each month in range, generate instances on the dates in dayPattern.dates. Step by intervalValue months.
- **monthly_by_day**: For each month, find the Nth weekday (e.g. 2nd Monday). Step by intervalValue months.
- **yearly_by_date**: For each year, generate on the specific month+date. Step by intervalValue years.
- **yearly_by_day**: For each year, find the Nth weekday of the specific month.

For each generated date:
1. Check if date is before pattern.startDate or after pattern.endDate - skip
2. Check if date is outside [rangeStart, rangeEnd] - skip
3. Check exceptions: if "skipped" exception exists for this date - skip
4. Check exceptions: if "modified" exception exists, apply overrides to startMinutes/endMinutes/title
5. Generate ResolvedTimeSlot with isVirtual=true, id="rp:{patternId}:{YYYY-MM-DD}"

**`isValidInstanceDate(pattern, date): boolean`**

Checks whether a given date is a valid recurrence of the pattern. Used by modifyRepeatInstance and skipRepeatInstance to validate the date parameter.

---

## 6. UI Changes

### 6.1 Calendar Page Layout Changes

The calendar page (`app/(dashboard)/calendar/page.tsx`) currently fetches all-day calendar items server-side. Add a time-slots fetch:

- Server-side: call `listTimeSlotsForRange(userId, rangeStart, rangeEnd)` based on the current view's date range
- Pass resolved slots to the CalendarView component as a new `timeSlots` prop

### 6.2 Week View - Time Grid

Transform the week view from a simple day-column layout into a time-grid:

- Y-axis: hours from 06:00 to 22:00 (configurable via preference later, hardcoded for now)
- X-axis: 7 day columns (Mon-Sun)
- Time slot blocks: positioned by startMinutes/endMinutes, coloured by role colour. Inside each block: title (or role name if no title), capacity bar showing usedMinutes/capacityMinutes (will be 0/N until SP3).
- Google Calendar events: rendered as separate blocks with grey/outlined style, positioned by their start/end times.
- All-day items (task due dates, project targets): rendered in a header row above the time grid, same as current behavior.
- Click empty space: opens slot creation form pre-filled with date and approximate time.
- Click existing slot: opens edit form. For repeat instances, prompts "This occurrence" / "All future" / "Entire pattern".

### 6.3 Month View - Capacity Indicators

Keep the current month grid layout. Add per-day capacity summary:

- Below the existing item count/dots for each day, show small coloured segments representing total slot hours per role. E.g. 3h Work (blue) + 2h Personal (green) = two mini-bar segments.
- Clicking a day with slots shows them in the day detail alongside existing items.

### 6.4 Agenda View - Slot Entries

Add time slots to the agenda list, interleaved by date:

- Each slot entry shows: role colour dot, time range (e.g. "09:00-12:00"), title or role name, and a usage bar (0/180 min until SP3).
- Slots appear before all-day items for the same date.

### 6.5 Slot Creation/Edit UI

**Creation** (triggered by "Add Time Slot" button or click-to-create in week view):

- Role dropdown (required)
- Date picker (required, pre-filled from click position or current date)
- Start time picker (required, pre-filled from click position)
- End time picker (required)
- Title input (optional)
- "Make Repeating" toggle - reveals:
  - Repeat type dropdown (daily/weekly/monthly/yearly)
  - Interval input ("Every N weeks")
  - Day selector (for weekly: checkboxes for Mon-Sun)
  - End date picker or "Repeat forever" checkbox

**Editing a repeat instance** (click on a slot that comes from a repeat pattern):

- Prompt: "Edit this occurrence only" / "Edit all future occurrences" / "Edit entire pattern"
- "This occurrence": opens edit form, saves as RepeatException (modified)
- "All future": sets the current pattern's endDate to yesterday, then creates a new RepeatPattern with the modified values starting from the selected date
- "Entire pattern": updates the existing RepeatPattern directly (all instances change)

**Deleting:**

- One-off slot: confirm and delete
- Repeat instance: "Delete this occurrence" (creates skip exception) / "Delete all future" (sets endDate) / "Delete entire pattern" (removes pattern)

---

## 7. Migration

### 7.1 Database Migration

Simple additive migration:
1. Create RepeatType and ExceptionType enums
2. Create RepeatPattern table
3. Create TimeSlot table (with FK to RepeatPattern)
4. Create RepeatException table (with FK to RepeatPattern and unique constraint)
5. Add relations to User and Role models

No data backfill needed - this is net-new functionality.

### 7.2 Calendar View Data Flow

The existing CalendarView component receives `items: CalendarItem[]`. The new data flow:

1. Calendar page (server component) fetches both `CalendarItem[]` (existing) and `ResolvedTimeSlot[]` (new)
2. Both are passed as separate props to CalendarView
3. CalendarView renders them differently: items as badges/dots, slots as positioned blocks in the time grid

---

## 8. Testing

### 8.1 Unit Tests - Repeat Expansion (Critical)

**`__tests__/services/repeat-expand.test.ts`** - Extensive tests for the pure expansion function:

- Daily pattern: generates correct dates, respects interval (every 2 days), respects end date, handles range boundaries
- Weekly pattern: generates on correct weekdays, handles multi-day patterns (Mon+Wed+Fri), respects interval (every 2 weeks), skips days outside dayPattern
- Monthly by date: handles day-of-month, handles months with fewer days (Feb 30 skipped), interval
- Monthly by day: finds correct Nth weekday (e.g. 2nd Monday), handles edge cases (5th Monday in months without one)
- Yearly patterns: both by-date and by-day variants
- Exception handling: skipped dates removed, modified dates have overridden fields
- Edge cases: pattern with startDate in future, endDate in past, range with no matching dates, empty dayPattern

### 8.2 Unit Tests - Services

**`__tests__/services/time-slots.test.ts`:**
- Create slot with valid data
- Reject slot in the past
- Reject invalid times (start >= end)
- Reject slot for non-owned role
- Delete slot with no tasks
- Reject delete when tasks assigned

**`__tests__/services/repeat-patterns.test.ts`:**
- Create pattern with valid data
- Delete with scope "all" vs "future"
- Modify instance creates exception
- Skip instance creates exception
- Reject skip when tasks assigned to materialised slot

**`__tests__/services/time-slots.test.ts` (listTimeSlotsForRange):**
- Returns concrete slots in range
- Expands repeat patterns into virtual instances
- Applies exceptions (skip and modify)
- Filters out already-materialised instances
- Merges and sorts correctly

### 8.3 Manual UI Testing

- Week view renders time grid with hours on y-axis
- Slot blocks position correctly by start/end time
- Google Calendar events render alongside
- Month view shows capacity indicators per day
- Agenda view includes slot entries
- Create slot from button and from click-to-create
- Create repeat pattern, verify instances appear across weeks
- Edit single instance vs entire pattern
- Skip a single repeat instance
- Delete one-off slot vs repeat pattern
