"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface RoleData {
  id: string
  name: string
  colour: string
  isDefault: boolean
}

interface GoalData {
  id: string
  roleId: string
  name: string
  description: string
  goalType: "ongoing" | "completable"
  status: string
  targetDate: string | null
  isDefault: boolean
  _count: { projects: number; tasks: number }
}

export default function GoalsPage() {
  const [roles, setRoles] = useState<RoleData[]>([])
  const [goals, setGoals] = useState<GoalData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add goal state
  const [showAdd, setShowAdd] = useState(false)
  const [addRoleId, setAddRoleId] = useState("")
  const [addName, setAddName] = useState("")
  const [addDescription, setAddDescription] = useState("")
  const [addType, setAddType] = useState<"ongoing" | "completable">("ongoing")
  const [addTargetDate, setAddTargetDate] = useState("")
  const [adding, setAdding] = useState(false)

  // Edit goal state
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editRoleId, setEditRoleId] = useState("")
  const [editStatus, setEditStatus] = useState<"active" | "completed" | "archived">("active")
  const [editType, setEditType] = useState<"ongoing" | "completable">("ongoing")
  const [editTargetDate, setEditTargetDate] = useState("")

  // Delete state (requires re-mapping projects/tasks to another goal)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [remapId, setRemapId] = useState("")

  const loadGoals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/v1/goals")
      if (res.ok) setGoals(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load goals")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRoles = useCallback(async () => {
    const res = await fetch("/api/v1/roles")
    if (res.ok) setRoles(await res.json())
  }, [])

  useEffect(() => {
    loadRoles()
    loadGoals()
  }, [loadRoles, loadGoals])

  function startAdd() {
    setShowAdd(true)
    setAddRoleId(roles[0]?.id ?? "")
    setAddName("")
    setAddDescription("")
    setAddType("ongoing")
    setAddTargetDate("")
    setError(null)
  }

  async function handleAdd() {
    if (!addRoleId || !addName.trim()) return
    if (addType === "completable" && !addTargetDate) {
      setError("Completable goals require a target date.")
      return
    }
    setAdding(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        roleId: addRoleId,
        name: addName.trim(),
        description: addDescription.trim(),
        goalType: addType,
        targetDate: addType === "completable" ? addTargetDate : null,
      }
      const res = await fetch("/api/v1/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? "Failed to add goal")
        return
      }
      setShowAdd(false)
      await loadGoals()
    } finally {
      setAdding(false)
    }
  }

  function startEdit(goal: GoalData) {
    setEditId(goal.id)
    setEditName(goal.name)
    setEditDescription(goal.description ?? "")
    setEditRoleId(goal.roleId)
    setEditStatus((goal.status as "active" | "completed" | "archived") ?? "active")
    setEditType(goal.goalType)
    setEditTargetDate(goal.targetDate ? goal.targetDate.slice(0, 10) : "")
    setError(null)
  }

  async function handleSaveEdit(goal: GoalData) {
    if (!editName.trim()) return
    if (editType === "completable" && !editTargetDate) {
      setError("Completable goals require a target date.")
      return
    }
    const body: Record<string, unknown> = {
      name: editName.trim(),
      description: editDescription.trim(),
      goalType: editType,
      status: editStatus,
      targetDate: editType === "completable" ? editTargetDate : null,
    }
    if (editRoleId && editRoleId !== goal.roleId) {
      body.roleId = editRoleId
    }
    const res = await fetch(`/api/v1/goals/${goal.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "Failed to save")
      return
    }
    setEditId(null)
    await loadGoals()
  }

  async function handleDelete(goal: GoalData) {
    if (!remapId) return
    const res = await fetch(`/api/v1/goals/${goal.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remapToGoalId: remapId }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "Failed to delete")
      return
    }
    setDeleteId(null)
    setRemapId("")
    await loadGoals()
  }

  async function handleComplete(goal: GoalData) {
    const res = await fetch(`/api/v1/goals/${goal.id}/complete`, { method: "POST" })
    if (res.ok) await loadGoals()
  }

  const goalsByRole = roles.map(role => ({
    role,
    goals: goals.filter(g => g.roleId === role.id),
  }))

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#c0c0d0]">Goals</h1>
          <p className="text-sm text-[#666688] mt-1">Goals organise your work under each life role. Add new ones as they come up; complete or remove ones you have finished.</p>
        </div>
        {!showAdd && roles.length > 0 && (
          <Button onClick={startAdd}>+ Add goal</Button>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {showAdd && (
        <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-4 space-y-3">
          <p className="text-sm font-medium text-[#c0c0d0]">New goal</p>
          <div>
            <p className="text-xs text-[#666688] mb-1">Role</p>
            <select
              value={addRoleId}
              onChange={e => setAddRoleId(e.target.value)}
              className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2"
            >
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <Input
            placeholder="Goal name"
            value={addName}
            onChange={e => setAddName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd() }}
          />
          <div>
            <p className="text-xs text-[#666688] mb-1">Description (optional)</p>
            <textarea
              value={addDescription}
              onChange={e => setAddDescription(e.target.value)}
              placeholder="What does this goal mean to you?"
              rows={2}
              className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2 resize-y placeholder:text-[#444466]"
            />
          </div>
          <div>
            <p className="text-xs text-[#666688] mb-1">Type</p>
            <select
              value={addType}
              onChange={e => setAddType(e.target.value as "ongoing" | "completable")}
              className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2"
            >
              <option value="ongoing">Ongoing (no end date)</option>
              <option value="completable">Completable (requires target date)</option>
            </select>
          </div>
          {addType === "completable" && (
            <div>
              <p className="text-xs text-[#666688] mb-1">Target date</p>
              <input
                type="date"
                value={addTargetDate}
                onChange={e => setAddTargetDate(e.target.value)}
                className="w-full border border-[rgba(0,255,136,0.15)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0]"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={adding || !addName.trim() || !addRoleId || (addType === "completable" && !addTargetDate)}>
              {adding ? "Adding..." : "Add goal"}
            </Button>
            <button onClick={() => setShowAdd(false)} className="text-sm text-[#666688] hover:text-[#c0c0d0]">Cancel</button>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-[#666688]">Loading goals...</p>}

      {!loading && roles.length === 0 && (
        <p className="text-sm text-[#666688]">No roles yet. Add one in Settings before creating goals.</p>
      )}

      {!loading && goalsByRole.map(({ role, goals: roleGoals }) => (
        <section key={role.id}>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: role.colour }} />
            <h2 className="text-base font-semibold text-[#c0c0d0]">{role.name}</h2>
            {role.isDefault && <span className="text-xs text-[#666688]">(Default role)</span>}
            <span className="text-xs text-[#666688]">{roleGoals.length} goal{roleGoals.length !== 1 ? "s" : ""}</span>
          </div>

          {roleGoals.length === 0 ? (
            <p className="text-sm text-[#666688] ml-5">No goals under this role.</p>
          ) : (
            <div className="space-y-2 ml-5">
              {roleGoals.map(goal => (
                <div key={goal.id} className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3">
                  {editId === goal.id ? (
                    <div className="space-y-2">
                      <Input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(goal) }}
                        disabled={goal.isDefault}
                      />
                      <textarea
                        value={editDescription}
                        onChange={e => setEditDescription(e.target.value)}
                        placeholder="Description (optional)"
                        rows={2}
                        className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2 resize-y placeholder:text-[#444466]"
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs text-[#666688] mb-1">Role</p>
                          <select
                            value={editRoleId}
                            onChange={e => setEditRoleId(e.target.value)}
                            className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2"
                            disabled={goal.isDefault}
                          >
                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className="text-xs text-[#666688] mb-1">Status</p>
                          <select
                            value={editStatus}
                            onChange={e => setEditStatus(e.target.value as "active" | "completed" | "archived")}
                            className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2"
                          >
                            <option value="active">Active</option>
                            <option value="completed">Completed</option>
                            <option value="archived">Archived</option>
                          </select>
                        </div>
                      </div>
                      <select
                        value={editType}
                        onChange={e => setEditType(e.target.value as "ongoing" | "completable")}
                        className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2"
                      >
                        <option value="ongoing">Ongoing (no end date)</option>
                        <option value="completable">Completable (requires target date)</option>
                      </select>
                      {editType === "completable" && (
                        <input
                          type="date"
                          value={editTargetDate}
                          onChange={e => setEditTargetDate(e.target.value)}
                          className="w-full border border-[rgba(0,255,136,0.15)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0]"
                        />
                      )}
                      {editRoleId !== goal.roleId && goal._count.projects + goal._count.tasks > 0 && (
                        <p className="text-xs text-amber-300">
                          Moving this goal will reassign {goal._count.projects} project{goal._count.projects !== 1 ? "s" : ""} and {goal._count.tasks} task{goal._count.tasks !== 1 ? "s" : ""} to the new role.
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button onClick={() => handleSaveEdit(goal)}>Save</Button>
                        <button onClick={() => setEditId(null)} className="text-sm text-[#666688] hover:text-[#c0c0d0]">Cancel</button>
                      </div>
                    </div>
                  ) : deleteId === goal.id ? (
                    <div className="space-y-2">
                      <p className="text-sm text-[#c0c0d0]">Move projects and tasks from &quot;{goal.name}&quot; to:</p>
                      <select
                        value={remapId}
                        onChange={e => setRemapId(e.target.value)}
                        className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2"
                      >
                        <option value="">Select a goal...</option>
                        {goals.filter(g => g.id !== goal.id).map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <Button variant="danger" onClick={() => handleDelete(goal)} disabled={!remapId}>Delete</Button>
                        <button onClick={() => { setDeleteId(null); setRemapId("") }} className="text-sm text-[#666688] hover:text-[#c0c0d0]">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[#c0c0d0]">{goal.name}</span>
                          {goal.isDefault && <span className="text-xs text-[#666688]">(Default)</span>}
                          <span className={`text-xs px-1.5 py-0.5 rounded ${goal.goalType === "ongoing" ? "bg-[rgba(99,102,241,0.15)] text-[#818cf8]" : "bg-[rgba(0,255,136,0.1)] text-[#00ff88]"}`}>
                            {goal.goalType}
                          </span>
                          <span className={`text-xs ${goal.status === "completed" ? "text-[#00ff88]" : "text-[#666688]"}`}>
                            {goal.status}
                          </span>
                        </div>
                        <p className="text-xs text-[#666688] mt-1">
                          {goal.goalType === "completable" && goal.targetDate
                            ? `Target: ${new Date(goal.targetDate).toLocaleDateString("en-GB")}`
                            : goal.goalType === "ongoing"
                              ? "No end date"
                              : "No target date set"}
                          <span className="mx-2">·</span>
                          {goal._count.projects} project{goal._count.projects !== 1 ? "s" : ""}
                          <span className="mx-2">·</span>
                          {goal._count.tasks} task{goal._count.tasks !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {goal.goalType === "completable" && goal.status === "active" && (
                          <button
                            onClick={() => handleComplete(goal)}
                            className="text-xs text-[#00ff88] hover:text-[#00cc6f]"
                          >Complete</button>
                        )}
                        <button
                          onClick={() => startEdit(goal)}
                          className="text-xs text-[#666688] hover:text-[#00ff88]"
                        >Edit</button>
                        {!goal.isDefault && (
                          <button
                            onClick={() => setDeleteId(goal.id)}
                            className="text-xs text-[#666688] hover:text-red-400"
                          >Delete</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
