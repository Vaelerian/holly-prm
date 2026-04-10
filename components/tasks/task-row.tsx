"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"

interface TaskRowProps {
  id: string
  title: string
  status: string
  priority: string
  assignedTo: string
  dueDate: string | null
  isMilestone: boolean
  onStatusChange?: (id: string, newStatus: string) => void
}

const STATUS_CYCLE: Record<string, string> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
  cancelled: "cancelled",
}

const statusVariant: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  todo: "default",
  in_progress: "info",
  done: "success",
  cancelled: "danger",
}

const priorityVariant: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  low: "default",
  medium: "default",
  high: "warning",
  critical: "danger",
}

export function TaskRow({ id, title, status: initialStatus, priority, assignedTo, dueDate, isMilestone, onStatusChange }: TaskRowProps) {
  const [status, setStatus] = useState(initialStatus)
  const [saving, setSaving] = useState(false)

  async function cycleStatus() {
    const next = STATUS_CYCLE[status] ?? "todo"
    setSaving(true)
    try {
      const res = await fetch(`/api/v1/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) {
        setStatus(next)
        onStatusChange?.(id, next)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`flex items-center gap-3 bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-2.5 ${isMilestone ? "border-l-4 border-l-purple-400" : ""}`}>
      <button
        onClick={cycleStatus}
        disabled={saving || status === "cancelled"}
        className="flex-shrink-0"
        title="Click to advance status"
      >
        <Badge variant={statusVariant[status] ?? "default"}>
          {status.replace("_", " ")}
        </Badge>
      </button>
      <span className={`flex-1 text-sm ${status === "done" ? "line-through text-[#666688]" : "text-[#c0c0d0]"} ${isMilestone ? "font-semibold" : ""}`}>
        {isMilestone && <span className="mr-1">★</span>}
        {title}
      </span>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge variant={priorityVariant[priority] ?? "default"}>{priority}</Badge>
        <Badge variant="default">{assignedTo}</Badge>
        {dueDate && (
          <span className="text-xs text-[#666688]">{new Date(dueDate).toLocaleDateString("en-GB")}</span>
        )}
      </div>
    </div>
  )
}
