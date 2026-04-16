"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function ScheduleAllButton() {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleClick() {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch("/api/v1/schedule/reschedule", { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        const count = (data.scheduled?.length ?? 0) as number
        const alertCount = (data.alerts?.length ?? 0) as number
        setResult(`${count} scheduled, ${alertCount} alert${alertCount !== 1 ? "s" : ""}`)
        router.refresh()
      } else {
        setResult("Failed")
      }
    } catch {
      setResult("Error")
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && <span className="text-xs text-[#666688]">{result}</span>}
      <button
        onClick={handleClick}
        disabled={running}
        className="bg-[rgba(0,255,136,0.1)] border border-[rgba(0,255,136,0.2)] text-[#00ff88] text-sm px-3 py-1.5 rounded-lg hover:bg-[rgba(0,255,136,0.2)] disabled:opacity-50 transition-colors"
      >
        {running ? "Scheduling..." : "Schedule All"}
      </button>
    </div>
  )
}
