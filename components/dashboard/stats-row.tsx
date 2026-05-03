interface StatsRowProps {
  overdueCount: number
  followUpCount: number
  actionCount: number
  openProjectsCount: number
  tasksDueTodayCount: number
  tasksThisWeekCount: number
}

interface Pill {
  count: number
  label: string
  bg: string
  border: string
  text: string
}

export function StatsRow({
  overdueCount,
  followUpCount,
  actionCount,
  openProjectsCount,
  tasksDueTodayCount,
  tasksThisWeekCount,
}: StatsRowProps) {
  const pills: Pill[] = [
    {
      count: overdueCount,
      label: "contacts overdue",
      bg: "rgba(255,60,60,0.1)",
      border: "rgba(255,60,60,0.25)",
      text: "#fca5a5",
    },
    {
      count: followUpCount,
      label: "follow-ups pending",
      bg: "rgba(255,200,0,0.08)",
      border: "rgba(255,200,0,0.2)",
      text: "#fde68a",
    },
    {
      count: actionCount,
      label: "open actions",
      bg: "rgba(0,160,255,0.08)",
      border: "rgba(0,160,255,0.2)",
      text: "#93c5fd",
    },
    {
      count: tasksDueTodayCount,
      label: "tasks today",
      bg: "rgba(255,140,0,0.08)",
      border: "rgba(255,140,0,0.2)",
      text: "#fdba74",
    },
    {
      count: tasksThisWeekCount,
      label: "tasks this week",
      bg: "rgba(255,255,255,0.04)",
      border: "rgba(255,255,255,0.12)",
      text: "#c0c0d0",
    },
    {
      count: openProjectsCount,
      label: "active projects",
      bg: "rgba(160,0,255,0.08)",
      border: "rgba(160,0,255,0.2)",
      text: "#d8b4fe",
    },
  ]

  const visible = pills.filter(p => p.count > 0)

  if (visible.length === 0) {
    return (
      <div className="bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.25)] rounded-lg px-4 py-2 text-sm text-[#00ff88] inline-block">
        All caught up
      </div>
    )
  }

  return (
    <div className="flex gap-3 flex-wrap">
      {visible.map(p => (
        <div
          key={p.label}
          className="rounded-lg px-4 py-2 text-sm border"
          style={{ background: p.bg, borderColor: p.border }}
        >
          <span className="font-bold" style={{ color: p.text }}>
            {p.count}
          </span>
          <span className="ml-1" style={{ color: p.text }}>
            {p.label}
          </span>
        </div>
      ))}
    </div>
  )
}
