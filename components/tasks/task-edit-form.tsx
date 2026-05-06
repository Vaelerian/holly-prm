"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface RoleOption { id: string; name: string; colour: string }
interface GoalOption { id: string; name: string; roleId?: string }
interface ProjectOption { id: string; title: string; goalId?: string }
interface UserOption { id: string; name: string; email: string }

export interface TaskEditInitial {
  id: string
  title: string
  description: string
  status: "todo" | "in_progress" | "done" | "cancelled"
  priority: "low" | "medium" | "high" | "critical"
  assignedTo: "ian" | "holly"
  assignedToUserId: string | null
  dueDate: string | null
  isMilestone: boolean
  importance: "undefined_imp" | "core" | "step" | "bonus"
  urgency: "undefined_urg" | "dated" | "asap" | "soon" | "sometime"
  effortSize: "undefined_size" | "minutes" | "hour" | "half_day" | "day" | "project_size" | "milestone"
  effortMinutes: number | null
  roleId: string
  goalId: string
  projectId: string | null
  projectVisibility: "personal" | "shared" | null
}

interface TaskEditFormProps {
  task: TaskEditInitial
}

export function TaskEditForm({ task }: TaskEditFormProps) {
  const router = useRouter()

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [status, setStatus] = useState(task.status)
  const [priority, setPriority] = useState(task.priority)
  const [assignedTo, setAssignedTo] = useState(task.assignedTo)
  const [assignedToUserId, setAssignedToUserId] = useState(task.assignedToUserId ?? "")
  const [dueDate, setDueDate] = useState(task.dueDate ?? "")
  const [isMilestone, setIsMilestone] = useState(task.isMilestone)
  const [importance, setImportance] = useState(task.importance)
  const [urgency, setUrgency] = useState(task.urgency)
  const [effortSize, setEffortSize] = useState(task.effortSize)
  const [effortMinutes, setEffortMinutes] = useState(task.effortMinutes != null ? String(task.effortMinutes) : "")

  const [roleId, setRoleId] = useState(task.roleId)
  const [goalId, setGoalId] = useState(task.goalId)
  const [projectId, setProjectId] = useState(task.projectId ?? "")

  const [roles, setRoles] = useState<RoleOption[]>([])
  const [goals, setGoals] = useState<GoalOption[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [users, setUsers] = useState<UserOption[]>([])

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  // Load roles
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/v1/roles")
      if (res.ok) setRoles(await res.json())
    })()
  }, [])

  const loadGoals = useCallback(async (rid: string) => {
    if (!rid) { setGoals([]); return }
    const res = await fetch(`/api/v1/goals?roleId=${rid}`)
    if (res.ok) setGoals(await res.json())
  }, [])

  const loadProjects = useCallback(async (gid: string) => {
    if (!gid) { setProjects([]); return }
    const res = await fetch(`/api/v1/projects?goalId=${gid}`)
    if (res.ok) setProjects(await res.json())
  }, [])

  // Load goals for current role and projects for current goal on mount
  useEffect(() => {
    void loadGoals(task.roleId)
    void loadProjects(task.goalId)
  }, [task.roleId, task.goalId, loadGoals, loadProjects])

  // Load users when the project is shared
  useEffect(() => {
    if (task.projectVisibility !== "shared") return
    void (async () => {
      const res = await fetch("/api/v1/users")
      if (res.ok) setUsers(await res.json())
    })()
  }, [task.projectVisibility])

  function handleRoleChange(rid: string) {
    setRoleId(rid)
    setGoalId("")
    setProjectId("")
    setProjects([])
    void loadGoals(rid)
  }

  function handleGoalChange(gid: string) {
    setGoalId(gid)
    setProjectId("")
    void loadProjects(gid)
  }

  async function handleSave() {
    if (!title.trim() || !goalId) {
      setError(!title.trim() ? "Title is required" : "Goal is required")
      return
    }
    setError("")
    setSaving(true)
    try {
      const customMinutes = effortMinutes.trim() === "" ? null : Number(effortMinutes)
      const hasCustomMinutes = customMinutes !== null && Number.isFinite(customMinutes) && customMinutes >= 0
      // Backfill scheduling fields with sensible defaults when the user hasn't
      // touched them. Keeps every saved task schedulable by the engine.
      const finalImportance = importance === "undefined_imp" ? "step" : importance
      const finalUrgency = urgency === "undefined_urg" ? "soon" : urgency
      const finalEffortSize = (effortSize === "undefined_size" && !hasCustomMinutes) ? "hour" : effortSize
      const body: Record<string, unknown> = {
        title: title.trim(),
        description,
        status,
        priority,
        assignedTo,
        assignedToUserId: assignedToUserId || null,
        dueDate: dueDate || null,
        isMilestone,
        importance: finalImportance,
        urgency: finalUrgency,
        effortSize: finalEffortSize,
        effortMinutes: hasCustomMinutes ? customMinutes : null,
        goalId,
        projectId: projectId || null,
      }
      const res = await fetch(`/api/v1/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Save failed (${res.status})`)
      }
      router.push("/tasks")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this task? This cannot be undone.")) return
    setDeleting(true)
    setError("")
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}`, { method: "DELETE" })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Delete failed (${res.status})`)
      }
      router.push("/tasks")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete")
      setDeleting(false)
    }
  }

  const inputClass = "w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]"
  const labelClass = "block text-xs text-[#666688] mb-1"

  return (
    <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-4 space-y-4">
      {/* Title */}
      <div>
        <label className={labelClass}>Title</label>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* Description */}
      <div>
        <label className={labelClass}>Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className={`${inputClass} resize-y`}
        />
      </div>

      {/* Role / Goal / Project */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Role</label>
          <select value={roleId} onChange={e => handleRoleChange(e.target.value)} className={inputClass}>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Goal</label>
          <select value={goalId} onChange={e => handleGoalChange(e.target.value)} className={inputClass}>
            <option value="">Select a goal</option>
            {goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Project</label>
          <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputClass}>
            <option value="">(No project)</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      </div>

      {/* Status / Priority / DueDate / Milestone */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className={labelClass}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value as typeof status)} className={inputClass}>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Priority</label>
          <select value={priority} onChange={e => setPriority(e.target.value as typeof priority)} className={inputClass}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Due date</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Milestone</label>
          <label className="flex items-center gap-2 px-2 py-1.5 text-sm text-[#c0c0d0]">
            <input type="checkbox" checked={isMilestone} onChange={e => setIsMilestone(e.target.checked)} className="accent-[#00ff88]" />
            Mark as milestone
          </label>
        </div>
      </div>

      {/* Assigned to */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Assigned to</label>
          <select value={assignedTo} onChange={e => setAssignedTo(e.target.value as typeof assignedTo)} className={inputClass}>
            <option value="ian">Ian</option>
            <option value="holly">Holly</option>
          </select>
        </div>
        {task.projectVisibility === "shared" && (
          <div>
            <label className={labelClass}>Assigned user</label>
            <select value={assignedToUserId} onChange={e => setAssignedToUserId(e.target.value)} className={inputClass}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Scheduling */}
      <div className="border-t border-[rgba(0,255,136,0.08)] pt-4">
        <p className="text-xs font-semibold text-[#c0c0d0] uppercase tracking-wide mb-2">Scheduling</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className={labelClass}>Importance</label>
            <select value={importance} onChange={e => setImportance(e.target.value as typeof importance)} className={inputClass}>
              <option value="undefined_imp">Undefined</option>
              <option value="core">Core</option>
              <option value="step">Step</option>
              <option value="bonus">Bonus</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Urgency</label>
            <select value={urgency} onChange={e => setUrgency(e.target.value as typeof urgency)} className={inputClass}>
              <option value="undefined_urg">Undefined</option>
              <option value="dated">Dated</option>
              <option value="asap">ASAP</option>
              <option value="soon">Soon</option>
              <option value="sometime">Sometime</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Effort</label>
            <select value={effortSize} onChange={e => setEffortSize(e.target.value as typeof effortSize)} className={inputClass}>
              <option value="undefined_size">Undefined</option>
              <option value="minutes">Minutes</option>
              <option value="hour">Hour</option>
              <option value="half_day">Half day</option>
              <option value="day">Day</option>
              <option value="project_size">Project</option>
              <option value="milestone">Milestone</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Custom minutes</label>
            <input
              type="number"
              min={0}
              step={5}
              value={effortMinutes}
              onChange={e => setEffortMinutes(e.target.value)}
              placeholder="override"
              className={inputClass}
            />
          </div>
        </div>
        <p className="text-xs text-[#666688] mt-2">
          Saving with any field left as &quot;Undefined&quot; backfills sensible defaults (step / soon / hour) so the task is always schedulable. Custom minutes override the effort size.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3 pt-2 border-t border-[rgba(0,255,136,0.08)]">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-sm rounded-lg bg-[#00ff88] text-[#0a0a1a] font-semibold hover:bg-[#00cc6f] disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <Link href="/tasks" className="text-sm text-[#666688] hover:text-[#c0c0d0]">Cancel</Link>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="ml-auto px-3 py-1.5 text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
        >
          {deleting ? "Deleting..." : "Delete task"}
        </button>
      </div>
    </div>
  )
}
