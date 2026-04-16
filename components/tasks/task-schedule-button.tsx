"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface TaskScheduleButtonProps {
  taskId: string
  importance: string
  scheduleState: string
}

export function TaskScheduleButton({ taskId, importance, scheduleState }: TaskScheduleButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [alertReason, setAlertReason] = useState<string | null>(null)

  if (importance === "undefined_imp") return null

  let label: string
  if (scheduleState === "alert") {
    label = "retry"
  } else if (scheduleState === "floating" || scheduleState === "fixed") {
    label = "resched"
  } else {
    label = "sched"
  }

  async function handleClick() {
    setLoading(true)
    setAlertReason(null)
    try {
      const res = await fetch(`/api/v1/schedule/task/${taskId}`, { method: "POST" })
      const data = await res.json()
      if (data.scheduleState === "alert" || data.scheduled === false) {
        setAlertReason(data.reason ?? "Scheduling failed")
      }
      router.refresh()
    } catch {
      setAlertReason("Network error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(0,255,136,0.1)] text-[#00ff88] hover:bg-[rgba(0,255,136,0.2)] disabled:opacity-50"
      >
        {loading ? "..." : label}
      </button>
      {alertReason && (
        <span className="text-[10px] text-[#ff4444] max-w-[120px] truncate" title={alertReason}>
          {alertReason}
        </span>
      )}
    </span>
  )
}
