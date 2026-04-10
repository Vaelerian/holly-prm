"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface AddActionItemFormProps {
  interactionId?: string
  taskId?: string
}

export function AddActionItemForm({ interactionId, taskId }: AddActionItemFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [assignedTo, setAssignedTo] = useState<"ian" | "holly">("ian")
  const [priority, setPriority] = useState("medium")
  const [dueDate, setDueDate] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/v1/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          assignedTo,
          priority,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          interactionId: interactionId ?? null,
          taskId: taskId ?? null,
        }),
      })
      if (res.ok) {
        setTitle("")
        setDueDate("")
        setOpen(false)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-[#00ff88] hover:text-[#00cc6f] mt-2">
        + Add action item
      </button>
    )
  }

  return (
    <div className="bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 mt-2 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Action item title"
        className="w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]"
        onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
      />
      <div className="flex items-center gap-3 flex-wrap">
        <select value={assignedTo} onChange={e => setAssignedTo(e.target.value as "ian" | "holly")} className="border border-[rgba(0,255,136,0.2)] rounded-lg px-2 py-1 text-sm bg-[#0a0a1a] text-[#c0c0d0]">
          <option value="ian">Ian</option>
          <option value="holly">Holly</option>
        </select>
        <select value={priority} onChange={e => setPriority(e.target.value)} className="border border-[rgba(0,255,136,0.2)] rounded-lg px-2 py-1 text-sm bg-[#0a0a1a] text-[#c0c0d0]">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="border border-[rgba(0,255,136,0.2)] rounded-lg px-2 py-1 text-sm bg-[#0a0a1a] text-[#c0c0d0]" />
        <div className="flex gap-2 ml-auto">
          <button onClick={handleAdd} disabled={saving || !title.trim()} className="bg-[#00ff88] text-[#0a0a1a] text-sm px-3 py-1 rounded-lg hover:bg-[#00cc6f] disabled:opacity-50">
            {saving ? "Adding..." : "Add"}
          </button>
          <button onClick={() => setOpen(false)} className="text-sm text-[#666688] hover:text-[#c0c0d0]">Cancel</button>
        </div>
      </div>
    </div>
  )
}
