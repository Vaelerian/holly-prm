/**
 * Monday is treated as the first day of the week (UK convention) and matches
 * the calendar view in components/calendar/calendar-view.tsx. All boundaries
 * are computed in the server's local timezone, which is the same TZ used
 * everywhere else in the app for date math.
 */
export function startOfWeekMonday(date: Date = new Date()): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return d
}

/** ISO week label like "Week of 5 May 2026" for grouping on the Completed page. */
export function weekLabel(weekStart: Date): string {
  return `Week of ${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`
}
