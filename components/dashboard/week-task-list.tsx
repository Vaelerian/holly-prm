import Link from "next/link"

interface WeekTask {
  id: string
  title: string
  dueDate: Date | null
  status: string
  isMilestone: boolean
  projectId: string | null
}

interface WeekTaskListProps {
  tasks: WeekTask[]
}

const STATUS_DOTS: Record<string, string> = {
  todo: "#3b82f6",
  in_progress: "#00ff88",
  blocked: "#ef4444",
  done: "#a855f7",
  cancelled: "#666688",
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function WeekTaskList({ tasks }: WeekTaskListProps) {
  // Group by date so each day gets its own subheading
  const byDate = new Map<string, WeekTask[]>()
  for (const t of tasks) {
    const date = t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : "no-date"
    const list = byDate.get(date) ?? []
    list.push(t)
    byDate.set(date, list)
  }
  const sortedDates = Array.from(byDate.keys()).sort()

  return (
    <div className="space-y-3">
      {sortedDates.map(date => {
        const items = byDate.get(date)!
        const d = new Date(date)
        const label =
          date === "no-date"
            ? "No date"
            : `${DAY_LABELS[d.getDay()]} ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
        return (
          <div key={date}>
            <p className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-1">{label}</p>
            <div className="space-y-1.5">
              {items.map(t => (
                <Link
                  key={t.id}
                  href={t.projectId ? `/projects/${t.projectId}` : "/tasks?view=schedule"}
                  className="flex items-center gap-2 bg-[#111125] border border-[rgba(0,255,136,0.1)] rounded-lg px-3 py-2 hover:border-[rgba(0,255,136,0.3)] transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: STATUS_DOTS[t.status] ?? "#666688" }}
                  />
                  <span className="text-sm text-[#c0c0d0] truncate flex-1">
                    {t.isMilestone && <span className="text-[#a855f7] mr-1">★</span>}
                    {t.title}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
