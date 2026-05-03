import Link from "next/link"

interface ProjectHealthRowProps {
  id: string
  title: string
  status: string
  targetDate: string | null
  tasksTotal: number
  tasksCompleted: number
  percentComplete: number
}

export function ProjectHealthRow({
  id,
  title,
  status,
  targetDate,
  tasksTotal,
  tasksCompleted,
  percentComplete,
}: ProjectHealthRowProps) {
  const overdue = targetDate ? new Date(targetDate).getTime() < Date.now() : false
  const dueLabel = targetDate
    ? new Date(targetDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null

  return (
    <Link
      href={`/projects/${id}`}
      className="block bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 hover:border-[#00ff88] transition-colors"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#c0c0d0] truncate">{title}</p>
          <p className="text-xs text-[#666688]">
            {status.replace("_", " ")}
            {tasksTotal > 0 && (
              <>
                <span className="mx-2">·</span>
                {tasksCompleted}/{tasksTotal} tasks
              </>
            )}
            {dueLabel && (
              <>
                <span className="mx-2">·</span>
                <span className={overdue ? "text-red-400" : ""}>due {dueLabel}</span>
              </>
            )}
          </p>
        </div>
        <span className="text-sm font-semibold text-[#c0c0d0] flex-shrink-0">{percentComplete}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[rgba(0,255,136,0.08)] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${percentComplete}%`,
            background: percentComplete >= 75 ? "#00ff88" : percentComplete >= 25 ? "#3b82f6" : "#666688",
          }}
        />
      </div>
    </Link>
  )
}
