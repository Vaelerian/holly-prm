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
  const defaults = getDefaultSchedulingPrefs()
  const pref = await prisma.userPreference.findUnique({ where: { userId } })
  if (!pref) return defaults

  // UserPreference stores scheduling overrides in a JSON field; merge with defaults
  const filters = pref.calendarFilters as Record<string, unknown> | null
  if (!filters || typeof filters !== "object") return defaults

  const scheduling = (filters as Record<string, unknown>).scheduling as Record<string, number> | undefined
  if (!scheduling || typeof scheduling !== "object") return defaults

  return {
    asapDays: typeof scheduling.asapDays === "number" ? scheduling.asapDays : defaults.asapDays,
    soonDays: typeof scheduling.soonDays === "number" ? scheduling.soonDays : defaults.soonDays,
    sometimeDays: typeof scheduling.sometimeDays === "number" ? scheduling.sometimeDays : defaults.sometimeDays,
    scanAheadDays: typeof scheduling.scanAheadDays === "number" ? scheduling.scanAheadDays : defaults.scanAheadDays,
    sizeMinutes: typeof scheduling.sizeMinutes === "number" ? scheduling.sizeMinutes : defaults.sizeMinutes,
    sizeHour: typeof scheduling.sizeHour === "number" ? scheduling.sizeHour : defaults.sizeHour,
    sizeHalfDay: typeof scheduling.sizeHalfDay === "number" ? scheduling.sizeHalfDay : defaults.sizeHalfDay,
    sizeDay: typeof scheduling.sizeDay === "number" ? scheduling.sizeDay : defaults.sizeDay,
  }
}

export function resolveEffortMinutes(
  task: { effortMinutes: number | null; effortSize: string },
  prefs: SchedulingPrefs
): number {
  // Explicit effortMinutes override wins
  if (task.effortMinutes !== null && task.effortMinutes !== undefined) {
    return task.effortMinutes
  }

  switch (task.effortSize) {
    case "minutes":
      return prefs.sizeMinutes
    case "hour":
      return prefs.sizeHour
    case "half_day":
      return prefs.sizeHalfDay
    case "day":
      return prefs.sizeDay
    case "project_size":
      return prefs.sizeDay * 2
    case "milestone":
      return 0
    case "undefined_size":
    default:
      return 0
  }
}

const importanceLevels = ["bonus", "step", "core"] as const

export function calculateEffectiveImportance(
  importance: string,
  projectImportance: string | null
): string {
  if (importance === "undefined_imp") return "undefined_imp"
  if (!projectImportance || projectImportance === "same") return importance

  const idx = importanceLevels.indexOf(importance as (typeof importanceLevels)[number])
  if (idx === -1) return importance

  if (projectImportance === "more") {
    // Promote by one level (toward core)
    const newIdx = Math.min(idx + 1, importanceLevels.length - 1)
    return importanceLevels[newIdx]
  }

  if (projectImportance === "less") {
    // Demote by one level (toward bonus)
    const newIdx = Math.max(idx - 1, 0)
    return importanceLevels[newIdx]
  }

  return importance
}

export function importanceToSortOrder(importance: string): number {
  switch (importance) {
    case "core":
      return 1
    case "step":
      return 2
    case "bonus":
      return 3
    case "undefined_imp":
    default:
      return 99
  }
}

export function urgencyToSortOrder(urgency: string): number {
  switch (urgency) {
    case "dated":
      return 1
    case "asap":
      return 2
    case "soon":
      return 3
    case "sometime":
      return 4
    case "undefined_urg":
    default:
      return 99
  }
}
