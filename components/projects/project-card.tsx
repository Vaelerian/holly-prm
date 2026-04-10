import Link from "next/link"
import { Badge } from "@/components/ui/badge"

interface ProjectCardProps {
  id: string
  title: string
  category: string
  status: string
  priority: string
  targetDate: Date | null
  taskDoneCount: number
  taskTotalCount: number
}

const statusVariant: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  planning: "default",
  active: "info",
  on_hold: "warning",
  done: "success",
  cancelled: "danger",
}

const priorityVariant: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  low: "default",
  medium: "default",
  high: "warning",
  critical: "danger",
}

export function ProjectCard({ id, title, category, status, priority, targetDate, taskDoneCount, taskTotalCount }: ProjectCardProps) {
  const progressPct = taskTotalCount > 0 ? Math.round((taskDoneCount / taskTotalCount) * 100) : 0

  return (
    <Link href={`/projects/${id}`} className="block bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-400 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Badge variant={statusVariant[status] ?? "default"}>{status.replace("_", " ")}</Badge>
          <Badge variant={priorityVariant[priority] ?? "default"}>{priority}</Badge>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-gray-400 capitalize">{category}</span>
        {targetDate && (
          <span className="text-xs text-gray-400">
            Due {new Date(targetDate).toLocaleDateString("en-GB")}
          </span>
        )}
      </div>
      {taskTotalCount > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-gray-500">{taskDoneCount} / {taskTotalCount} tasks</span>
            <span className="text-xs text-gray-400">{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}
    </Link>
  )
}
