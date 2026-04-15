# Time Slots and Capacity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add time slot capacity management with repeating patterns to Holly PRM, and enhance the calendar views to display time slots as a time-grid alongside Google Calendar events.

**Architecture:** Three new Prisma models (TimeSlot, RepeatPattern, RepeatException). Pure-function repeat expansion engine. Calendar week view transformed from simple day-columns to a time-grid. Time slots are assigned at the Role level. Repeat instances are virtual until materialised.

**Tech Stack:** Next.js 16, Prisma 7, PostgreSQL, Jest, Zod

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `prisma/migrations/YYYYMMDD_time_slots/migration.sql` | Schema migration |
| `lib/validations/time-slot.ts` | Zod schemas for TimeSlot CRUD |
| `lib/validations/repeat-pattern.ts` | Zod schemas for RepeatPattern CRUD |
| `lib/services/repeat-expand.ts` | Pure functions for date recurrence expansion |
| `lib/services/time-slots.ts` | TimeSlot CRUD + listTimeSlotsForRange |
| `lib/services/repeat-patterns.ts` | RepeatPattern CRUD + instance modify/skip |
| `__tests__/services/repeat-expand.test.ts` | Repeat expansion tests (critical) |
| `__tests__/services/time-slots.test.ts` | TimeSlot service tests |
| `__tests__/services/repeat-patterns.test.ts` | RepeatPattern service tests |
| `app/api/v1/time-slots/route.ts` | GET/POST time slots |
| `app/api/v1/time-slots/[id]/route.ts` | PUT/DELETE time slot |
| `app/api/v1/repeat-patterns/route.ts` | POST repeat pattern |
| `app/api/v1/repeat-patterns/[id]/route.ts` | PUT/DELETE repeat pattern |
| `app/api/v1/repeat-patterns/[id]/instances/[date]/modify/route.ts` | POST modify instance |
| `app/api/v1/repeat-patterns/[id]/instances/[date]/skip/route.ts` | POST skip instance |

### Modified Files
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add TimeSlot, RepeatPattern, RepeatException models |
| `app/(dashboard)/calendar/page.tsx` | Fetch time slots, pass to CalendarView |
| `components/calendar/calendar-view.tsx` | Add timeSlots prop, time-grid week view, capacity indicators |

---

### Task 1: Prisma Schema - TimeSlot, RepeatPattern, RepeatException

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add enums and models to schema**

Add after the existing GoalStatus enum:

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

- [ ] **Step 2: Add relations to User and Role models**

In the User model, add:
```prisma
  timeSlots         TimeSlot[]
  repeatPatterns    RepeatPattern[]
  repeatExceptions  RepeatException[]
```

In the Role model, add:
```prisma
  timeSlots       TimeSlot[]
  repeatPatterns  RepeatPattern[]
```

- [ ] **Step 3: Generate client and create migration**

Run:
```bash
npx prisma generate
npx prisma migrate dev --name time_slots --create-only
```

- [ ] **Step 4: Commit**

```bash
git add prisma/ app/generated/
git commit -m "feat: add TimeSlot, RepeatPattern, RepeatException schema"
```

---

### Task 2: Validation Schemas

**Files:**
- Create: `lib/validations/time-slot.ts`
- Create: `lib/validations/repeat-pattern.ts`

- [ ] **Step 1: Create time slot validation schema**

Create `lib/validations/time-slot.ts`:

```typescript
import { z } from "zod"

export const CreateTimeSlotSchema = z.object({
  roleId: z.string().uuid(),
  date: z.string().date(),
  startMinutes: z.number().int().min(0).max(1439),
  endMinutes: z.number().int().min(0).max(1439),
  title: z.string().default(""),
}).refine(data => data.endMinutes > data.startMinutes, {
  message: "End time must be after start time",
  path: ["endMinutes"],
})

export const UpdateTimeSlotSchema = z.object({
  roleId: z.string().uuid().optional(),
  startMinutes: z.number().int().min(0).max(1439).optional(),
  endMinutes: z.number().int().min(0).max(1439).optional(),
  title: z.string().optional(),
})

export type CreateTimeSlotInput = z.infer<typeof CreateTimeSlotSchema>
export type UpdateTimeSlotInput = z.infer<typeof UpdateTimeSlotSchema>
```

- [ ] **Step 2: Create repeat pattern validation schema**

Create `lib/validations/repeat-pattern.ts`:

```typescript
import { z } from "zod"

export const CreateRepeatPatternSchema = z.object({
  roleId: z.string().uuid(),
  repeatType: z.enum(["daily", "weekly", "monthly_by_date", "monthly_by_day", "yearly_by_date", "yearly_by_day"]),
  intervalValue: z.number().int().min(1).default(1),
  startDate: z.string().date(),
  endDate: z.string().date().nullable().default(null),
  dayPattern: z.record(z.unknown()).default({}),
  startMinutes: z.number().int().min(0).max(1439),
  endMinutes: z.number().int().min(0).max(1439),
  title: z.string().default(""),
}).refine(data => data.endMinutes > data.startMinutes, {
  message: "End time must be after start time",
  path: ["endMinutes"],
})

export const UpdateRepeatPatternSchema = z.object({
  roleId: z.string().uuid().optional(),
  repeatType: z.enum(["daily", "weekly", "monthly_by_date", "monthly_by_day", "yearly_by_date", "yearly_by_day"]).optional(),
  intervalValue: z.number().int().min(1).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().nullable().optional(),
  dayPattern: z.record(z.unknown()).optional(),
  startMinutes: z.number().int().min(0).max(1439).optional(),
  endMinutes: z.number().int().min(0).max(1439).optional(),
  title: z.string().optional(),
})

export const ModifyInstanceSchema = z.object({
  startMinutes: z.number().int().min(0).max(1439).optional(),
  endMinutes: z.number().int().min(0).max(1439).optional(),
  title: z.string().optional(),
})

export type CreateRepeatPatternInput = z.infer<typeof CreateRepeatPatternSchema>
export type UpdateRepeatPatternInput = z.infer<typeof UpdateRepeatPatternSchema>
export type ModifyInstanceInput = z.infer<typeof ModifyInstanceSchema>
```

- [ ] **Step 3: Commit**

```bash
git add lib/validations/time-slot.ts lib/validations/repeat-pattern.ts
git commit -m "feat: validation schemas for time slots and repeat patterns"
```

---

### Task 3: Repeat Expansion Engine with Tests (Critical)

**Files:**
- Create: `lib/services/repeat-expand.ts`
- Create: `__tests__/services/repeat-expand.test.ts`

This is the most test-heavy task. The expansion engine is a set of pure functions with no database access.

- [ ] **Step 1: Write repeat expansion tests**

Create `__tests__/services/repeat-expand.test.ts`:

```typescript
import { expandPattern, isValidInstanceDate } from "@/lib/services/repeat-expand"

const basePattern = {
  id: "rp1",
  roleId: "r1",
  startMinutes: 540,
  endMinutes: 720,
  title: "Work",
  intervalValue: 1,
  userId: "u1",
}

describe("expandPattern - daily", () => {
  it("generates daily instances within range", () => {
    const pattern = { ...basePattern, repeatType: "daily" as const, startDate: new Date("2026-04-01"), endDate: null, dayPattern: {} }
    const result = expandPattern(pattern, new Date("2026-04-01"), new Date("2026-04-03"), [])
    expect(result).toHaveLength(3)
    expect(result[0].date).toBe("2026-04-01")
    expect(result[1].date).toBe("2026-04-02")
    expect(result[2].date).toBe("2026-04-03")
  })

  it("respects interval (every 2 days)", () => {
    const pattern = { ...basePattern, repeatType: "daily" as const, startDate: new Date("2026-04-01"), endDate: null, dayPattern: {}, intervalValue: 2 }
    const result = expandPattern(pattern, new Date("2026-04-01"), new Date("2026-04-06"), [])
    expect(result.map(r => r.date)).toEqual(["2026-04-01", "2026-04-03", "2026-04-05"])
  })

  it("respects endDate", () => {
    const pattern = { ...basePattern, repeatType: "daily" as const, startDate: new Date("2026-04-01"), endDate: new Date("2026-04-02"), dayPattern: {} }
    const result = expandPattern(pattern, new Date("2026-04-01"), new Date("2026-04-05"), [])
    expect(result).toHaveLength(2)
  })
})

describe("expandPattern - weekly", () => {
  it("generates on specified weekdays", () => {
    // Mon=1, Wed=3, Fri=5
    const pattern = { ...basePattern, repeatType: "weekly" as const, startDate: new Date("2026-04-06"), endDate: null, dayPattern: { days: [1, 3, 5] } }
    // Apr 6 2026 is a Monday
    const result = expandPattern(pattern, new Date("2026-04-06"), new Date("2026-04-12"), [])
    expect(result.map(r => r.date)).toEqual(["2026-04-06", "2026-04-08", "2026-04-10"])
  })

  it("respects bi-weekly interval", () => {
    const pattern = { ...basePattern, repeatType: "weekly" as const, startDate: new Date("2026-04-06"), endDate: null, dayPattern: { days: [1] }, intervalValue: 2 }
    const result = expandPattern(pattern, new Date("2026-04-06"), new Date("2026-04-27"), [])
    // Week 1: Apr 6, skip week 2, Week 3: Apr 20
    expect(result.map(r => r.date)).toEqual(["2026-04-06", "2026-04-20"])
  })
})

describe("expandPattern - monthly_by_date", () => {
  it("generates on specified dates each month", () => {
    const pattern = { ...basePattern, repeatType: "monthly_by_date" as const, startDate: new Date("2026-01-01"), endDate: null, dayPattern: { dates: [15] } }
    const result = expandPattern(pattern, new Date("2026-01-01"), new Date("2026-03-31"), [])
    expect(result.map(r => r.date)).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"])
  })

  it("skips dates that do not exist in the month (Feb 30)", () => {
    const pattern = { ...basePattern, repeatType: "monthly_by_date" as const, startDate: new Date("2026-01-01"), endDate: null, dayPattern: { dates: [30] } }
    const result = expandPattern(pattern, new Date("2026-01-01"), new Date("2026-03-31"), [])
    // Jan 30, no Feb 30, Mar 30
    expect(result.map(r => r.date)).toEqual(["2026-01-30", "2026-03-30"])
  })
})

describe("expandPattern - exceptions", () => {
  it("skips dates with skipped exceptions", () => {
    const pattern = { ...basePattern, repeatType: "daily" as const, startDate: new Date("2026-04-01"), endDate: null, dayPattern: {} }
    const exceptions = [{ id: "e1", repeatPatternId: "rp1", exceptionDate: new Date("2026-04-02"), exceptionType: "skipped" as const, modifiedStartMinutes: null, modifiedEndMinutes: null, modifiedTitle: null, userId: "u1", createdAt: new Date() }]
    const result = expandPattern(pattern, new Date("2026-04-01"), new Date("2026-04-03"), exceptions)
    expect(result.map(r => r.date)).toEqual(["2026-04-01", "2026-04-03"])
  })

  it("applies modified exception overrides", () => {
    const pattern = { ...basePattern, repeatType: "daily" as const, startDate: new Date("2026-04-01"), endDate: null, dayPattern: {} }
    const exceptions = [{ id: "e1", repeatPatternId: "rp1", exceptionDate: new Date("2026-04-02"), exceptionType: "modified" as const, modifiedStartMinutes: 600, modifiedEndMinutes: 780, modifiedTitle: "Late start", userId: "u1", createdAt: new Date() }]
    const result = expandPattern(pattern, new Date("2026-04-01"), new Date("2026-04-03"), exceptions)
    expect(result[1].startMinutes).toBe(600)
    expect(result[1].endMinutes).toBe(780)
    expect(result[1].title).toBe("Late start")
  })
})

describe("expandPattern - virtual ID format", () => {
  it("generates virtual IDs as rp:{patternId}:{date}", () => {
    const pattern = { ...basePattern, repeatType: "daily" as const, startDate: new Date("2026-04-01"), endDate: null, dayPattern: {} }
    const result = expandPattern(pattern, new Date("2026-04-01"), new Date("2026-04-01"), [])
    expect(result[0].id).toBe("rp:rp1:2026-04-01")
    expect(result[0].isVirtual).toBe(true)
  })
})

describe("isValidInstanceDate", () => {
  it("returns true for a date that falls on the pattern", () => {
    const pattern = { ...basePattern, repeatType: "daily" as const, startDate: new Date("2026-04-01"), endDate: null, dayPattern: {}, intervalValue: 1 }
    expect(isValidInstanceDate(pattern, new Date("2026-04-05"))).toBe(true)
  })

  it("returns false for a date before the pattern start", () => {
    const pattern = { ...basePattern, repeatType: "daily" as const, startDate: new Date("2026-04-01"), endDate: null, dayPattern: {}, intervalValue: 1 }
    expect(isValidInstanceDate(pattern, new Date("2026-03-31"))).toBe(false)
  })

  it("returns false for a date not on the interval", () => {
    const pattern = { ...basePattern, repeatType: "daily" as const, startDate: new Date("2026-04-01"), endDate: null, dayPattern: {}, intervalValue: 2 }
    expect(isValidInstanceDate(pattern, new Date("2026-04-02"))).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/repeat-expand.test.ts --no-coverage`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement repeat expansion engine**

Create `lib/services/repeat-expand.ts`:

```typescript
export interface RepeatPatternData {
  id: string
  roleId: string
  repeatType: "daily" | "weekly" | "monthly_by_date" | "monthly_by_day" | "yearly_by_date" | "yearly_by_day"
  intervalValue: number
  startDate: Date
  endDate: Date | null
  dayPattern: Record<string, unknown>
  startMinutes: number
  endMinutes: number
  title: string
  userId: string | null
}

export interface RepeatExceptionData {
  id: string
  repeatPatternId: string
  exceptionDate: Date
  exceptionType: "modified" | "skipped"
  modifiedStartMinutes: number | null
  modifiedEndMinutes: number | null
  modifiedTitle: string | null
  userId: string | null
  createdAt: Date
}

export interface ResolvedTimeSlot {
  id: string
  roleId: string
  date: string
  startMinutes: number
  endMinutes: number
  capacityMinutes: number
  usedMinutes: number
  taskCount: number
  title: string
  isVirtual: boolean
  repeatPatternId: string | null
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function sameDay(a: Date, b: Date): boolean {
  return toDateStr(a) === toDateStr(b)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function diffDays(a: Date, b: Date): number {
  const msPerDay = 86400000
  return Math.round((b.getTime() - a.getTime()) / msPerDay)
}

function getISOWeekday(d: Date): number {
  // 1=Monday ... 7=Sunday
  return d.getDay() === 0 ? 7 : d.getDay()
}

function weekNumber(start: Date, current: Date): number {
  const days = diffDays(start, current)
  return Math.floor(days / 7)
}

function makeSlot(pattern: RepeatPatternData, date: string, exception?: RepeatExceptionData): ResolvedTimeSlot {
  const start = exception?.modifiedStartMinutes ?? pattern.startMinutes
  const end = exception?.modifiedEndMinutes ?? pattern.endMinutes
  return {
    id: `rp:${pattern.id}:${date}`,
    roleId: pattern.roleId,
    date,
    startMinutes: start,
    endMinutes: end,
    capacityMinutes: end - start,
    usedMinutes: 0,
    taskCount: 0,
    title: exception?.modifiedTitle ?? pattern.title,
    isVirtual: true,
    repeatPatternId: pattern.id,
  }
}

export function expandPattern(
  pattern: RepeatPatternData,
  rangeStart: Date,
  rangeEnd: Date,
  exceptions: RepeatExceptionData[]
): ResolvedTimeSlot[] {
  const results: ResolvedTimeSlot[] = []
  const exceptionMap = new Map<string, RepeatExceptionData>()
  for (const ex of exceptions) {
    exceptionMap.set(toDateStr(ex.exceptionDate), ex)
  }

  const effectiveEnd = pattern.endDate && pattern.endDate < rangeEnd ? pattern.endDate : rangeEnd
  const effectiveStart = pattern.startDate > rangeStart ? pattern.startDate : rangeStart

  const candidates = generateCandidateDates(pattern, effectiveStart, effectiveEnd)

  for (const date of candidates) {
    const dateStr = toDateStr(date)
    if (date < pattern.startDate) continue
    if (pattern.endDate && date > pattern.endDate) continue
    if (date < rangeStart || date > rangeEnd) continue

    const exception = exceptionMap.get(dateStr)
    if (exception?.exceptionType === "skipped") continue

    results.push(makeSlot(pattern, dateStr, exception?.exceptionType === "modified" ? exception : undefined))
  }

  return results
}

function generateCandidateDates(pattern: RepeatPatternData, start: Date, end: Date): Date[] {
  const dates: Date[] = []

  switch (pattern.repeatType) {
    case "daily": {
      let current = new Date(pattern.startDate)
      while (current <= end) {
        if (current >= start) {
          dates.push(new Date(current))
        }
        current = addDays(current, pattern.intervalValue)
      }
      break
    }

    case "weekly": {
      const days = ((pattern.dayPattern as { days?: number[] }).days ?? [])
      let weekStart = new Date(pattern.startDate)
      // Align to start of week (Monday)
      const startWeekday = getISOWeekday(weekStart)
      if (startWeekday > 1) {
        weekStart = addDays(weekStart, -(startWeekday - 1))
      }

      while (weekStart <= end) {
        for (const day of days) {
          const candidate = addDays(weekStart, day - 1) // day 1=Mon = offset 0
          if (candidate >= pattern.startDate && candidate >= start && candidate <= end) {
            dates.push(candidate)
          }
        }
        weekStart = addDays(weekStart, 7 * pattern.intervalValue)
      }
      break
    }

    case "monthly_by_date": {
      const monthDates = ((pattern.dayPattern as { dates?: number[] }).dates ?? [])
      let current = new Date(pattern.startDate.getFullYear(), pattern.startDate.getMonth(), 1)
      while (current <= end) {
        for (const d of monthDates) {
          const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
          if (d <= daysInMonth) {
            const candidate = new Date(current.getFullYear(), current.getMonth(), d)
            if (candidate >= pattern.startDate && candidate >= start && candidate <= end) {
              dates.push(candidate)
            }
          }
        }
        current = new Date(current.getFullYear(), current.getMonth() + pattern.intervalValue, 1)
      }
      break
    }

    case "monthly_by_day": {
      const { week, day } = pattern.dayPattern as { week?: number; day?: number }
      if (week === undefined || day === undefined) break
      let current = new Date(pattern.startDate.getFullYear(), pattern.startDate.getMonth(), 1)
      while (current <= end) {
        const candidate = nthWeekdayOfMonth(current.getFullYear(), current.getMonth(), week, day)
        if (candidate && candidate >= pattern.startDate && candidate >= start && candidate <= end) {
          dates.push(candidate)
        }
        current = new Date(current.getFullYear(), current.getMonth() + pattern.intervalValue, 1)
      }
      break
    }

    case "yearly_by_date": {
      const { month, date } = pattern.dayPattern as { month?: number; date?: number }
      if (month === undefined || date === undefined) break
      let year = pattern.startDate.getFullYear()
      while (year <= end.getFullYear()) {
        const daysInMonth = new Date(year, month, 0).getDate()
        if (date <= daysInMonth) {
          const candidate = new Date(year, month - 1, date)
          if (candidate >= pattern.startDate && candidate >= start && candidate <= end) {
            dates.push(candidate)
          }
        }
        year += pattern.intervalValue
      }
      break
    }

    case "yearly_by_day": {
      const { month, week, day } = pattern.dayPattern as { month?: number; week?: number; day?: number }
      if (month === undefined || week === undefined || day === undefined) break
      let year = pattern.startDate.getFullYear()
      while (year <= end.getFullYear()) {
        const candidate = nthWeekdayOfMonth(year, month - 1, week, day)
        if (candidate && candidate >= pattern.startDate && candidate >= start && candidate <= end) {
          dates.push(candidate)
        }
        year += pattern.intervalValue
      }
      break
    }
  }

  return dates
}

function nthWeekdayOfMonth(year: number, month: number, n: number, weekday: number): Date | null {
  // weekday: 1=Monday ... 7=Sunday (ISO)
  // n: 1=first, 2=second, etc.
  const jsWeekday = weekday === 7 ? 0 : weekday // Convert to JS weekday (0=Sun)
  const first = new Date(year, month, 1)
  let firstOccurrence = first.getDay() <= jsWeekday
    ? new Date(year, month, 1 + (jsWeekday - first.getDay()))
    : new Date(year, month, 1 + (7 - first.getDay() + jsWeekday))

  const result = new Date(firstOccurrence)
  result.setDate(result.getDate() + (n - 1) * 7)

  // Check still in same month
  if (result.getMonth() !== month) return null
  return result
}

export function isValidInstanceDate(pattern: RepeatPatternData, date: Date): boolean {
  if (date < pattern.startDate) return false
  if (pattern.endDate && date > pattern.endDate) return false

  // Expand just the single day to check
  const result = expandPattern(pattern, date, date, [])
  return result.length > 0
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/services/repeat-expand.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/repeat-expand.ts __tests__/services/repeat-expand.test.ts
git commit -m "feat: repeat expansion engine with comprehensive tests"
```

---

### Task 4: TimeSlot Service with Tests

**Files:**
- Create: `lib/services/time-slots.ts`
- Create: `__tests__/services/time-slots.test.ts`

- [ ] **Step 1: Write time slot service tests**

Create `__tests__/services/time-slots.test.ts`:

```typescript
import { createTimeSlot, updateTimeSlot, deleteTimeSlot, listTimeSlotsForRange } from "@/lib/services/time-slots"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    timeSlot: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    repeatPattern: {
      findMany: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock("@/lib/services/repeat-expand", () => ({
  expandPattern: jest.fn(() => []),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("createTimeSlot", () => {
  it("creates a slot with computed capacityMinutes", async () => {
    mockPrisma.role.findFirst.mockResolvedValue({ id: "r1", userId: "u1" } as any)
    mockPrisma.timeSlot.create.mockResolvedValue({ id: "ts1", startMinutes: 540, endMinutes: 720, capacityMinutes: 180 } as any)
    const result = await createTimeSlot({ roleId: "r1", date: "2026-05-01", startMinutes: 540, endMinutes: 720, title: "" }, "u1")
    expect(mockPrisma.timeSlot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ capacityMinutes: 180 }),
    })
    expect(result).toBeTruthy()
  })

  it("rejects when role does not belong to user", async () => {
    mockPrisma.role.findFirst.mockResolvedValue(null)
    const result = await createTimeSlot({ roleId: "r1", date: "2026-05-01", startMinutes: 540, endMinutes: 720, title: "" }, "u1")
    expect(result).toBeNull()
  })
})

describe("deleteTimeSlot", () => {
  it("deletes slot with no tasks", async () => {
    mockPrisma.timeSlot.findFirst.mockResolvedValue({ id: "ts1", taskCount: 0, userId: "u1" } as any)
    mockPrisma.timeSlot.delete.mockResolvedValue({} as any)
    await deleteTimeSlot("ts1", "u1")
    expect(mockPrisma.timeSlot.delete).toHaveBeenCalledWith({ where: { id: "ts1" } })
  })

  it("rejects delete when tasks are assigned", async () => {
    mockPrisma.timeSlot.findFirst.mockResolvedValue({ id: "ts1", taskCount: 2, userId: "u1" } as any)
    await expect(deleteTimeSlot("ts1", "u1")).rejects.toThrow("assigned tasks")
  })
})

describe("listTimeSlotsForRange", () => {
  it("returns concrete slots within range", async () => {
    const slots = [{ id: "ts1", date: new Date("2026-05-01"), roleId: "r1", role: { id: "r1", name: "Work", colour: "#FF0000" } }]
    mockPrisma.timeSlot.findMany.mockResolvedValue(slots as any)
    mockPrisma.repeatPattern.findMany.mockResolvedValue([])
    const result = await listTimeSlotsForRange("u1", new Date("2026-05-01"), new Date("2026-05-07"))
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].isVirtual).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/time-slots.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement time slot service**

Create `lib/services/time-slots.ts`:

```typescript
import { prisma } from "@/lib/db"
import { expandPattern, type ResolvedTimeSlot } from "@/lib/services/repeat-expand"
import type { CreateTimeSlotInput, UpdateTimeSlotInput } from "@/lib/validations/time-slot"

export type { ResolvedTimeSlot }

export async function listTimeSlotsForRange(userId: string, startDate: Date, endDate: Date): Promise<ResolvedTimeSlot[]> {
  // 1. Fetch concrete slots
  const concreteSlots = await prisma.timeSlot.findMany({
    where: { userId, date: { gte: startDate, lte: endDate } },
    include: { role: { select: { id: true, name: true, colour: true } } },
    orderBy: [{ date: "asc" }, { startMinutes: "asc" }],
  })

  // 2. Fetch repeat patterns that overlap the range
  const patterns = await prisma.repeatPattern.findMany({
    where: {
      userId,
      startDate: { lte: endDate },
      OR: [{ endDate: null }, { endDate: { gte: startDate } }],
    },
    include: {
      exceptions: { where: { exceptionDate: { gte: startDate, lte: endDate } } },
      role: { select: { id: true, name: true, colour: true } },
    },
  })

  // 3. Expand patterns into virtual instances
  const virtualSlots: ResolvedTimeSlot[] = []
  const materialisedKeys = new Set(
    concreteSlots.filter(s => s.repeatPatternId).map(s => `${s.repeatPatternId}:${s.date.toISOString().slice(0, 10)}`)
  )

  for (const pattern of patterns) {
    const expanded = expandPattern(pattern, startDate, endDate, pattern.exceptions)
    for (const slot of expanded) {
      // Skip if already materialised as a concrete slot
      const key = `${pattern.id}:${slot.date}`
      if (materialisedKeys.has(key)) continue
      virtualSlots.push(slot)
    }
  }

  // 4. Convert concrete slots to ResolvedTimeSlot format
  const resolved: ResolvedTimeSlot[] = concreteSlots.map(s => ({
    id: s.id,
    roleId: s.roleId,
    date: s.date.toISOString().slice(0, 10),
    startMinutes: s.startMinutes,
    endMinutes: s.endMinutes,
    capacityMinutes: s.capacityMinutes,
    usedMinutes: s.usedMinutes,
    taskCount: s.taskCount,
    title: s.title,
    isVirtual: false,
    repeatPatternId: s.repeatPatternId,
  }))

  // 5. Merge and sort
  const all = [...resolved, ...virtualSlots]
  all.sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes)
  return all
}

export async function createTimeSlot(data: CreateTimeSlotInput, userId: string) {
  const role = await prisma.role.findFirst({ where: { id: data.roleId, userId } })
  if (!role) return null

  return prisma.timeSlot.create({
    data: {
      roleId: data.roleId,
      date: new Date(data.date),
      startMinutes: data.startMinutes,
      endMinutes: data.endMinutes,
      capacityMinutes: data.endMinutes - data.startMinutes,
      title: data.title ?? "",
      userId,
    },
  })
}

export async function updateTimeSlot(id: string, data: UpdateTimeSlotInput, userId: string) {
  const slot = await prisma.timeSlot.findFirst({ where: { id, userId } })
  if (!slot) return null

  const startMinutes = data.startMinutes ?? slot.startMinutes
  const endMinutes = data.endMinutes ?? slot.endMinutes
  if (endMinutes <= startMinutes) throw new Error("End time must be after start time")

  return prisma.timeSlot.update({
    where: { id },
    data: {
      ...data,
      capacityMinutes: endMinutes - startMinutes,
    },
  })
}

export async function deleteTimeSlot(id: string, userId: string) {
  const slot = await prisma.timeSlot.findFirst({ where: { id, userId } })
  if (!slot) throw new Error("Slot not found")
  if (slot.taskCount > 0) throw new Error("Slot has assigned tasks. Reschedule them first.")
  await prisma.timeSlot.delete({ where: { id } })
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/services/time-slots.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/time-slots.ts __tests__/services/time-slots.test.ts
git commit -m "feat: time slot service with CRUD and range query"
```

---

### Task 5: RepeatPattern Service with Tests

**Files:**
- Create: `lib/services/repeat-patterns.ts`
- Create: `__tests__/services/repeat-patterns.test.ts`

- [ ] **Step 1: Write repeat pattern service tests**

Create `__tests__/services/repeat-patterns.test.ts`:

```typescript
import { createRepeatPattern, deleteRepeatPattern, modifyRepeatInstance, skipRepeatInstance } from "@/lib/services/repeat-patterns"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    repeatPattern: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    repeatException: {
      upsert: jest.fn(),
    },
    timeSlot: {
      findFirst: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock("@/lib/services/repeat-expand", () => ({
  isValidInstanceDate: jest.fn(() => true),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("createRepeatPattern", () => {
  it("creates a pattern with valid data", async () => {
    mockPrisma.role.findFirst.mockResolvedValue({ id: "r1", userId: "u1" } as any)
    mockPrisma.repeatPattern.create.mockResolvedValue({ id: "rp1", repeatType: "weekly" } as any)
    const result = await createRepeatPattern({
      roleId: "r1", repeatType: "weekly", intervalValue: 1,
      startDate: "2026-05-01", endDate: null,
      dayPattern: { days: [1, 3, 5] }, startMinutes: 540, endMinutes: 720, title: "Work"
    }, "u1")
    expect(result).toBeTruthy()
  })
})

describe("deleteRepeatPattern", () => {
  it("deletes pattern with scope 'all'", async () => {
    mockPrisma.repeatPattern.findFirst.mockResolvedValue({ id: "rp1", userId: "u1" } as any)
    mockPrisma.repeatPattern.delete.mockResolvedValue({} as any)
    await deleteRepeatPattern("rp1", "all", "u1")
    expect(mockPrisma.repeatPattern.delete).toHaveBeenCalledWith({ where: { id: "rp1" } })
  })

  it("sets endDate for scope 'future'", async () => {
    mockPrisma.repeatPattern.findFirst.mockResolvedValue({ id: "rp1", userId: "u1" } as any)
    mockPrisma.repeatPattern.update.mockResolvedValue({} as any)
    await deleteRepeatPattern("rp1", "future", "u1")
    expect(mockPrisma.repeatPattern.update).toHaveBeenCalledWith({
      where: { id: "rp1" },
      data: expect.objectContaining({ endDate: expect.any(Date) }),
    })
  })
})

describe("modifyRepeatInstance", () => {
  it("creates a modified exception", async () => {
    mockPrisma.repeatPattern.findFirst.mockResolvedValue({ id: "rp1", userId: "u1", startDate: new Date("2026-04-01"), endDate: null, repeatType: "daily", intervalValue: 1, dayPattern: {} } as any)
    mockPrisma.repeatException.upsert.mockResolvedValue({ id: "e1", exceptionType: "modified" } as any)
    const result = await modifyRepeatInstance("rp1", "2026-04-05", { startMinutes: 600 }, "u1")
    expect(result.exceptionType).toBe("modified")
  })
})

describe("skipRepeatInstance", () => {
  it("creates a skipped exception", async () => {
    mockPrisma.repeatPattern.findFirst.mockResolvedValue({ id: "rp1", userId: "u1", startDate: new Date("2026-04-01"), endDate: null, repeatType: "daily", intervalValue: 1, dayPattern: {} } as any)
    mockPrisma.timeSlot.findFirst.mockResolvedValue(null) // no materialised slot
    mockPrisma.repeatException.upsert.mockResolvedValue({ id: "e1", exceptionType: "skipped" } as any)
    const result = await skipRepeatInstance("rp1", "2026-04-05", "u1")
    expect(result.exceptionType).toBe("skipped")
  })

  it("rejects skip when materialised slot has tasks", async () => {
    mockPrisma.repeatPattern.findFirst.mockResolvedValue({ id: "rp1", userId: "u1", startDate: new Date("2026-04-01"), endDate: null, repeatType: "daily", intervalValue: 1, dayPattern: {} } as any)
    mockPrisma.timeSlot.findFirst.mockResolvedValue({ id: "ts1", taskCount: 2 } as any)
    await expect(skipRepeatInstance("rp1", "2026-04-05", "u1")).rejects.toThrow("tasks")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/repeat-patterns.test.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: Implement repeat pattern service**

Create `lib/services/repeat-patterns.ts`:

```typescript
import { prisma } from "@/lib/db"
import { isValidInstanceDate } from "@/lib/services/repeat-expand"
import type { CreateRepeatPatternInput, UpdateRepeatPatternInput, ModifyInstanceInput } from "@/lib/validations/repeat-pattern"

export async function createRepeatPattern(data: CreateRepeatPatternInput, userId: string) {
  const role = await prisma.role.findFirst({ where: { id: data.roleId, userId } })
  if (!role) return null

  return prisma.repeatPattern.create({
    data: {
      roleId: data.roleId,
      repeatType: data.repeatType,
      intervalValue: data.intervalValue,
      startDate: new Date(data.startDate),
      endDate: data.endDate ? new Date(data.endDate) : null,
      dayPattern: data.dayPattern,
      startMinutes: data.startMinutes,
      endMinutes: data.endMinutes,
      title: data.title ?? "",
      userId,
    },
  })
}

export async function updateRepeatPattern(id: string, data: UpdateRepeatPatternInput, userId: string) {
  const pattern = await prisma.repeatPattern.findFirst({ where: { id, userId } })
  if (!pattern) return null

  return prisma.repeatPattern.update({
    where: { id },
    data: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate !== undefined ? (data.endDate ? new Date(data.endDate) : null) : undefined,
    },
  })
}

export async function deleteRepeatPattern(id: string, scope: "all" | "future", userId: string) {
  const pattern = await prisma.repeatPattern.findFirst({ where: { id, userId } })
  if (!pattern) throw new Error("Pattern not found")

  if (scope === "all") {
    // Cascade deletes exceptions; SetNull on materialised TimeSlots
    await prisma.repeatPattern.delete({ where: { id } })
  } else {
    // Set end date to today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    await prisma.repeatPattern.update({
      where: { id },
      data: { endDate: today },
    })
  }
}

export async function modifyRepeatInstance(patternId: string, dateStr: string, data: ModifyInstanceInput, userId: string) {
  const pattern = await prisma.repeatPattern.findFirst({ where: { id: patternId, userId } })
  if (!pattern) throw new Error("Pattern not found")

  const date = new Date(dateStr)
  if (!isValidInstanceDate(pattern as any, date)) {
    throw new Error("Date is not a valid instance of this pattern")
  }

  return prisma.repeatException.upsert({
    where: { repeatPatternId_exceptionDate: { repeatPatternId: patternId, exceptionDate: date } },
    create: {
      repeatPatternId: patternId,
      exceptionDate: date,
      exceptionType: "modified",
      modifiedStartMinutes: data.startMinutes ?? null,
      modifiedEndMinutes: data.endMinutes ?? null,
      modifiedTitle: data.title ?? null,
      userId,
    },
    update: {
      exceptionType: "modified",
      modifiedStartMinutes: data.startMinutes ?? null,
      modifiedEndMinutes: data.endMinutes ?? null,
      modifiedTitle: data.title ?? null,
    },
  })
}

export async function skipRepeatInstance(patternId: string, dateStr: string, userId: string) {
  const pattern = await prisma.repeatPattern.findFirst({ where: { id: patternId, userId } })
  if (!pattern) throw new Error("Pattern not found")

  const date = new Date(dateStr)
  if (!isValidInstanceDate(pattern as any, date)) {
    throw new Error("Date is not a valid instance of this pattern")
  }

  // Check if there's a materialised slot with tasks
  const materialised = await prisma.timeSlot.findFirst({
    where: { repeatPatternId: patternId, date, userId },
  })
  if (materialised && materialised.taskCount > 0) {
    throw new Error("Cannot skip instance with assigned tasks. Reschedule them first.")
  }

  return prisma.repeatException.upsert({
    where: { repeatPatternId_exceptionDate: { repeatPatternId: patternId, exceptionDate: date } },
    create: {
      repeatPatternId: patternId,
      exceptionDate: date,
      exceptionType: "skipped",
      userId,
    },
    update: {
      exceptionType: "skipped",
      modifiedStartMinutes: null,
      modifiedEndMinutes: null,
      modifiedTitle: null,
    },
  })
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/services/repeat-patterns.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/repeat-patterns.ts __tests__/services/repeat-patterns.test.ts
git commit -m "feat: repeat pattern service with instance modify/skip"
```

---

### Task 6: API Routes

**Files:**
- Create: `app/api/v1/time-slots/route.ts`
- Create: `app/api/v1/time-slots/[id]/route.ts`
- Create: `app/api/v1/repeat-patterns/route.ts`
- Create: `app/api/v1/repeat-patterns/[id]/route.ts`
- Create: `app/api/v1/repeat-patterns/[id]/instances/[date]/modify/route.ts`
- Create: `app/api/v1/repeat-patterns/[id]/instances/[date]/skip/route.ts`

- [ ] **Step 1: Create time slot list/create route**

Create `app/api/v1/time-slots/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listTimeSlotsForRange, createTimeSlot } from "@/lib/services/time-slots"
import { CreateTimeSlotSchema } from "@/lib/validations/time-slot"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const from = req.nextUrl.searchParams.get("from")
  const to = req.nextUrl.searchParams.get("to")
  if (!from || !to) return NextResponse.json({ error: "from and to query params required" }, { status: 400 })

  const slots = await listTimeSlotsForRange(session.userId, new Date(from), new Date(to))
  return NextResponse.json(slots)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = CreateTimeSlotSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })

  const slot = await createTimeSlot(parsed.data, session.userId)
  if (!slot) return NextResponse.json({ error: "Role not found or not owned" }, { status: 404 })
  return NextResponse.json(slot, { status: 201 })
}
```

- [ ] **Step 2: Create time slot update/delete route**

Create `app/api/v1/time-slots/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateTimeSlot, deleteTimeSlot } from "@/lib/services/time-slots"
import { UpdateTimeSlotSchema } from "@/lib/validations/time-slot"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = UpdateTimeSlotSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })

  try {
    const slot = await updateTimeSlot(id, parsed.data, session.userId)
    if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(slot)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  try {
    await deleteTimeSlot(id, session.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 400 })
  }
}
```

- [ ] **Step 3: Create repeat pattern routes**

Create `app/api/v1/repeat-patterns/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createRepeatPattern } from "@/lib/services/repeat-patterns"
import { CreateRepeatPatternSchema } from "@/lib/validations/repeat-pattern"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = CreateRepeatPatternSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })

  const pattern = await createRepeatPattern(parsed.data, session.userId)
  if (!pattern) return NextResponse.json({ error: "Role not found or not owned" }, { status: 404 })
  return NextResponse.json(pattern, { status: 201 })
}
```

Create `app/api/v1/repeat-patterns/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateRepeatPattern, deleteRepeatPattern } from "@/lib/services/repeat-patterns"
import { UpdateRepeatPatternSchema } from "@/lib/validations/repeat-pattern"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = UpdateRepeatPatternSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })

  const pattern = await updateRepeatPattern(id, parsed.data, session.userId)
  if (!pattern) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(pattern)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const scope = req.nextUrl.searchParams.get("scope") as "all" | "future" | null
  if (scope !== "all" && scope !== "future") {
    return NextResponse.json({ error: "scope query param must be 'all' or 'future'" }, { status: 400 })
  }

  try {
    await deleteRepeatPattern(id, scope, session.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 400 })
  }
}
```

- [ ] **Step 4: Create instance modify/skip routes**

Create `app/api/v1/repeat-patterns/[id]/instances/[date]/modify/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { modifyRepeatInstance } from "@/lib/services/repeat-patterns"
import { ModifyInstanceSchema } from "@/lib/validations/repeat-pattern"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; date: string }> }) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, date } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = ModifyInstanceSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })

  try {
    const exception = await modifyRepeatInstance(id, date, parsed.data, session.userId)
    return NextResponse.json(exception)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Modify failed" }, { status: 400 })
  }
}
```

Create `app/api/v1/repeat-patterns/[id]/instances/[date]/skip/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { skipRepeatInstance } from "@/lib/services/repeat-patterns"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; date: string }> }) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, date } = await params

  try {
    const exception = await skipRepeatInstance(id, date, session.userId)
    return NextResponse.json(exception)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Skip failed" }, { status: 400 })
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/time-slots/ app/api/v1/repeat-patterns/
git commit -m "feat: API routes for time slots and repeat patterns"
```

---

### Task 7: Calendar Page - Fetch Time Slots

**Files:**
- Modify: `app/(dashboard)/calendar/page.tsx`
- Modify: `components/calendar/calendar-view.tsx`

- [ ] **Step 1: Fetch time slots in calendar page**

In `app/(dashboard)/calendar/page.tsx`, add a time slots fetch alongside existing queries. Import `listTimeSlotsForRange` from the service. Calculate the date range based on a 42-day window (same as current Google events fetch). Pass the resolved slots to CalendarView as a new prop.

Add to the Promise.all:
```typescript
import { listTimeSlotsForRange, type ResolvedTimeSlot } from "@/lib/services/time-slots"

// In the Promise.all, add:
userId ? listTimeSlotsForRange(userId, new Date(), addDays(new Date(), 42)) : Promise.resolve([]),
```

Pass to CalendarView:
```typescript
<CalendarView items={items} filters={filters} timeSlots={timeSlots} />
```

- [ ] **Step 2: Add timeSlots prop to CalendarView**

In `components/calendar/calendar-view.tsx`, extend the props interface:

```typescript
import type { ResolvedTimeSlot } from "@/lib/services/time-slots"

interface CalendarViewProps {
  items: CalendarItem[]
  filters: CalendarFilters
  timeSlots?: ResolvedTimeSlot[]
}
```

Pass `timeSlots` to each view component (MonthView, WeekView, AgendaView).

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/calendar/page.tsx" components/calendar/calendar-view.tsx
git commit -m "feat: fetch and pass time slots to calendar views"
```

---

### Task 8: Week View - Time Grid

**Files:**
- Modify: `components/calendar/calendar-view.tsx`

- [ ] **Step 1: Transform WeekView into a time-grid**

Replace the existing WeekView function with a time-grid layout. This is the largest UI change.

The new WeekView:
- Shows hours 06:00-22:00 on the y-axis (16 hours, each hour = 60px height)
- 7 day columns on the x-axis
- All-day items (CalendarItem[]) render in a header row above the grid
- Time slots render as absolutely-positioned coloured blocks within the grid, positioned by startMinutes/endMinutes
- Google Calendar events from CalendarItem[] with type "google_event" render as grey outlined blocks (position estimated from time if available, or as all-day if no time)
- Each slot block shows: title or role name, and a capacity bar (usedMinutes / capacityMinutes)
- Today's column is highlighted

Key implementation details:
- The grid container has `position: relative` with `height: 960px` (16 hours x 60px)
- Each slot is `position: absolute` with `top: (startMinutes - 360) * (60/60)px` and `height: (endMinutes - startMinutes) * 1px` (where 360 = 06:00 in minutes)
- Use role colour for the slot background with opacity
- Click on empty grid space: no action in this task (creation UI comes in Task 9)

The existing CalendarItem items that are NOT google_events go in the all-day header. Google events also go in the all-day header for now (they don't carry time info in the current CalendarItem type).

- [ ] **Step 2: Commit**

```bash
git add components/calendar/calendar-view.tsx
git commit -m "feat: transform week view into time-grid with slot blocks"
```

---

### Task 9: Month View Capacity Indicators and Agenda Slots

**Files:**
- Modify: `components/calendar/calendar-view.tsx`

- [ ] **Step 1: Add capacity indicators to month view**

In the MonthView component, for each day cell, calculate total slot hours per role from the timeSlots prop. Below the existing item dots, render small coloured bar segments showing the capacity breakdown. Each segment width is proportional to that role's total hours relative to the day's total.

- [ ] **Step 2: Add time slots to agenda view**

In the AgendaView component, merge time slots into the items list. For each date, show time slots before all-day items. Each slot entry shows:
- Role colour dot
- Time range formatted as "HH:MM - HH:MM" (convert minutes to time)
- Title or role name
- Usage bar (width based on usedMinutes / capacityMinutes percentage)

- [ ] **Step 3: Commit**

```bash
git add components/calendar/calendar-view.tsx
git commit -m "feat: month view capacity indicators and agenda slot entries"
```

---

### Task 10: Slot Creation and Edit UI

**Files:**
- Modify: `components/calendar/calendar-view.tsx`
- Modify: `app/(dashboard)/calendar/page.tsx`

- [ ] **Step 1: Add slot creation modal/form**

Add an "Add Time Slot" button to the calendar page header (next to the view toggle buttons). Clicking it opens a modal/inline form with:
- Role dropdown (fetch roles from `/api/v1/roles`)
- Date picker
- Start time input (type="time")
- End time input (type="time")
- Title input (optional)
- "Make Repeating" checkbox - when checked, reveals:
  - Repeat type dropdown (daily/weekly/monthly by date/monthly by day/yearly by date/yearly by day)
  - Interval input ("Every N ...")
  - For weekly: day checkboxes (Mon-Sun)
  - End date picker or "Forever" checkbox

Submit calls either `POST /api/v1/time-slots` (one-off) or `POST /api/v1/repeat-patterns` (repeating). On success, refresh the calendar data.

The time inputs convert to/from minutes (e.g. "09:00" = 540, "17:00" = 1020).

- [ ] **Step 2: Add slot edit/delete for concrete slots**

When clicking a concrete (non-virtual) slot block in the week view, show an edit form with the same fields pre-populated. Add a delete button. Submit calls `PUT /api/v1/time-slots/:id` or `DELETE /api/v1/time-slots/:id`.

- [ ] **Step 3: Add repeat instance edit/skip/delete prompts**

When clicking a virtual (repeat) slot block, show a prompt with three options:
- "Edit this occurrence" - opens edit form, submits to `POST /api/v1/repeat-patterns/:id/instances/:date/modify`
- "Skip this occurrence" - confirms, submits to `POST /api/v1/repeat-patterns/:id/instances/:date/skip`
- "Edit entire pattern" - opens edit form with pattern fields, submits to `PUT /api/v1/repeat-patterns/:id`
- "Delete entire pattern" - confirms, submits to `DELETE /api/v1/repeat-patterns/:id?scope=all`

- [ ] **Step 4: Commit**

```bash
git add components/calendar/calendar-view.tsx "app/(dashboard)/calendar/page.tsx"
git commit -m "feat: slot creation, editing, and repeat instance management UI"
```

---

### Task 11: Full Test Suite and Push

**Files:** None new

- [ ] **Step 1: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Push all commits**

Run: `git push`
