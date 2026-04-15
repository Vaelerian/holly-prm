"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import type { ResolvedTimeSlot } from "@/lib/services/repeat-expand"

export type CalendarItemType = "task" | "project" | "follow_up" | "milestone" | "action_item" | "google_event"

export interface CalendarItem {
  id: string
  type: CalendarItemType
  title: string
  date: string // YYYY-MM-DD
  href?: string
}

interface CalendarFilters {
  tasks: boolean
  projects: boolean
  followUps: boolean
  milestones: boolean
  actionItems: boolean
  googleEvents: boolean
}

interface CalendarViewProps {
  items: CalendarItem[]
  filters: CalendarFilters
  timeSlots?: ResolvedTimeSlot[]
}

interface RoleOption {
  id: string
  name: string
  colour: string
}

type View = "month" | "week" | "agenda"

const TYPE_COLORS: Record<CalendarItemType, string> = {
  task: "bg-blue-500",
  project: "bg-purple-500",
  follow_up: "bg-yellow-500",
  milestone: "bg-[#00ff88]",
  action_item: "bg-orange-500",
  google_event: "bg-gray-500",
}

function filterItems(items: CalendarItem[], filters: CalendarFilters): CalendarItem[] {
  return items.filter(item => {
    if (item.type === "task" && !filters.tasks) return false
    if (item.type === "project" && !filters.projects) return false
    if (item.type === "follow_up" && !filters.followUps) return false
    if (item.type === "milestone" && !filters.milestones) return false
    if (item.type === "action_item" && !filters.actionItems) return false
    if (item.type === "google_event" && !filters.googleEvents) return false
    return true
  })
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toDateStr(date: Date): string {
  return date.toLocaleDateString("en-CA")
}

function minutesToTime(m: number): string {
  return `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`
}

const ROLE_FALLBACK_COLORS = [
  "#6366F1", "#EC4899", "#F59E0B", "#10B981", "#3B82F6",
  "#8B5CF6", "#EF4444", "#14B8A6", "#F97316", "#06B6D4",
]

function getRoleColor(roleId: string, roles: RoleOption[]): string {
  const role = roles.find(r => r.id === roleId)
  if (role) return role.colour
  let hash = 0
  for (let i = 0; i < roleId.length; i++) {
    hash = ((hash << 5) - hash + roleId.charCodeAt(i)) | 0
  }
  return ROLE_FALLBACK_COLORS[Math.abs(hash) % ROLE_FALLBACK_COLORS.length]
}

function CapacityBar({ usedMinutes, capacityMinutes, colour }: { usedMinutes: number; capacityMinutes: number; colour: string }) {
  const pct = capacityMinutes > 0 ? Math.min(100, Math.round((usedMinutes / capacityMinutes) * 100)) : 0
  return (
    <div className="w-full h-1 rounded-full bg-[rgba(255,255,255,0.06)] mt-0.5">
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, backgroundColor: colour }}
      />
    </div>
  )
}

// ─── Month View ───

function MonthView({
  items,
  currentDate,
  setCurrentDate,
  timeSlots = [],
  roles = [],
}: {
  items: CalendarItem[]
  currentDate: Date
  setCurrentDate: (d: Date) => void
  timeSlots?: ResolvedTimeSlot[]
  roles?: RoleOption[]
}) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<Date | null> = [...Array(startOffset).fill(null)]
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)

  const itemsByDate = new Map<string, CalendarItem[]>()
  for (const item of items) {
    const list = itemsByDate.get(item.date) ?? []
    list.push(item)
    itemsByDate.set(item.date, list)
  }

  // Group time slots by date then roleId with total minutes
  const slotsByDate = new Map<string, Map<string, number>>()
  for (const slot of timeSlots) {
    let dateMap = slotsByDate.get(slot.date)
    if (!dateMap) {
      dateMap = new Map()
      slotsByDate.set(slot.date, dateMap)
    }
    dateMap.set(slot.roleId, (dateMap.get(slot.roleId) ?? 0) + slot.capacityMinutes)
  }

  const monthLabel = currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="text-[#666688] hover:text-[#c0c0d0] px-2 py-1 text-sm">&#8249; Prev</button>
        <span className="text-sm font-semibold text-[#c0c0d0]">{monthLabel}</span>
        <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="text-[#666688] hover:text-[#c0c0d0] px-2 py-1 text-sm">Next &#8250;</button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-[rgba(0,255,136,0.08)] rounded-lg overflow-hidden">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="bg-[#111125] px-1 py-1 text-xs font-semibold text-[#666688] text-center">{d}</div>
        ))}
        {cells.map((day, i) => {
          const key = day ? toDateStr(day) : `empty-${i}`
          const dayItems = day ? (itemsByDate.get(toDateStr(day)) ?? []) : []
          const daySlotRoles = day ? slotsByDate.get(toDateStr(day)) : undefined
          const isToday = day ? toDateStr(day) === toDateStr(new Date()) : false
          return (
            <div key={key} className={`bg-[#111125] min-h-[80px] px-1 py-1 ${day ? "" : "opacity-30"}`}>
              {day && (
                <>
                  <span className={`text-xs ${isToday ? "text-[#00ff88] font-bold" : "text-[#666688]"}`}>{day.getDate()}</span>
                  <div className="mt-1 space-y-0.5">
                    {dayItems.slice(0, 3).map(item => (
                      item.href ? (
                        <Link key={item.id} href={item.href} className="block truncate text-xs text-[#c0c0d0] hover:text-[#00ff88]">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${TYPE_COLORS[item.type]}`} />
                          {item.title}
                        </Link>
                      ) : (
                        <div key={item.id} className="truncate text-xs text-[#c0c0d0]">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${TYPE_COLORS[item.type]}`} />
                          {item.title}
                        </div>
                      )
                    ))}
                    {dayItems.length > 3 && <div className="text-xs text-[#444466]">+{dayItems.length - 3} more</div>}
                  </div>
                  {/* Role capacity indicators */}
                  {daySlotRoles && daySlotRoles.size > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {Array.from(daySlotRoles.entries()).map(([roleId]) => (
                        <div
                          key={roleId}
                          className="h-1 rounded-full"
                          style={{ backgroundColor: getRoleColor(roleId, roles), opacity: 0.6 }}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week View (time-grid) ───

function WeekView({
  items,
  currentDate,
  setCurrentDate,
  timeSlots = [],
  roles = [],
  onSlotClick,
}: {
  items: CalendarItem[]
  currentDate: Date
  setCurrentDate: (d: Date) => void
  timeSlots?: ResolvedTimeSlot[]
  roles?: RoleOption[]
  onSlotClick?: (slot: ResolvedTimeSlot) => void
}) {
  const weekStart = new Date(currentDate)
  weekStart.setDate(currentDate.getDate() - currentDate.getDay())
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekLabel = `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} - ${addDays(weekStart, 6).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
  const todayStr = toDateStr(new Date())

  const itemsByDate = new Map<string, CalendarItem[]>()
  for (const item of items) {
    const list = itemsByDate.get(item.date) ?? []
    list.push(item)
    itemsByDate.set(item.date, list)
  }

  const slotsByDate = new Map<string, ResolvedTimeSlot[]>()
  for (const slot of timeSlots) {
    const list = slotsByDate.get(slot.date) ?? []
    list.push(slot)
    slotsByDate.set(slot.date, list)
  }

  const GRID_START = 360
  const GRID_END = 1320
  const GRID_HEIGHT = (GRID_END - GRID_START)
  const hours = Array.from({ length: 17 }, (_, i) => i + 6)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="text-[#666688] hover:text-[#c0c0d0] px-2 py-1 text-sm">&#8249; Prev</button>
        <span className="text-sm font-semibold text-[#c0c0d0]">{weekLabel}</span>
        <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="text-[#666688] hover:text-[#c0c0d0] px-2 py-1 text-sm">Next &#8250;</button>
      </div>

      {/* All-day header */}
      <div className="grid grid-cols-[48px_repeat(7,1fr)] gap-px bg-[rgba(0,255,136,0.08)] rounded-t-lg overflow-hidden">
        <div className="bg-[#111125] px-1 py-1 text-xs text-[#444466]">All day</div>
        {days.map(day => {
          const dateStr = toDateStr(day)
          const isToday = dateStr === todayStr
          const dayItems = itemsByDate.get(dateStr) ?? []
          return (
            <div key={dateStr} className={`bg-[#111125] px-1 py-1 min-h-[40px] ${isToday ? "bg-[rgba(0,255,136,0.03)]" : ""}`}>
              <div className={`text-xs font-semibold mb-1 ${isToday ? "text-[#00ff88]" : "text-[#666688]"}`}>
                {day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
              </div>
              <div className="space-y-0.5">
                {dayItems.slice(0, 2).map(item => (
                  item.href ? (
                    <Link key={item.id} href={item.href} className="block truncate text-[10px] text-[#c0c0d0] hover:text-[#00ff88]">
                      <span className={`inline-block w-1 h-1 rounded-full mr-0.5 ${TYPE_COLORS[item.type]}`} />
                      {item.title}
                    </Link>
                  ) : (
                    <div key={item.id} className="truncate text-[10px] text-[#c0c0d0]">
                      <span className={`inline-block w-1 h-1 rounded-full mr-0.5 ${TYPE_COLORS[item.type]}`} />
                      {item.title}
                    </div>
                  )
                ))}
                {dayItems.length > 2 && <div className="text-[10px] text-[#444466]">+{dayItems.length - 2}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="overflow-y-auto max-h-[600px] border border-[rgba(0,255,136,0.08)] rounded-b-lg">
        <div className="grid grid-cols-[48px_repeat(7,1fr)]" style={{ height: `${GRID_HEIGHT}px` }}>
          <div className="relative bg-[#0a0a1a]">
            {hours.map(h => (
              <div
                key={h}
                className="absolute text-[10px] text-[#444466] pr-1 text-right w-full"
                style={{ top: `${(h - 6) * 60}px` }}
              >
                {`${h.toString().padStart(2, "0")}:00`}
              </div>
            ))}
          </div>

          {days.map(day => {
            const dateStr = toDateStr(day)
            const isToday = dateStr === todayStr
            const daySlots = slotsByDate.get(dateStr) ?? []

            return (
              <div
                key={dateStr}
                className={`relative border-l border-[rgba(0,255,136,0.06)] ${isToday ? "bg-[rgba(0,255,136,0.02)]" : "bg-[#111125]"}`}
              >
                {hours.map(h => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-[rgba(255,255,255,0.04)]"
                    style={{ top: `${(h - 6) * 60}px` }}
                  />
                ))}

                {daySlots.map(slot => {
                  const top = Math.max(0, (slot.startMinutes - GRID_START))
                  const bottom = Math.min(GRID_HEIGHT, (slot.endMinutes - GRID_START))
                  const height = Math.max(12, bottom - top)
                  const colour = getRoleColor(slot.roleId, roles)

                  return (
                    <div
                      key={slot.id}
                      className="absolute left-0.5 right-0.5 rounded cursor-pointer hover:brightness-125 transition-all overflow-hidden"
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        backgroundColor: `${colour}15`,
                        borderLeft: `3px solid ${colour}`,
                      }}
                      onClick={() => onSlotClick?.(slot)}
                    >
                      <div className="px-1 py-0.5">
                        <div className="text-[10px] text-[#c0c0d0] truncate leading-tight">
                          {slot.title || "Time slot"}
                        </div>
                        {height > 24 && (
                          <div className="text-[9px] text-[#666688] leading-tight">
                            {minutesToTime(slot.startMinutes)} - {minutesToTime(slot.endMinutes)}
                          </div>
                        )}
                        {height > 36 && (
                          <CapacityBar
                            usedMinutes={slot.usedMinutes}
                            capacityMinutes={slot.capacityMinutes}
                            colour={colour}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Agenda View ───

function AgendaView({
  items,
  timeSlots = [],
  roles = [],
}: {
  items: CalendarItem[]
  timeSlots?: ResolvedTimeSlot[]
  roles?: RoleOption[]
}) {
  const today = toDateStr(new Date())
  const upcoming = items
    .filter(i => i.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const upcomingSlots = timeSlots
    .filter(s => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes)

  // Collect all dates
  const allDates = new Set<string>()
  for (const item of upcoming) allDates.add(item.date)
  for (const slot of upcomingSlots) allDates.add(slot.date)

  const byDate = new Map<string, { slots: ResolvedTimeSlot[]; items: CalendarItem[] }>()
  for (const date of allDates) {
    byDate.set(date, { slots: [], items: [] })
  }
  for (const item of upcoming) {
    byDate.get(item.date)!.items.push(item)
  }
  for (const slot of upcomingSlots) {
    byDate.get(slot.date)!.slots.push(slot)
  }

  const sortedDates = Array.from(byDate.keys()).sort()

  if (sortedDates.length === 0) {
    return <p className="text-sm text-[#666688]">No upcoming items in the next 30 days.</p>
  }

  return (
    <div className="space-y-4">
      {sortedDates.map(date => {
        const { slots, items: dateItems } = byDate.get(date)!
        return (
          <div key={date}>
            <div className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-2">
              {new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            <div className="space-y-1">
              {/* Time slots first */}
              {slots.map(slot => {
                const colour = getRoleColor(slot.roleId, roles)
                return (
                  <div key={slot.id} className="bg-[#111125] border border-[rgba(0,255,136,0.1)] rounded-lg px-3 py-2 flex items-center gap-2">
                    <span
                      className="flex-shrink-0 w-2 h-2 rounded-full"
                      style={{ backgroundColor: colour }}
                    />
                    <span className="text-xs text-[#666688] flex-shrink-0 w-24">
                      {minutesToTime(slot.startMinutes)} - {minutesToTime(slot.endMinutes)}
                    </span>
                    <span className="text-sm text-[#c0c0d0] truncate">{slot.title || "Time slot"}</span>
                    <div className="ml-auto flex-shrink-0 w-16">
                      <CapacityBar usedMinutes={slot.usedMinutes} capacityMinutes={slot.capacityMinutes} colour={colour} />
                    </div>
                  </div>
                )
              })}
              {/* Regular items */}
              {dateItems.map(item => (
                <div key={item.id} className="bg-[#111125] border border-[rgba(0,255,136,0.1)] rounded-lg px-3 py-2 flex items-center gap-2">
                  <span className={`flex-shrink-0 w-2 h-2 rounded-full ${TYPE_COLORS[item.type]}`} />
                  {item.href ? (
                    <Link href={item.href} className="text-sm text-[#c0c0d0] hover:text-[#00ff88] truncate">{item.title}</Link>
                  ) : (
                    <span className="text-sm text-[#c0c0d0] truncate">{item.title}</span>
                  )}
                  {item.type === "google_event" && <span className="ml-auto flex-shrink-0 text-xs text-[#444466] bg-[#0a0a1a] px-1.5 py-0.5 rounded">G</span>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main CalendarView ───

export function CalendarView({ items, filters, timeSlots = [] }: CalendarViewProps) {
  const [view, setView] = useState<View>("month")
  const [currentDate, setCurrentDate] = useState(new Date())
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [rolesLoaded, setRolesLoaded] = useState(false)

  useEffect(() => {
    const saved = sessionStorage.getItem("calendarView") as View | null
    if (saved) setView(saved)
  }, [])

  // Eagerly fetch roles once for colour mapping
  useEffect(() => {
    if (rolesLoaded || timeSlots.length === 0) return
    fetch("/api/v1/roles")
      .then(res => res.ok ? res.json() : [])
      .then(data => { setRoles(data); setRolesLoaded(true) })
      .catch(() => {})
  }, [rolesLoaded, timeSlots.length])

  function switchView(v: View) {
    setView(v)
    sessionStorage.setItem("calendarView", v)
  }

  const filtered = filterItems(items, filters)

  return (
    <div>
      <div className="flex gap-1 mb-6">
        {(["month", "week", "agenda"] as View[]).map(v => (
          <button
            key={v}
            onClick={() => switchView(v)}
            className={`px-3 py-1.5 text-sm rounded-lg capitalize transition-colors ${view === v ? "bg-[rgba(0,255,136,0.15)] text-[#00ff88] border border-[rgba(0,255,136,0.3)]" : "text-[#666688] hover:text-[#c0c0d0]"}`}
          >
            {v}
          </button>
        ))}
      </div>
      {view === "month" && (
        <MonthView
          items={filtered}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          timeSlots={timeSlots}
          roles={roles}
        />
      )}
      {view === "week" && (
        <WeekView
          items={filtered}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          timeSlots={timeSlots}
          roles={roles}
        />
      )}
      {view === "agenda" && (
        <AgendaView
          items={filtered}
          timeSlots={timeSlots}
          roles={roles}
        />
      )}
    </div>
  )
}
