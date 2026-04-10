"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

interface ActionItemRowProps {
  id: string
  title: string
  status: string
  priority: string
  assignedTo: string
  dueDate: string | null
  interactionId: string | null
  taskId: string | null
  contactId?: string
  taskProjectId?: string
}

export function ActionItemRow({ id, title, status, priority, assignedTo, dueDate, interactionId, taskId, contactId, taskProjectId }: ActionItemRowProps) {
  const router = useRouter()
  const [marking, setMarking] = useState(false)
  const [done, setDone] = useState(status === "done")

  async function markDone() {
    setMarking(true)
    try {
      const res = await fetch(`/api/v1/action-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      })
      if (res.ok) {
        setDone(true)
        router.refresh()
      }
    } finally {
      setMarking(false)
    }
  }

  const parentLink = interactionId && contactId
    ? { href: `/contacts/${contactId}`, label: "Interaction" }
    : taskId && taskProjectId
    ? { href: `/projects/${taskProjectId}`, label: "Task" }
    : null

  return (
    <div className={`flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-2.5 ${done ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <p className={`text-sm text-gray-900 ${done ? "line-through" : ""}`}>{title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {parentLink && (
            <Link href={parentLink.href} className="text-xs text-blue-500 hover:text-blue-700">{parentLink.label}</Link>
          )}
          {dueDate && <span className="text-xs text-gray-400">{new Date(dueDate).toLocaleDateString("en-GB")}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge variant="default">{assignedTo}</Badge>
        <Badge variant={priority === "critical" ? "danger" : priority === "high" ? "warning" : "default"}>{priority}</Badge>
        {!done && (
          <button onClick={markDone} disabled={marking} className="text-xs text-green-600 hover:text-green-800 border border-green-200 rounded px-2 py-0.5 disabled:opacity-50">
            {marking ? "..." : "Done"}
          </button>
        )}
      </div>
    </div>
  )
}
