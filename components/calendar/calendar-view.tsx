"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { ResolvedTimeSlot } from "@/lib/services/repeat-expand"
import { ActionItemPopover } from "@/components/action-items/action-item-popover"

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
  initialRoles?: RoleOption[]
}

interface RoleOption {
  id: string
  name: string
  colour: string
}

type View = "month" | "week" | "roles" | "agenda"

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

/** Mon=0 ... Sun=6 — used to align week and month grids on Monday. */
function mondayOffset(date: Date): number {
  return (date.getDay() + 6) % 7
}

/** Start-of-week Date (UTC midnight irrelevant; uses local fields). */
function startOfWeekMonday(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - mondayOffset(d))
  return d
}

const DAY_HEADERS_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function minutesToTime(m: number): string {
  return `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

/** Build a map of roleId -> colour from time slots (slots carry roleId but not colour).
 *  We'll fetch roles separately for the form, but for display we use a fallback palette. */
const ROLE_FALLBACK_COLORS = [
  "#6366F1", "#EC4899", "#F59E0B", "#10B981", "#3B82F6",
  "#8B5CF6", "#EF4444", "#14B8A6", "#F97316", "#06B6D4",
]

function getRoleColor(roleId: string, roles: RoleOption[]): string {
  const role = roles.find(r => r.id === roleId)
  if (role) return role.colour
  // Deterministic fallback based on roleId hash
  let hash = 0
  for (let i = 0; i < roleId.length; i++) {
    hash = ((hash << 5) - hash + roleId.charCodeAt(i)) | 0
  }
  return ROLE_FALLBACK_COLORS[Math.abs(hash) % ROLE_FALLBACK_COLORS.length]
}

// ─── Capacity bar component ───

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

// ─── Slot form (create / edit) ───

interface SlotFormProps {
  roles: RoleOption[]
  initial?: {
    roleId?: string
    date?: string
    startMinutes?: number
    endMinutes?: number
    title?: string
    isRepeating?: boolean
    repeatType?: string
    intervalValue?: number
    dayPattern?: Record<string, unknown>
    endDate?: string | null
  }
  onSubmit: (data: Record<string, unknown>) => Promise<void>
  onCancel: () => void
  submitLabel?: string
}

function SlotForm({ roles, initial, onSubmit, onCancel, submitLabel = "Save" }: SlotFormProps) {
  const [roleId, setRoleId] = useState(initial?.roleId ?? (roles[0]?.id ?? ""))
  const [date, setDate] = useState(initial?.date ?? toDateStr(new Date()))
  const [startTime, setStartTime] = useState(minutesToTime(initial?.startMinutes ?? 540))
  const [endTime, setEndTime] = useState(minutesToTime(initial?.endMinutes ?? 600))
  const [title, setTitle] = useState(initial?.title ?? "")
  const [isRepeating, setIsRepeating] = useState(initial?.isRepeating ?? false)
  const [repeatType, setRepeatType] = useState(initial?.repeatType ?? "weekly")
  const [intervalValue, setIntervalValue] = useState(initial?.intervalValue ?? 1)
  const [weekDays, setWeekDays] = useState<number[]>(
    (initial?.dayPattern as { days?: number[] })?.days ?? []
  )
  const [endDate, setEndDate] = useState(initial?.endDate ?? "")
  const [forever, setForever] = useState(!initial?.endDate)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  function toggleWeekDay(d: number) {
    setWeekDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      const startMinutes = timeToMinutes(startTime)
      const endMinutes = timeToMinutes(endTime)
      if (endMinutes <= startMinutes) {
        setError("End time must be after start time")
        setSubmitting(false)
        return
      }
      if (isRepeating) {
        const dayPattern: Record<string, unknown> = {}
        if (repeatType === "weekly") {
          dayPattern.days = weekDays.length > 0 ? weekDays : [1]
        } else if (repeatType === "monthly_by_date") {
          dayPattern.dates = [new Date(date + "T12:00:00").getDate()]
        } else if (repeatType === "yearly_by_date") {
          const d = new Date(date + "T12:00:00")
          dayPattern.month = d.getMonth()
          dayPattern.day = d.getDate()
        }
        await onSubmit({
          roleId,
          repeatType,
          intervalValue,
          startDate: date,
          endDate: forever ? null : (endDate || null),
          dayPattern,
          startMinutes,
          endMinutes,
          title,
        })
      } else {
        await onSubmit({ roleId, date, startMinutes, endMinutes, title })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSubmitting(false)
    }
  }

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Role */}
      <div>
        <label className="block text-xs text-[#666688] mb-1">Role</label>
        <select
          value={roleId}
          onChange={e => setRoleId(e.target.value)}
          className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]"
        >
          {roles.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {/* Date */}
      <div>
        <label className="block text-xs text-[#666688] mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]"
        />
      </div>

      {/* Time row */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-[#666688] mb-1">Start</label>
          <input
            type="time"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-[#666688] mb-1">End</label>
          <input
            type="time"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
            className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]"
          />
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs text-[#666688] mb-1">Title (optional)</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Time slot"
          className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0] placeholder:text-[#444466]"
        />
      </div>

      {/* Repeating */}
      <div>
        <label className="flex items-center gap-2 text-sm text-[#c0c0d0] cursor-pointer">
          <input
            type="checkbox"
            checked={isRepeating}
            onChange={e => setIsRepeating(e.target.checked)}
            className="accent-[#00ff88]"
          />
          Repeating
        </label>
      </div>

      {isRepeating && (
        <div className="space-y-3 pl-4 border-l-2 border-[rgba(0,255,136,0.15)]">
          <div>
            <label className="block text-xs text-[#666688] mb-1">Repeat type</label>
            <select
              value={repeatType}
              onChange={e => setRepeatType(e.target.value)}
              className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly_by_date">Monthly (by date)</option>
              <option value="yearly_by_date">Yearly (by date)</option>
            </select>
          </div>

          {repeatType === "weekly" && (
            <div>
              <label className="block text-xs text-[#666688] mb-1">Days</label>
              <div className="flex gap-1 flex-wrap">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleWeekDay(i + 1)}
                    className={`px-2 py-1 text-xs rounded ${
                      weekDays.includes(i + 1)
                        ? "bg-[rgba(0,255,136,0.2)] text-[#00ff88] border border-[rgba(0,255,136,0.3)]"
                        : "text-[#666688] border border-[rgba(0,255,136,0.1)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-[#666688] mb-1">
              Every N {repeatType === "daily" ? "days" : repeatType === "weekly" ? "weeks" : repeatType === "monthly_by_date" ? "months" : "years"}
            </label>
            <input
              type="number"
              min={1}
              value={intervalValue}
              onChange={e => setIntervalValue(Number(e.target.value) || 1)}
              className="w-20 bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-[#c0c0d0] cursor-pointer mb-1">
              <input
                type="checkbox"
                checked={forever}
                onChange={e => setForever(e.target.checked)}
                className="accent-[#00ff88]"
              />
              Forever
            </label>
            {!forever && (
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]"
              />
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1.5 text-sm rounded-lg bg-[rgba(0,255,136,0.15)] text-[#00ff88] border border-[rgba(0,255,136,0.3)] hover:bg-[rgba(0,255,136,0.25)] disabled:opacity-50"
        >
          {submitting ? "Saving..." : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-lg text-[#666688] hover:text-[#c0c0d0]"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── Virtual slot action panel ───

interface VirtualSlotActionsProps {
  slot: ResolvedTimeSlot
  roles: RoleOption[]
  onClose: () => void
  onRefresh: () => void
}

function VirtualSlotActions({ slot, roles, onClose, onRefresh }: VirtualSlotActionsProps) {
  const [action, setAction] = useState<"choose" | "edit_one" | "edit_pattern" | null>("choose")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const patternId = slot.repeatPatternId!

  async function handleSkip() {
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch(`/api/v1/repeat-patterns/${patternId}/instances/${slot.date}/skip`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to skip")
      }
      onRefresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to skip")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeletePattern() {
    if (!confirm("Delete the entire repeat pattern? All future instances will be removed.")) return
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch(`/api/v1/repeat-patterns/${patternId}?scope=all`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to delete")
      }
      onRefresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEditOne(data: Record<string, unknown>) {
    const res = await fetch(`/api/v1/repeat-patterns/${patternId}/instances/${slot.date}/modify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startMinutes: data.startMinutes,
        endMinutes: data.endMinutes,
        title: data.title,
      }),
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error || "Failed to modify instance")
    }
    onRefresh()
    onClose()
  }

  async function handleEditPattern(data: Record<string, unknown>) {
    const res = await fetch(`/api/v1/repeat-patterns/${patternId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error || "Failed to update pattern")
    }
    onRefresh()
    onClose()
  }

  if (action === "edit_one") {
    return (
      <div>
        <h4 className="text-sm font-semibold text-[#c0c0d0] mb-2">Edit this occurrence</h4>
        <SlotForm
          roles={roles}
          initial={{
            roleId: slot.roleId,
            date: slot.date,
            startMinutes: slot.startMinutes,
            endMinutes: slot.endMinutes,
            title: slot.title,
          }}
          onSubmit={handleEditOne}
          onCancel={() => setAction("choose")}
          submitLabel="Save occurrence"
        />
      </div>
    )
  }

  if (action === "edit_pattern") {
    return (
      <div>
        <h4 className="text-sm font-semibold text-[#c0c0d0] mb-2">Edit entire pattern</h4>
        <SlotForm
          roles={roles}
          initial={{
            roleId: slot.roleId,
            date: slot.date,
            startMinutes: slot.startMinutes,
            endMinutes: slot.endMinutes,
            title: slot.title,
            isRepeating: true,
          }}
          onSubmit={handleEditPattern}
          onCancel={() => setAction("choose")}
          submitLabel="Update pattern"
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-[#c0c0d0] mb-1">
        Repeating slot: {slot.title || "Time slot"}
      </h4>
      <p className="text-xs text-[#666688]">
        {minutesToTime(slot.startMinutes)} - {minutesToTime(slot.endMinutes)} on {slot.date}
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="space-y-1">
        <button
          onClick={() => setAction("edit_one")}
          className="block w-full text-left px-3 py-1.5 text-sm text-[#c0c0d0] hover:text-[#00ff88] hover:bg-[rgba(0,255,136,0.05)] rounded"
        >
          Edit this occurrence
        </button>
        <button
          onClick={handleSkip}
          disabled={submitting}
          className="block w-full text-left px-3 py-1.5 text-sm text-[#c0c0d0] hover:text-[#00ff88] hover:bg-[rgba(0,255,136,0.05)] rounded disabled:opacity-50"
        >
          Skip this occurrence
        </button>
        <button
          onClick={() => setAction("edit_pattern")}
          className="block w-full text-left px-3 py-1.5 text-sm text-[#c0c0d0] hover:text-[#00ff88] hover:bg-[rgba(0,255,136,0.05)] rounded"
        >
          Edit entire pattern
        </button>
        <button
          onClick={handleDeletePattern}
          disabled={submitting}
          className="block w-full text-left px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-[rgba(255,60,60,0.05)] rounded disabled:opacity-50"
        >
          Delete entire pattern
        </button>
      </div>
      <button onClick={onClose} className="text-xs text-[#666688] hover:text-[#c0c0d0]">Close</button>
    </div>
  )
}

// ─── Concrete slot edit panel ───

interface ConcreteSlotEditProps {
  slot: ResolvedTimeSlot
  roles: RoleOption[]
  onClose: () => void
  onRefresh: () => void
}

function ConcreteSlotEdit({ slot, roles, onClose, onRefresh }: ConcreteSlotEditProps) {
  const [deleting, setDeleting] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [rescheduleResult, setRescheduleResult] = useState<string | null>(null)
  const [error, setError] = useState("")

  async function handleRescheduleSlot() {
    setRescheduling(true)
    setRescheduleResult(null)
    setError("")
    try {
      const res = await fetch("/api/v1/schedule/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: slot.id }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || "Failed to reschedule")
      }
      const data = await res.json()
      const count = (data.scheduled?.length ?? 0) as number
      const alertCount = (data.alerts?.length ?? 0) as number
      setRescheduleResult(`${count} re-placed, ${alertCount} alert${alertCount !== 1 ? "s" : ""}`)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reschedule")
    } finally {
      setRescheduling(false)
    }
  }

  async function handleSave(data: Record<string, unknown>) {
    const res = await fetch(`/api/v1/time-slots/${slot.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roleId: data.roleId,
        startMinutes: data.startMinutes,
        endMinutes: data.endMinutes,
        title: data.title,
      }),
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error || "Failed to update")
    }
    onRefresh()
    onClose()
  }

  async function handleDelete() {
    if (!confirm("Delete this time slot?")) return
    setDeleting(true)
    setError("")
    try {
      const res = await fetch(`/api/v1/time-slots/${slot.id}`, { method: "DELETE" })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || "Failed to delete")
      }
      onRefresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <h4 className="text-sm font-semibold text-[#c0c0d0] mb-2">Edit time slot</h4>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      <SlotForm
        roles={roles}
        initial={{
          roleId: slot.roleId,
          date: slot.date,
          startMinutes: slot.startMinutes,
          endMinutes: slot.endMinutes,
          title: slot.title,
        }}
        onSubmit={handleSave}
        onCancel={onClose}
        submitLabel="Save"
      />
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        <button
          onClick={handleRescheduleSlot}
          disabled={rescheduling}
          className="px-3 py-1.5 text-sm text-[#00ff88] hover:text-[#00cc6f] disabled:opacity-50"
        >
          {rescheduling ? "Rescheduling..." : "Reschedule contents"}
        </button>
        {rescheduleResult && <span className="text-xs text-[#666688]">{rescheduleResult}</span>}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 rounded disabled:opacity-50 ml-auto"
        >
          {deleting ? "Deleting..." : "Delete slot"}
        </button>
      </div>
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
  onActionItemClick,
}: {
  items: CalendarItem[]
  currentDate: Date
  setCurrentDate: (d: Date) => void
  timeSlots?: ResolvedTimeSlot[]
  roles?: RoleOption[]
  onActionItemClick?: (id: string, title: string) => void
}) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = mondayOffset(firstDay) // 0=Mon
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

  // Group time slots by date, then by roleId with total minutes
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
        {DAY_HEADERS_MON.map(d => (
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
                    {dayItems.slice(0, 3).map(item => {
                      const dot = <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${TYPE_COLORS[item.type]}`} />
                      if (item.type === "action_item") {
                        return (
                          <button
                            key={item.id}
                            onClick={e => { e.stopPropagation(); onActionItemClick?.(item.id, item.title) }}
                            className="block w-full text-left truncate text-xs text-[#c0c0d0] hover:text-[#00ff88]"
                          >
                            {dot}
                            {item.title}
                          </button>
                        )
                      }
                      if (item.href) {
                        return (
                          <Link key={item.id} href={item.href} className="block truncate text-xs text-[#c0c0d0] hover:text-[#00ff88]">
                            {dot}
                            {item.title}
                          </Link>
                        )
                      }
                      return (
                        <div key={item.id} className="truncate text-xs text-[#c0c0d0]">
                          {dot}
                          {item.title}
                        </div>
                      )
                    })}
                    {dayItems.length > 3 && <div className="text-xs text-[#444466]">+{dayItems.length - 3} more</div>}
                  </div>
                  {/* Capacity indicators */}
                  {daySlotRoles && daySlotRoles.size > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {Array.from(daySlotRoles.entries()).map(([roleId]) => (
                        <div
                          key={roleId}
                          className="h-1 rounded-full"
                          style={{ backgroundColor: getRoleColor(roleId, roles) }}
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
  onActionItemClick,
}: {
  items: CalendarItem[]
  currentDate: Date
  setCurrentDate: (d: Date) => void
  timeSlots?: ResolvedTimeSlot[]
  roles?: RoleOption[]
  onSlotClick?: (slot: ResolvedTimeSlot) => void
  onActionItemClick?: (id: string, title: string) => void
}) {
  // Start of week = Monday
  const weekStart = startOfWeekMonday(currentDate)
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

  // Time grid: 06:00 to 22:00 = 16 hours, 60px per hour = 960px
  const GRID_START = 360 // 06:00 in minutes
  const GRID_END = 1320  // 22:00 in minutes
  const GRID_HEIGHT = (GRID_END - GRID_START) // 960px
  const hours = Array.from({ length: 17 }, (_, i) => i + 6) // 06 to 22

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="text-[#666688] hover:text-[#c0c0d0] px-2 py-1 text-sm">&#8249; Prev</button>
        <span className="text-sm font-semibold text-[#c0c0d0]">{weekLabel}</span>
        <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="text-[#666688] hover:text-[#c0c0d0] px-2 py-1 text-sm">Next &#8250;</button>
      </div>

      {/* Date header row (consistent height across columns) */}
      <div className="grid grid-cols-[48px_repeat(7,1fr)] gap-px bg-[rgba(0,255,136,0.08)] rounded-t-lg overflow-hidden">
        <div className="bg-[#111125]" />
        {days.map(day => {
          const dateStr = toDateStr(day)
          const isToday = dateStr === todayStr
          return (
            <div
              key={dateStr}
              className={`bg-[#111125] px-2 py-1.5 text-xs font-semibold ${isToday ? "text-[#00ff88] bg-[rgba(0,255,136,0.04)]" : "text-[#666688]"}`}
            >
              {day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
            </div>
          )
        })}
      </div>

      {/* Spacer between header and all-day items */}
      <div className="h-1.5" />

      {/* All-day items row */}
      <div className="grid grid-cols-[48px_repeat(7,1fr)] gap-px bg-[rgba(0,255,136,0.08)] overflow-hidden">
        <div className="bg-[#111125] px-2 py-1 text-[10px] text-[#444466] flex items-center">All day</div>
        {days.map(day => {
          const dateStr = toDateStr(day)
          const isToday = dateStr === todayStr
          const dayItems = itemsByDate.get(dateStr) ?? []
          return (
            <div key={dateStr} className={`bg-[#111125] px-1 py-1 min-h-[28px] space-y-0.5 ${isToday ? "bg-[rgba(0,255,136,0.03)]" : ""}`}>
              {dayItems.slice(0, 3).map(item => {
                const dot = <span className={`inline-block w-1 h-1 rounded-full mr-0.5 ${TYPE_COLORS[item.type]}`} />
                if (item.type === "action_item") {
                  return (
                    <button
                      key={item.id}
                      onClick={() => onActionItemClick?.(item.id, item.title)}
                      className="block w-full text-left truncate text-[10px] text-[#c0c0d0] hover:text-[#00ff88]"
                    >
                      {dot}{item.title}
                    </button>
                  )
                }
                if (item.href) {
                  return (
                    <Link key={item.id} href={item.href} className="block truncate text-[10px] text-[#c0c0d0] hover:text-[#00ff88]">
                      {dot}{item.title}
                    </Link>
                  )
                }
                return (
                  <div key={item.id} className="truncate text-[10px] text-[#c0c0d0]">
                    {dot}{item.title}
                  </div>
                )
              })}
              {dayItems.length > 3 && <div className="text-[10px] text-[#444466]">+{dayItems.length - 3}</div>}
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="overflow-y-auto max-h-[600px] border border-[rgba(0,255,136,0.08)] rounded-b-lg">
        <div className="grid grid-cols-[48px_repeat(7,1fr)]" style={{ height: `${GRID_HEIGHT}px` }}>
          {/* Hour labels column */}
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

          {/* Day columns */}
          {days.map(day => {
            const dateStr = toDateStr(day)
            const isToday = dateStr === todayStr
            const daySlots = slotsByDate.get(dateStr) ?? []

            return (
              <div
                key={dateStr}
                className={`relative border-l border-[rgba(0,255,136,0.06)] ${isToday ? "bg-[rgba(0,255,136,0.02)]" : "bg-[#111125]"}`}
              >
                {/* Hour lines */}
                {hours.map(h => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-[rgba(255,255,255,0.04)]"
                    style={{ top: `${(h - 6) * 60}px` }}
                  />
                ))}

                {/* Time slot blocks */}
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
                        {height > 48 && slot.assignedTasks && slot.assignedTasks.length > 0 && (
                          <div className="mt-0.5 space-y-px">
                            {slot.assignedTasks.slice(0, 3).map(t => (
                              <Link
                                key={t.id}
                                href={t.projectId ? `/projects/${t.projectId}` : `/tasks?view=schedule`}
                                className="block text-[10px] text-[#c0c0d0] hover:text-[#00ff88] truncate mt-0.5"
                                onClick={e => e.stopPropagation()}
                              >
                                {t.scheduleState === "fixed" ? "F" : "~"} {t.title}
                              </Link>
                            ))}
                            {slot.assignedTasks.length > 3 && (
                              <div className="text-[8px] text-[#444466]">+{slot.assignedTasks.length - 3} more</div>
                            )}
                          </div>
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

// ─── Roles Grid View (role × date matrix with capacity bars) ───

function RoleGridView({
  currentDate,
  setCurrentDate,
  timeSlots,
  roles,
  weeksToShow,
  setWeeksToShow,
  onSlotClick,
}: {
  currentDate: Date
  setCurrentDate: (d: Date) => void
  timeSlots: ResolvedTimeSlot[]
  roles: RoleOption[]
  weeksToShow: 1 | 2 | 3
  setWeeksToShow: (w: 1 | 2 | 3) => void
  onSlotClick?: (slot: ResolvedTimeSlot) => void
}) {
  // Start from Monday of current week so labels align with Mentor.
  const weekStart = new Date(currentDate)
  const offsetToMonday = (currentDate.getDay() + 6) % 7
  weekStart.setDate(currentDate.getDate() - offsetToMonday)
  const days = Array.from({ length: weeksToShow * 7 }, (_, i) => addDays(weekStart, i))
  const rangeLabel = `${days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} - ${days[days.length - 1].toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
  const todayStr = toDateStr(new Date())

  const slotsByRoleDate = new Map<string, ResolvedTimeSlot[]>()
  for (const slot of timeSlots) {
    const key = `${slot.roleId}:${slot.date}`
    const list = slotsByRoleDate.get(key) ?? []
    list.push(slot)
    slotsByRoleDate.set(key, list)
  }

  const gridTemplate = `140px repeat(${days.length}, minmax(96px, 1fr))`

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setCurrentDate(addDays(currentDate, -weeksToShow * 7))} className="text-[#666688] hover:text-[#c0c0d0] px-2 py-1 text-sm">&#8249; Prev</button>
        <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-xs bg-[rgba(0,255,136,0.1)] border border-[rgba(0,255,136,0.2)] rounded text-[#00ff88]">Today</button>
        <button onClick={() => setCurrentDate(addDays(currentDate, weeksToShow * 7))} className="text-[#666688] hover:text-[#c0c0d0] px-2 py-1 text-sm">Next &#8250;</button>
        <span className="text-sm font-semibold text-[#c0c0d0] mx-2">{rangeLabel}</span>
        <div className="flex gap-1 ml-auto">
          {([1, 2, 3] as const).map(w => (
            <button
              key={w}
              onClick={() => setWeeksToShow(w)}
              className={`px-2 py-1 text-xs rounded ${weeksToShow === w ? "bg-[rgba(0,255,136,0.2)] text-[#00ff88] border border-[rgba(0,255,136,0.3)]" : "text-[#666688] border border-transparent hover:text-[#c0c0d0]"}`}
            >
              {w}w
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto border border-[rgba(0,255,136,0.08)] rounded-lg">
        <div className="min-w-max">
          {/* Header row */}
          <div className="grid bg-[rgba(0,255,136,0.05)]" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="px-2 py-1.5 text-xs font-semibold text-[#666688]">Role</div>
            {days.map(d => {
              const dateStr = toDateStr(d)
              const isToday = dateStr === todayStr
              return (
                <div key={dateStr} className={`px-1 py-1.5 text-xs text-center border-l border-[rgba(0,255,136,0.05)] ${isToday ? "text-[#00ff88] font-bold" : "text-[#666688]"}`}>
                  <div>{d.toLocaleDateString("en-GB", { weekday: "short" })}</div>
                  <div className="text-[10px]">{d.getDate()}</div>
                </div>
              )
            })}
          </div>

          {/* Role rows */}
          {roles.length === 0 ? (
            <div className="px-3 py-6 text-sm text-[#666688]">No roles configured. Add one in Settings.</div>
          ) : (
            roles.map(role => (
              <div
                key={role.id}
                className="grid border-t border-[rgba(0,255,136,0.06)]"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div className="bg-[#0a0a1a] px-2 py-2 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: role.colour }} />
                  <span className="text-sm text-[#c0c0d0] truncate">{role.name}</span>
                </div>
                {days.map(d => {
                  const dateStr = toDateStr(d)
                  const cellSlots = slotsByRoleDate.get(`${role.id}:${dateStr}`) ?? []
                  const isToday = dateStr === todayStr
                  if (cellSlots.length === 0) {
                    return (
                      <div
                        key={dateStr}
                        className={`min-h-[60px] border-l border-[rgba(0,255,136,0.05)] ${isToday ? "bg-[rgba(0,255,136,0.02)]" : "bg-[#111125]"}`}
                      />
                    )
                  }
                  const totalCap = cellSlots.reduce((a, s) => a + s.capacityMinutes, 0)
                  const totalUsed = cellSlots.reduce((a, s) => a + s.usedMinutes, 0)
                  const pct = totalCap > 0 ? Math.min(100, Math.round((totalUsed / totalCap) * 100)) : 0
                  const head = cellSlots[0]
                  return (
                    <button
                      key={dateStr}
                      onClick={() => onSlotClick?.(head)}
                      className={`text-left min-h-[60px] px-1.5 py-1 border-l border-[rgba(0,255,136,0.05)] hover:bg-[rgba(0,255,136,0.04)] transition-colors ${isToday ? "bg-[rgba(0,255,136,0.02)]" : "bg-[#111125]"}`}
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <div className="flex-1 h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: role.colour }}
                          />
                        </div>
                        <span className="text-[10px] text-[#c0c0d0]">{pct}%</span>
                      </div>
                      <div className="text-[10px] text-[#c0c0d0] truncate">
                        {minutesToTime(head.startMinutes)} {head.title || "Time slot"}
                      </div>
                      {cellSlots.length > 1 && (
                        <div className="text-[9px] text-[#666688]">+{cellSlots.length - 1} more</div>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
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
  onActionItemClick,
}: {
  items: CalendarItem[]
  timeSlots?: ResolvedTimeSlot[]
  roles?: RoleOption[]
  onActionItemClick?: (id: string, title: string) => void
}) {
  const today = toDateStr(new Date())
  const upcoming = items
    .filter(i => i.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const upcomingSlots = timeSlots
    .filter(s => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startMinutes - b.startMinutes)

  // Collect all dates that have either items or slots
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
                  {item.type === "action_item" ? (
                    <button
                      onClick={() => onActionItemClick?.(item.id, item.title)}
                      className="text-sm text-[#c0c0d0] hover:text-[#00ff88] truncate text-left flex-1"
                    >
                      {item.title}
                    </button>
                  ) : item.href ? (
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

export function CalendarView({ items, filters, timeSlots = [], initialRoles = [] }: CalendarViewProps) {
  const router = useRouter()
  const [view, setView] = useState<View>("month")
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showSlotForm, setShowSlotForm] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<ResolvedTimeSlot | null>(null)
  const [weeksToShow, setWeeksToShow] = useState<1 | 2 | 3>(2)
  const [roles, setRoles] = useState<RoleOption[]>(initialRoles)
  const [actionPopover, setActionPopover] = useState<{ id: string; title: string } | null>(null)
  // Already populated from the server when initialRoles is non-empty so we
  // skip the lazy refetch in that case.
  const [rolesLoaded, setRolesLoaded] = useState(initialRoles.length > 0)

  useEffect(() => {
    const saved = sessionStorage.getItem("calendarView") as View | null
    if (saved) setView(saved)
  }, [])

  const fetchRoles = useCallback(async () => {
    if (rolesLoaded) return
    try {
      const res = await fetch("/api/v1/roles")
      if (res.ok) {
        const data = await res.json()
        setRoles(data)
        setRolesLoaded(true)
      }
    } catch {
      // Roles will use fallback colours
    }
  }, [rolesLoaded])

  function switchView(v: View) {
    setView(v)
    sessionStorage.setItem("calendarView", v)
  }

  function handleRefresh() {
    router.refresh()
  }

  async function openSlotForm() {
    await fetchRoles()
    setShowSlotForm(true)
    setSelectedSlot(null)
  }

  async function handleSlotClick(slot: ResolvedTimeSlot) {
    await fetchRoles()
    setSelectedSlot(slot)
    setShowSlotForm(false)
  }

  async function handleCreateSubmit(data: Record<string, unknown>) {
    const isRepeating = "repeatType" in data
    const url = isRepeating ? "/api/v1/repeat-patterns" : "/api/v1/time-slots"
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error || "Failed to create")
    }
    setShowSlotForm(false)
    handleRefresh()
  }

  const filtered = filterItems(items, filters)

  return (
    <div>
      <div className="flex items-center gap-1 mb-6 flex-wrap">
        {(["month", "week", "roles", "agenda"] as View[]).map(v => (
          <button
            key={v}
            onClick={() => switchView(v)}
            className={`px-3 py-1.5 text-sm rounded-lg capitalize transition-colors ${view === v ? "bg-[rgba(0,255,136,0.15)] text-[#00ff88] border border-[rgba(0,255,136,0.3)]" : "text-[#666688] hover:text-[#c0c0d0]"}`}
          >
            {v}
          </button>
        ))}
        <button
          onClick={openSlotForm}
          className="ml-auto px-3 py-1.5 text-sm rounded-lg bg-[rgba(0,255,136,0.1)] text-[#00ff88] border border-[rgba(0,255,136,0.2)] hover:bg-[rgba(0,255,136,0.2)] transition-colors"
        >
          + Add Time Slot
        </button>
      </div>

      {/* Slot creation form */}
      {showSlotForm && (
        <div className="mb-6 bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg p-4">
          <h3 className="text-sm font-semibold text-[#c0c0d0] mb-3">New time slot</h3>
          <SlotForm
            roles={roles}
            onSubmit={handleCreateSubmit}
            onCancel={() => setShowSlotForm(false)}
            submitLabel="Create"
          />
        </div>
      )}

      {/* Slot edit/action panel */}
      {selectedSlot && (
        <div className="mb-6 bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg p-4">
          {selectedSlot.isVirtual ? (
            <VirtualSlotActions
              slot={selectedSlot}
              roles={roles}
              onClose={() => setSelectedSlot(null)}
              onRefresh={handleRefresh}
            />
          ) : (
            <ConcreteSlotEdit
              slot={selectedSlot}
              roles={roles}
              onClose={() => setSelectedSlot(null)}
              onRefresh={handleRefresh}
            />
          )}
        </div>
      )}

      {view === "month" && (
        <MonthView
          items={filtered}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          timeSlots={timeSlots}
          roles={roles}
          onActionItemClick={(id, title) => setActionPopover({ id, title })}
        />
      )}
      {view === "week" && (
        <WeekView
          items={filtered}
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          timeSlots={timeSlots}
          roles={roles}
          onSlotClick={handleSlotClick}
          onActionItemClick={(id, title) => setActionPopover({ id, title })}
        />
      )}
      {view === "roles" && (
        <RoleGridView
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          timeSlots={timeSlots}
          roles={roles}
          weeksToShow={weeksToShow}
          setWeeksToShow={setWeeksToShow}
          onSlotClick={handleSlotClick}
        />
      )}
      {view === "agenda" && (
        <AgendaView
          items={filtered}
          timeSlots={timeSlots}
          roles={roles}
          onActionItemClick={(id, title) => setActionPopover({ id, title })}
        />
      )}

      {actionPopover && (
        <ActionItemPopover
          actionId={actionPopover.id}
          initialTitle={actionPopover.title}
          open
          onClose={() => setActionPopover(null)}
        />
      )}
    </div>
  )
}
