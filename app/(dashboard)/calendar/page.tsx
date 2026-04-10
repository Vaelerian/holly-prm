import { prisma } from "@/lib/db"
import { fetchGoogleEvents } from "@/lib/services/calendar-sync"
import { CalendarView, CalendarItem } from "@/components/calendar/calendar-view"
import Link from "next/link"

export default async function CalendarPage() {
  let items: CalendarItem[] = []
  let filters = { tasks: true, projects: true, followUps: true, milestones: true, actionItems: true, googleEvents: true }
  let dbError = false

  try {
    const [tasks, projects, followUps, actionItems, googleEvents, pref] = await Promise.all([
      prisma.task.findMany({
        where: { dueDate: { not: null }, status: { notIn: ["done", "cancelled"] } },
        select: { id: true, title: true, dueDate: true, isMilestone: true, projectId: true },
      }),
      prisma.project.findMany({
        where: { targetDate: { not: null }, status: { notIn: ["done", "cancelled"] } },
        select: { id: true, title: true, targetDate: true },
      }),
      prisma.interaction.findMany({
        where: { followUpRequired: true, followUpCompleted: false, followUpDate: { not: null } },
        include: { contact: { select: { name: true } } },
      }),
      prisma.actionItem.findMany({
        where: { dueDate: { not: null }, status: "todo" },
        select: { id: true, title: true, dueDate: true },
      }),
      fetchGoogleEvents(42), // enough for month view + buffer
      prisma.userPreference.findFirst(),
    ])

    if (pref) filters = pref.calendarFilters as typeof filters

    for (const t of tasks) {
      items.push({
        id: t.id,
        type: t.isMilestone ? "milestone" : "task",
        title: t.title,
        date: t.dueDate!.toISOString().split("T")[0],
        href: `/projects/${t.projectId}`,
      })
    }
    for (const p of projects) {
      items.push({
        id: p.id,
        type: "project",
        title: p.title,
        date: p.targetDate!.toISOString().split("T")[0],
        href: `/projects/${p.id}`,
      })
    }
    for (const f of followUps) {
      items.push({
        id: f.id,
        type: "follow_up",
        title: `Follow-up: ${f.contact.name}`,
        date: f.followUpDate!.toISOString().split("T")[0],
        href: `/contacts/${f.contactId}`,
      })
    }
    for (const a of actionItems) {
      items.push({
        id: a.id,
        type: "action_item",
        title: a.title,
        date: a.dueDate!.toISOString().split("T")[0],
      })
    }
    for (const g of googleEvents) {
      items.push({
        id: g.googleEventId,
        type: "google_event",
        title: g.title,
        date: g.date,
      })
    }
  } catch (e) {
    console.error("[calendar page]", e)
    dbError = true
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#c0c0d0]">Calendar</h1>
        <Link href="/settings" className="text-xs text-[#666688] hover:text-[#c0c0d0]">Filter settings</Link>
      </div>

      {dbError && (
        <div className="bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.25)] rounded-lg px-4 py-3 text-sm text-red-400">
          Database unavailable. Check server logs.
        </div>
      )}

      {!dbError && <CalendarView items={items} filters={filters} />}
    </div>
  )
}
