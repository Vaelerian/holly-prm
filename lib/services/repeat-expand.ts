/**
 * Repeat expansion engine - pure functions for expanding repeat patterns
 * into date instances. No database access.
 */

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
}

export interface AssignedTaskInfo {
  id: string
  title: string
  effortSize: string
  scheduleState: string
  projectId: string | null
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
  assignedTasks?: AssignedTaskInfo[]
}

/** Format a Date as "YYYY-MM-DD" in UTC. */
export function toDateStr(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Parse a "YYYY-MM-DD" string into a UTC Date at midnight. */
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Get ISO weekday (1=Monday ... 7=Sunday) from a UTC Date. */
function isoWeekday(d: Date): number {
  const dow = d.getUTCDay() // 0=Sunday
  return dow === 0 ? 7 : dow
}

/** Add N days to a UTC Date and return a new Date. */
function addDays(d: Date, n: number): Date {
  const result = new Date(d.getTime())
  result.setUTCDate(result.getUTCDate() + n)
  return result
}

/** Get the Nth occurrence of a weekday in a given month (1-indexed).
 *  Returns null if that occurrence does not exist. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date | null {
  // Find the first occurrence of the weekday in the month
  const first = new Date(Date.UTC(year, month, 1))
  const firstDow = isoWeekday(first)
  let dayOfMonth = 1 + ((weekday - firstDow + 7) % 7)
  dayOfMonth += (nth - 1) * 7

  // Check it still falls within the month
  const candidate = new Date(Date.UTC(year, month, dayOfMonth))
  if (candidate.getUTCMonth() !== month) return null
  return candidate
}

/** Check whether a date is on or after rangeStart and before or on rangeEnd. */
function inRange(d: Date, rangeStart: Date, rangeEnd: Date): boolean {
  return d >= rangeStart && d <= rangeEnd
}

/** Build the exception lookup map keyed by YYYY-MM-DD. */
function buildExceptionMap(exceptions: RepeatExceptionData[]): Map<string, RepeatExceptionData> {
  const map = new Map<string, RepeatExceptionData>()
  for (const ex of exceptions) {
    map.set(toDateStr(ex.exceptionDate), ex)
  }
  return map
}

/** Build a ResolvedTimeSlot from a pattern and date string. */
function makeVirtualSlot(
  pattern: RepeatPatternData,
  dateStr: string,
  startMin: number,
  endMin: number,
  title: string
): ResolvedTimeSlot {
  return {
    id: `rp:${pattern.id}:${dateStr}`,
    roleId: pattern.roleId,
    date: dateStr,
    startMinutes: startMin,
    endMinutes: endMin,
    capacityMinutes: endMin - startMin,
    usedMinutes: 0,
    taskCount: 0,
    title,
    isVirtual: true,
    repeatPatternId: pattern.id,
  }
}

/**
 * Expand a repeat pattern into virtual time slot instances for a date range.
 * Applies exceptions: "skipped" removes the date, "modified" overrides fields.
 */
export function expandPattern(
  pattern: RepeatPatternData,
  rangeStart: Date,
  rangeEnd: Date,
  exceptions: RepeatExceptionData[] = []
): ResolvedTimeSlot[] {
  const exMap = buildExceptionMap(exceptions)
  const rawDates = generateDates(pattern, rangeStart, rangeEnd)
  const slots: ResolvedTimeSlot[] = []

  for (const d of rawDates) {
    const dateStr = toDateStr(d)
    const ex = exMap.get(dateStr)

    if (ex && ex.exceptionType === "skipped") continue

    let startMin = pattern.startMinutes
    let endMin = pattern.endMinutes
    let title = pattern.title

    if (ex && ex.exceptionType === "modified") {
      if (ex.modifiedStartMinutes !== null) startMin = ex.modifiedStartMinutes
      if (ex.modifiedEndMinutes !== null) endMin = ex.modifiedEndMinutes
      if (ex.modifiedTitle !== null) title = ex.modifiedTitle
    }

    slots.push(makeVirtualSlot(pattern, dateStr, startMin, endMin, title))
  }

  return slots
}

/** Generate raw dates for a pattern within a range (before exceptions). */
function generateDates(pattern: RepeatPatternData, rangeStart: Date, rangeEnd: Date): Date[] {
  // Effective end is the earlier of pattern.endDate and rangeEnd
  const effectiveEnd = pattern.endDate && pattern.endDate < rangeEnd
    ? pattern.endDate
    : rangeEnd

  switch (pattern.repeatType) {
    case "daily":
      return generateDaily(pattern, rangeStart, effectiveEnd)
    case "weekly":
      return generateWeekly(pattern, rangeStart, effectiveEnd)
    case "monthly_by_date":
      return generateMonthlyByDate(pattern, rangeStart, effectiveEnd)
    case "monthly_by_day":
      return generateMonthlyByDay(pattern, rangeStart, effectiveEnd)
    case "yearly_by_date":
      return generateYearlyByDate(pattern, rangeStart, effectiveEnd)
    case "yearly_by_day":
      return generateYearlyByDay(pattern, rangeStart, effectiveEnd)
    default:
      return []
  }
}

function generateDaily(pattern: RepeatPatternData, rangeStart: Date, rangeEnd: Date): Date[] {
  const dates: Date[] = []
  const start = pattern.startDate

  // Find the first occurrence on or after rangeStart
  if (start > rangeEnd) return dates

  // Calculate how many intervals from startDate to rangeStart
  const diffMs = rangeStart.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  const intervalDays = pattern.intervalValue

  let skipIntervals = Math.max(0, Math.floor(diffDays / intervalDays))
  let cursor = addDays(start, skipIntervals * intervalDays)

  // Make sure cursor is >= rangeStart
  while (cursor < rangeStart) {
    cursor = addDays(cursor, intervalDays)
  }

  while (cursor <= rangeEnd) {
    dates.push(cursor)
    cursor = addDays(cursor, intervalDays)
  }

  return dates
}

function generateWeekly(pattern: RepeatPatternData, rangeStart: Date, rangeEnd: Date): Date[] {
  const dates: Date[] = []
  const days = ((pattern.dayPattern as { days?: number[] }).days) || []
  if (days.length === 0) return dates

  const start = pattern.startDate
  if (start > rangeEnd) return dates

  const intervalWeeks = pattern.intervalValue

  // Find the Monday of the start week
  const startWeekday = isoWeekday(start)
  const startMonday = addDays(start, -(startWeekday - 1))

  // Find the first Monday that could produce dates in our range
  const diffMs = rangeStart.getTime() - startMonday.getTime()
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000))
  let skipWeeks = Math.max(0, Math.floor(diffWeeks / intervalWeeks) * intervalWeeks)
  let mondayCursor = addDays(startMonday, skipWeeks * 7)

  // Step back one interval to catch any days we might miss
  if (skipWeeks >= intervalWeeks) {
    mondayCursor = addDays(mondayCursor, -intervalWeeks * 7)
  }

  while (mondayCursor <= rangeEnd) {
    for (const day of days) {
      const d = addDays(mondayCursor, day - 1) // day 1 = Monday = offset 0
      if (d >= start && inRange(d, rangeStart, rangeEnd)) {
        dates.push(d)
      }
    }
    mondayCursor = addDays(mondayCursor, intervalWeeks * 7)
  }

  // Sort by date
  dates.sort((a, b) => a.getTime() - b.getTime())
  return dates
}

function generateMonthlyByDate(pattern: RepeatPatternData, rangeStart: Date, rangeEnd: Date): Date[] {
  const dates: Date[] = []
  const targetDates = ((pattern.dayPattern as { dates?: number[] }).dates) || []
  if (targetDates.length === 0) return dates

  const start = pattern.startDate
  if (start > rangeEnd) return dates

  // Start from the month of rangeStart or startDate, whichever is later
  const effectiveStart = start > rangeStart ? start : rangeStart
  let year = effectiveStart.getUTCFullYear()
  let month = effectiveStart.getUTCMonth()

  // Calculate month offset from pattern start
  const startYear = start.getUTCFullYear()
  const startMonth = start.getUTCMonth()
  const totalMonthsFromStart = (year - startYear) * 12 + (month - startMonth)

  // Align to interval
  const remainder = totalMonthsFromStart % pattern.intervalValue
  if (remainder !== 0) {
    const advance = pattern.intervalValue - remainder
    month += advance
    year += Math.floor(month / 12)
    month = month % 12
  }

  while (true) {
    for (const dayOfMonth of targetDates) {
      const candidate = new Date(Date.UTC(year, month, dayOfMonth))
      // Check the date didn't overflow to next month (e.g. Feb 30 -> Mar 2)
      if (candidate.getUTCMonth() !== month) continue
      if (candidate > rangeEnd) continue
      if (candidate < start) continue
      if (candidate >= rangeStart) {
        dates.push(candidate)
      }
    }

    // Advance by interval months
    month += pattern.intervalValue
    year += Math.floor(month / 12)
    month = month % 12

    if (new Date(Date.UTC(year, month, 1)) > rangeEnd) break
  }

  dates.sort((a, b) => a.getTime() - b.getTime())
  return dates
}

function generateMonthlyByDay(pattern: RepeatPatternData, rangeStart: Date, rangeEnd: Date): Date[] {
  const dates: Date[] = []
  const dp = pattern.dayPattern as { weekday?: number; nth?: number }
  const weekday = dp.weekday
  const nth = dp.nth
  if (weekday === undefined || nth === undefined) return dates

  const start = pattern.startDate
  if (start > rangeEnd) return dates

  const effectiveStart = start > rangeStart ? start : rangeStart
  let year = effectiveStart.getUTCFullYear()
  let month = effectiveStart.getUTCMonth()

  // Align to interval
  const startYear = start.getUTCFullYear()
  const startMonth = start.getUTCMonth()
  const totalMonthsFromStart = (year - startYear) * 12 + (month - startMonth)
  const remainder = totalMonthsFromStart % pattern.intervalValue
  if (remainder !== 0) {
    const advance = pattern.intervalValue - remainder
    month += advance
    year += Math.floor(month / 12)
    month = month % 12
  }

  while (true) {
    const candidate = nthWeekdayOfMonth(year, month, weekday, nth)
    if (candidate && candidate >= start && inRange(candidate, rangeStart, rangeEnd)) {
      dates.push(candidate)
    }

    month += pattern.intervalValue
    year += Math.floor(month / 12)
    month = month % 12

    if (new Date(Date.UTC(year, month, 1)) > rangeEnd) break
  }

  return dates
}

function generateYearlyByDate(pattern: RepeatPatternData, rangeStart: Date, rangeEnd: Date): Date[] {
  const dates: Date[] = []
  const dp = pattern.dayPattern as { month?: number; day?: number }
  if (dp.month === undefined || dp.day === undefined) return dates

  const start = pattern.startDate
  if (start > rangeEnd) return dates

  const effectiveStart = start > rangeStart ? start : rangeStart
  let year = effectiveStart.getUTCFullYear()

  // Align to interval from start year
  const yearOffset = year - start.getUTCFullYear()
  const remainder = yearOffset % pattern.intervalValue
  if (remainder !== 0) {
    year += pattern.intervalValue - remainder
  }

  while (true) {
    const candidate: Date = new Date(Date.UTC(year, dp.month, dp.day))
    // Check the date didn't overflow (e.g. Feb 29 in non-leap year)
    if (candidate.getUTCMonth() === dp.month && candidate >= start && inRange(candidate, rangeStart, rangeEnd)) {
      dates.push(candidate)
    }

    year += pattern.intervalValue
    if (new Date(Date.UTC(year, 0, 1)) > rangeEnd) break
  }

  return dates
}

function generateYearlyByDay(pattern: RepeatPatternData, rangeStart: Date, rangeEnd: Date): Date[] {
  const dates: Date[] = []
  const dp = pattern.dayPattern as { month?: number; weekday?: number; nth?: number }
  if (dp.month === undefined || dp.weekday === undefined || dp.nth === undefined) return dates

  const start = pattern.startDate
  if (start > rangeEnd) return dates

  const effectiveStart = start > rangeStart ? start : rangeStart
  let year = effectiveStart.getUTCFullYear()

  const yearOffset = year - start.getUTCFullYear()
  const remainder = yearOffset % pattern.intervalValue
  if (remainder !== 0) {
    year += pattern.intervalValue - remainder
  }

  while (true) {
    const candidate = nthWeekdayOfMonth(year, dp.month, dp.weekday, dp.nth)
    if (candidate && candidate >= start && inRange(candidate, rangeStart, rangeEnd)) {
      dates.push(candidate)
    }

    year += pattern.intervalValue
    if (new Date(Date.UTC(year, 0, 1)) > rangeEnd) break
  }

  return dates
}

/**
 * Check if a specific date is a valid instance of the pattern's recurrence.
 */
export function isValidInstanceDate(pattern: RepeatPatternData, date: Date): boolean {
  const dateStr = toDateStr(date)
  // Date must be on or after start
  if (date < pattern.startDate) return false
  // Date must be on or before end (if set)
  if (pattern.endDate && date > pattern.endDate) return false

  // Generate dates for just that one day and see if it matches
  const results = generateDates(pattern, date, date)
  return results.some(d => toDateStr(d) === dateStr)
}
