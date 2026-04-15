"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"

interface RoleOption { id: string; name: string; colour: string }
interface GoalOption { id: string; name: string }
interface ProjectOption { id: string; title: string }

interface AddTaskFormProps {
  projectId?: string
  goalId?: string
  roleId?: string
}

export function AddTaskForm({ projectId, goalId: propGoalId, roleId: propRoleId }: AddTaskFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [assignedTo, setAssignedTo] = useState<"ian" | "holly">("ian")
  const [priority, setPriority] = useState("medium")
  const [isMilestone, setIsMilestone] = useState(false)
  const [saving, setSaving] = useState(false)

  // Standalone mode state (no projectId)
  const standalone = !projectId
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState(propRoleId ?? "")
  const [goals, setGoals] = useState<GoalOption[]>([])
  const [selectedGoalId, setSelectedGoalId] = useState(propGoalId ?? "")
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")

  const fetchGoals = useCallback(async (roleId: string) => {
    if (!roleId) { setGoals([]); return }
    const res = await fetch(`/api/v1/goals?roleId=${roleId}`)
    if (res.ok) {
      const data: GoalOption[] = await res.json()
      setGoals(data)
      if (propGoalId && data.some(g => g.id === propGoalId)) {
        setSelectedGoalId(propGoalId)
      } else if (data.length > 0) {
        setSelectedGoalId(data[0].id)
      }
    }
  }, [propGoalId])

  const fetchProjects = useCallback(async (goalId: string) => {
    if (!goalId) { setProjects([]); return }
    const res = await fetch(`/api/v1/projects?goalId=${goalId}`)
    if (res.ok) {
      const data: ProjectOption[] = await res.json()
      setProjects(data)
      setSelectedProjectId("")
    }
  }, [])

  useEffect(() => {
    if (!standalone || !open) return
    async function loadRoles() {
      const res = await fetch("/api/v1/roles")
      if (res.ok) {
        const data: RoleOption[] = await res.json()
        setRoles(data)
        const initial = propRoleId && data.some(r => r.id === propRoleId) ? propRoleId : (data.length > 0 ? data[0].id : "")
        setSelectedRoleId(initial)
        if (initial) fetchGoals(initial)
      }
    }
    loadRoles()
  }, [standalone, open, propRoleId, fetchGoals])

  useEffect(() => {
    if (standalone && open && selectedGoalId) {
      fetchProjects(selectedGoalId)
    }
  }, [standalone, open, selectedGoalId, fetchProjects])

  function handleRoleChange(roleId: string) {
    setSelectedRoleId(roleId)
    setSelectedGoalId("")
    setSelectedProjectId("")
    setProjects([])
    fetchGoals(roleId)
  }

  function handleGoalChange(goalId: string) {
    setSelectedGoalId(goalId)
    setSelectedProjectId("")
    fetchProjects(goalId)
  }

  async function handleAdd() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        assignedTo,
        priority,
        isMilestone,
      }
      if (projectId) {
        body.projectId = projectId
      } else {
        body.goalId = selectedGoalId || undefined
        if (selectedProjectId) body.projectId = selectedProjectId
      }
      const res = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setTitle("")
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
        + Add task
      </button>
    )
  }

  return (
    <div className="bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 mt-2 space-y-2">
      {standalone && (
        <div className="flex gap-2">
          <select
            value={selectedRoleId}
            onChange={e => handleRoleChange(e.target.value)}
            className="border border-[rgba(0,255,136,0.2)] rounded-lg px-2 py-1 text-sm bg-[#0a0a1a] text-[#c0c0d0] flex-1"
          >
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <select
            value={selectedGoalId}
            onChange={e => handleGoalChange(e.target.value)}
            className="border border-[rgba(0,255,136,0.2)] rounded-lg px-2 py-1 text-sm bg-[#0a0a1a] text-[#c0c0d0] flex-1"
          >
            {goals.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <select
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
            className="border border-[rgba(0,255,136,0.2)] rounded-lg px-2 py-1 text-sm bg-[#0a0a1a] text-[#c0c0d0] flex-1"
          >
            <option value="">(No project)</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
      )}
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Task title"
        className="w-full border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]"
        onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
      />
      <div className="flex items-center gap-3">
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
        <label className="flex items-center gap-1 text-sm text-[#c0c0d0]">
          <input type="checkbox" checked={isMilestone} onChange={e => setIsMilestone(e.target.checked)} />
          Milestone
        </label>
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
