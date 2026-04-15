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

function MonthView({ items, currentDate, setCurrentDate }: { items: CalendarItem[]; currentDate: Date; setCurrentDate: (d: Date) => void; timeSlots?: ResolvedTimeSlot[] }) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay() // 0=Sun
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
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ items, currentDate, setCurrentDate }: { items: CalendarItem[]; currentDate: Date; setCurrentDate: (d: Date) => void; timeSlots?: ResolvedTimeSlot[] }) {
  // Start of week = Sunday
  const weekStart = new Date(currentDate)
  weekStart.setDate(currentDate.getDate() - currentDate.getDay())
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekLabel = `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} - ${addDays(weekStart, 6).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`

  const itemsByDate = new Map<string, CalendarItem[]>()
  for (const item of items) {
    const list = itemsByDate.get(item.date) ?? []
    list.push(item)
    itemsByDate.set(item.date, list)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="text-[#666688] hover:text-[#c0c0d0] px-2 py-1 text-sm">&#8249; Prev</button>
        <span className="text-sm font-semibold text-[#c0c0d0]">{weekLabel}</span>
        <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="text-[#666688] hover:text-[#c0c0d0] px-2 py-1 text-sm">Next &#8250;</button>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map(day => {
          const dateStr = toDateStr(day)
          const dayItems = itemsByDate.get(dateStr) ?? []
          const isToday = dateStr === toDateStr(new Date())
          return (
            <div key={dateStr} className="bg-[#111125] border border-[rgba(0,255,136,0.1)] rounded-lg p-2 min-h-[120px]">
              <div className={`text-xs font-semibold mb-2 ${isToday ? "text-[#00ff88]" : "text-[#666688]"}`}>
                {day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
              </div>
              <div className="space-y-1">
                {dayItems.map(item => (
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
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AgendaView({ items }: { items: CalendarItem[]; timeSlots?: ResolvedTimeSlot[] }) {
  const today = toDateStr(new Date())
  const upcoming = items
    .filter(i => i.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const byDate = new Map<string, CalendarItem[]>()
  for (const item of upcoming) {
    const list = byDate.get(item.date) ?? []
    list.push(item)
    byDate.set(item.date, list)
  }

  if (byDate.size === 0) {
    return <p className="text-sm text-[#666688]">No upcoming items in the next 30 days.</p>
  }

  return (
    <div className="space-y-4">
      {Array.from(byDate.entries()).map(([date, dateItems]) => (
        <div key={date}>
          <div className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-2">
            {new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div className="space-y-1">
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
      ))}
    </div>
  )
}

export function CalendarView({ items, filters, timeSlots = [] }: CalendarViewProps) {
  const [view, setView] = useState<View>("month")
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => {
    const saved = sessionStorage.getItem("calendarView") as View | null
    if (saved) setView(saved)
  }, [])

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
      {view === "month" && <MonthView items={filtered} currentDate={currentDate} setCurrentDate={setCurrentDate} timeSlots={timeSlots} />}
      {view === "week" && <WeekView items={filtered} currentDate={currentDate} setCurrentDate={setCurrentDate} timeSlots={timeSlots} />}
      {view === "agenda" && <AgendaView items={filtered} timeSlots={timeSlots} />}
    </div>
  )
}
