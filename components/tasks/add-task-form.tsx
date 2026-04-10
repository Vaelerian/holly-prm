"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface AddTaskFormProps {
  projectId: string
}

export function AddTaskForm({ projectId }: AddTaskFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [assignedTo, setAssignedTo] = useState<"ian" | "holly">("ian")
  const [priority, setPriority] = useState("medium")
  const [isMilestone, setIsMilestone] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!title.trim()) return
    setSaving(true)
    const res = await fetch("/api/v1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, title: title.trim(), assignedTo, priority, isMilestone }),
    })
    if (res.ok) {
      setTitle("")
      setOpen(false)
      router.refresh()
    }
    setSaving(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-blue-600 hover:text-blue-700 mt-2">
        + Add task
      </button>
    )
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mt-2 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Task title"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
      />
      <div className="flex items-center gap-3">
        <select value={assignedTo} onChange={e => setAssignedTo(e.target.value as "ian" | "holly")} className="border border-gray-300 rounded-lg px-2 py-1 text-sm">
          <option value="ian">Ian</option>
          <option value="holly">Holly</option>
        </select>
        <select value={priority} onChange={e => setPriority(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-sm">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-gray-600">
          <input type="checkbox" checked={isMilestone} onChange={e => setIsMilestone(e.target.checked)} />
          Milestone
        </label>
        <div className="flex gap-2 ml-auto">
          <button onClick={handleAdd} disabled={saving || !title.trim()} className="bg-blue-600 text-white text-sm px-3 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Adding..." : "Add"}
          </button>
          <button onClick={() => setOpen(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      </div>
    </div>
  )
}
