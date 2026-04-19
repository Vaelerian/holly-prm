"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface RoleData {
  id: string
  name: string
  description: string
  colour: string
  icon: string
  isDefault: boolean
  _count: { goals: number }
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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export default function SettingsPage() {
  const [pushStatus, setPushStatus] = useState<"unknown" | "enabled" | "disabled" | "unsupported">("unknown")
  const [pushWorking, setPushWorking] = useState(false)

  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email: string | null }>({ connected: false, email: null })

  // Scheduling preferences
  const [schedAsapDays, setSchedAsapDays] = useState(1)
  const [schedSoonDays, setSchedSoonDays] = useState(7)
  const [schedSometimeDays, setSchedSometimeDays] = useState(30)
  const [schedScanAheadDays, setSchedScanAheadDays] = useState(30)
  const [schedSizeMinutes, setSchedSizeMinutes] = useState(20)
  const [schedSizeHour, setSchedSizeHour] = useState(90)
  const [schedSizeHalfDay, setSchedSizeHalfDay] = useState(240)
  const [schedSizeDay, setSchedSizeDay] = useState(480)
  const [schedSaving, setSchedSaving] = useState(false)

  // --- Roles and Goals state ---
  const [rolesExpanded, setRolesExpanded] = useState(true)
  const [roles, setRoles] = useState<RoleData[]>([])
  const [roleGoals, setRoleGoals] = useState<Record<string, GoalData[]>>({})
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())

  // Add role inline form
  const [addingRole, setAddingRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleColour, setNewRoleColour] = useState("#6366F1")
  const [savingRole, setSavingRole] = useState(false)

  // Edit role inline
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editRoleName, setEditRoleName] = useState("")
  const [editRoleColour, setEditRoleColour] = useState("")

  // Delete role
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null)
  const [remapRoleId, setRemapRoleId] = useState("")

  // Add goal inline form
  const [addingGoalForRole, setAddingGoalForRole] = useState<string | null>(null)
  const [newGoalName, setNewGoalName] = useState("")
  const [newGoalType, setNewGoalType] = useState<"ongoing" | "completable">("ongoing")
  const [savingGoal, setSavingGoal] = useState(false)

  // Edit goal inline
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [editGoalName, setEditGoalName] = useState("")
  const [editGoalType, setEditGoalType] = useState<"ongoing" | "completable">("ongoing")
  const [editGoalTargetDate, setEditGoalTargetDate] = useState("")

  // Delete goal
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null)
  const [remapGoalId, setRemapGoalId] = useState("")

  const loadRoles = useCallback(async () => {
    const res = await fetch("/api/v1/roles")
    if (res.ok) {
      const data: RoleData[] = await res.json()
      setRoles(data)
    }
  }, [])

  async function loadGoalsForRole(roleId: string) {
    const res = await fetch(`/api/v1/goals?roleId=${roleId}`)
    if (res.ok) {
      const data: GoalData[] = await res.json()
      setRoleGoals(prev => ({ ...prev, [roleId]: data }))
    }
  }

  function toggleRoleExpanded(roleId: string) {
    setExpandedRoles(prev => {
      const next = new Set(prev)
      if (next.has(roleId)) {
        next.delete(roleId)
      } else {
        next.add(roleId)
        if (!roleGoals[roleId]) loadGoalsForRole(roleId)
      }
      return next
    })
  }

  async function handleAddRole() {
    if (!newRoleName.trim()) return
    setSavingRole(true)
    try {
      const res = await fetch("/api/v1/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRoleName.trim(), colour: newRoleColour }),
      })
      if (res.ok) {
        setNewRoleName("")
        setNewRoleColour("#6366F1")
        setAddingRole(false)
        await loadRoles()
      }
    } finally {
      setSavingRole(false)
    }
  }

  async function handleSaveRole(id: string) {
    const res = await fetch(`/api/v1/roles/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editRoleName.trim(), colour: editRoleColour }),
    })
    if (res.ok) {
      setEditingRoleId(null)
      await loadRoles()
    }
  }

  async function handleDeleteRole(id: string) {
    if (!remapRoleId) return
    const res = await fetch(`/api/v1/roles/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remapToRoleId: remapRoleId }),
    })
    if (res.ok) {
      setDeletingRoleId(null)
      setRemapRoleId("")
      await loadRoles()
    }
  }

  async function handleAddGoal(roleId: string) {
    if (!newGoalName.trim()) return
    setSavingGoal(true)
    try {
      const res = await fetch("/api/v1/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, name: newGoalName.trim(), goalType: newGoalType }),
      })
      if (res.ok) {
        setNewGoalName("")
        setNewGoalType("ongoing")
        setAddingGoalForRole(null)
        await loadGoalsForRole(roleId)
        await loadRoles()
      }
    } finally {
      setSavingGoal(false)
    }
  }

  async function handleSaveGoal(id: string, roleId: string) {
    const body: Record<string, unknown> = { name: editGoalName.trim(), goalType: editGoalType }
    if (editGoalType === "completable" && editGoalTargetDate) {
      body.targetDate = editGoalTargetDate
    } else if (editGoalType === "ongoing") {
      body.targetDate = null
    }
    const res = await fetch(`/api/v1/goals/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setEditingGoalId(null)
      await loadGoalsForRole(roleId)
    }
  }

  async function handleDeleteGoal(id: string, roleId: string) {
    if (!remapGoalId) return
    const res = await fetch(`/api/v1/goals/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remapToGoalId: remapGoalId }),
    })
    if (res.ok) {
      setDeletingGoalId(null)
      setRemapGoalId("")
      await loadGoalsForRole(roleId)
      await loadRoles()
    }
  }

  async function handleCompleteGoal(id: string, roleId: string) {
    const res = await fetch(`/api/v1/goals/${id}/complete`, { method: "POST" })
    if (res.ok) {
      await loadGoalsForRole(roleId)
    }
  }

  async function loadSchedulingPrefs() {
    try {
      const res = await fetch("/api/v1/calendar/preferences")
      if (res.ok) {
        const data = await res.json()
        const s = data?.scheduling
        if (s && typeof s === "object") {
          if (typeof s.asapDays === "number") setSchedAsapDays(s.asapDays)
          if (typeof s.soonDays === "number") setSchedSoonDays(s.soonDays)
          if (typeof s.sometimeDays === "number") setSchedSometimeDays(s.sometimeDays)
          if (typeof s.scanAheadDays === "number") setSchedScanAheadDays(s.scanAheadDays)
          if (typeof s.sizeMinutes === "number") setSchedSizeMinutes(s.sizeMinutes)
          if (typeof s.sizeHour === "number") setSchedSizeHour(s.sizeHour)
          if (typeof s.sizeHalfDay === "number") setSchedSizeHalfDay(s.sizeHalfDay)
          if (typeof s.sizeDay === "number") setSchedSizeDay(s.sizeDay)
        }
      }
    } catch {
      // Use defaults
    }
  }

  async function saveSchedulingPrefs() {
    setSchedSaving(true)
    try {
      // Read current prefs, merge scheduling key, save back
      const getRes = await fetch("/api/v1/calendar/preferences")
      let existing: Record<string, unknown> = {}
      if (getRes.ok) existing = await getRes.json()
      const updated = {
        ...existing,
        scheduling: {
          asapDays: schedAsapDays,
          soonDays: schedSoonDays,
          sometimeDays: schedSometimeDays,
          scanAheadDays: schedScanAheadDays,
          sizeMinutes: schedSizeMinutes,
          sizeHour: schedSizeHour,
          sizeHalfDay: schedSizeHalfDay,
          sizeDay: schedSizeDay,
        },
      }
      await fetch("/api/v1/calendar/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      })
    } catch (e) {
      console.error("[settings] save scheduling prefs failed", e)
    } finally {
      setSchedSaving(false)
    }
  }

  useEffect(() => {
    loadRoles()
    loadSchedulingPrefs()
    fetch("/api/v1/google/status").then(r => r.json()).then(setGoogleStatus).catch(() => {})
    // Check push status
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("unsupported")
      return
    }
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setPushStatus(sub ? "enabled" : "disabled")
      })
    }).catch(() => setPushStatus("unsupported"))
  }, [loadRoles])

  async function enableNotifications() {
    if (!("serviceWorker" in navigator)) return
    setPushWorking(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") { setPushWorking(false); return }

      const reg = await navigator.serviceWorker.ready
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidPublicKey) { setPushWorking(false); return }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      })
      const { endpoint, keys: { p256dh, auth } } = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }

      await fetch("/api/v1/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, p256dh, auth }),
      })
      setPushStatus("enabled")
    } catch (e) {
      console.error("[push] enable failed", e)
    }
    setPushWorking(false)
  }

  async function disableNotifications() {
    if (!("serviceWorker" in navigator)) return
    setPushWorking(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const { endpoint } = sub.toJSON() as { endpoint: string }
        await sub.unsubscribe()
        await fetch("/api/v1/push/unsubscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        })
      }
      setPushStatus("disabled")
    } catch (e) {
      console.error("[push] disable failed", e)
    }
    setPushWorking(false)
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold text-[#c0c0d0]">Settings</h1>

      <section>
        <h2 className="text-base font-semibold text-[#c0c0d0] mb-1">Notifications</h2>
        <p className="text-sm text-[#666688] mb-4">Receive push notifications for overdue contacts and pending follow-ups.</p>

        <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#c0c0d0]">Push notifications</p>
            <p className="text-xs text-[#666688]">
              {pushStatus === "enabled" && "Enabled on this device"}
              {pushStatus === "disabled" && "Not enabled on this device"}
              {pushStatus === "unsupported" && "Not supported in this browser"}
              {pushStatus === "unknown" && "Checking..."}
            </p>
          </div>
          {pushStatus === "disabled" && (
            <Button onClick={enableNotifications} disabled={pushWorking}>
              {pushWorking ? "Enabling..." : "Enable"}
            </Button>
          )}
          {pushStatus === "enabled" && (
            <Button variant="danger" onClick={disableNotifications} disabled={pushWorking}>
              {pushWorking ? "Disabling..." : "Disable"}
            </Button>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[#c0c0d0] mb-1">Google Integration</h2>
        <p className="text-sm text-[#666688] mb-4">Connect Google to enable Gmail monitoring and Google Calendar sync.</p>

        <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#c0c0d0]">Google account</p>
            <p className="text-xs text-[#666688]">
              {googleStatus.connected ? `Connected as ${googleStatus.email}` : "Not connected"}
            </p>
          </div>
          {googleStatus.connected ? (
            <Button variant="danger" onClick={async () => {
              await fetch("/api/v1/google/disconnect", { method: "DELETE" })
              setGoogleStatus({ connected: false, email: null })
            }}>Disconnect</Button>
          ) : (
            <Button onClick={() => { window.location.href = "/api/v1/google/connect" }}>Connect Google</Button>
          )}
        </div>
      </section>

      <section>
        <button
          onClick={() => setRolesExpanded(!rolesExpanded)}
          className="flex items-center gap-2 w-full text-left"
        >
          <span className="text-xs text-[#666688]">{rolesExpanded ? "\u25BC" : "\u25B6"}</span>
          <h2 className="text-base font-semibold text-[#c0c0d0]">Roles and Goals</h2>
        </button>
        <p className="text-sm text-[#666688] mb-4 mt-1">Organise your work into life roles and goals.</p>

        {rolesExpanded && (
          <div className="space-y-3">
            {/* Add Role button */}
            {!addingRole ? (
              <button onClick={() => setAddingRole(true)} className="text-sm text-[#00ff88] hover:text-[#00cc6f]">
                + Add role
              </button>
            ) : (
              <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 space-y-2">
                <div className="flex gap-2 items-center">
                  <Input
                    autoFocus
                    placeholder="Role name"
                    value={newRoleName}
                    onChange={e => setNewRoleName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleAddRole() }}
                  />
                  <input
                    type="color"
                    value={newRoleColour}
                    onChange={e => setNewRoleColour(e.target.value)}
                    className="w-10 h-10 rounded border border-[rgba(0,255,136,0.15)] bg-transparent cursor-pointer"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddRole} disabled={savingRole || !newRoleName.trim()}>
                    {savingRole ? "Adding..." : "Add"}
                  </Button>
                  <button onClick={() => { setAddingRole(false); setNewRoleName("") }} className="text-sm text-[#666688] hover:text-[#c0c0d0]">Cancel</button>
                </div>
              </div>
            )}

            {/* Role cards */}
            {roles.map(role => (
              <div key={role.id} className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3">
                {/* Role header */}
                {editingRoleId === role.id ? (
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      <Input
                        autoFocus
                        value={editRoleName}
                        onChange={e => setEditRoleName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSaveRole(role.id) }}
                      />
                      <input
                        type="color"
                        value={editRoleColour}
                        onChange={e => setEditRoleColour(e.target.value)}
                        className="w-10 h-10 rounded border border-[rgba(0,255,136,0.15)] bg-transparent cursor-pointer"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleSaveRole(role.id)}>Save</Button>
                      <button onClick={() => setEditingRoleId(null)} className="text-sm text-[#666688] hover:text-[#c0c0d0]">Cancel</button>
                    </div>
                  </div>
                ) : deletingRoleId === role.id ? (
                  <div className="space-y-2">
                    <p className="text-sm text-[#c0c0d0]">Move items from &quot;{role.name}&quot; to:</p>
                    <select
                      value={remapRoleId}
                      onChange={e => setRemapRoleId(e.target.value)}
                      className="w-full bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2"
                    >
                      <option value="">Select a role...</option>
                      {roles.filter(r => r.id !== role.id).map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <Button variant="danger" onClick={() => handleDeleteRole(role.id)} disabled={!remapRoleId}>Delete</Button>
                      <button onClick={() => { setDeletingRoleId(null); setRemapRoleId("") }} className="text-sm text-[#666688] hover:text-[#c0c0d0]">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <button onClick={() => toggleRoleExpanded(role.id)} className="flex items-center gap-2 flex-1 text-left">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: role.colour }} />
                      <span className="text-sm font-medium text-[#c0c0d0]">{role.name}</span>
                      {role.isDefault && <span className="text-xs text-[#666688]">(Default)</span>}
                      <span className="text-xs text-[#666688]">{role._count.goals} goal{role._count.goals !== 1 ? "s" : ""}</span>
                    </button>
                    <div className="flex gap-2">
                      {!role.isDefault && (
                        <>
                          <button
                            onClick={() => { setEditingRoleId(role.id); setEditRoleName(role.name); setEditRoleColour(role.colour) }}
                            className="text-xs text-[#666688] hover:text-[#00ff88]"
                          >Edit</button>
                          <button
                            onClick={() => setDeletingRoleId(role.id)}
                            className="text-xs text-[#666688] hover:text-red-400"
                          >Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Goals under this role */}
                {expandedRoles.has(role.id) && (
                  <div className="mt-3 ml-5 space-y-2 border-l border-[rgba(0,255,136,0.1)] pl-3">
                    {(roleGoals[role.id] ?? []).map(goal => (
                      <div key={goal.id} className="bg-[#0a0a1a] border border-[rgba(0,255,136,0.1)] rounded-lg px-3 py-2">
                        {editingGoalId === goal.id ? (
                          <div className="space-y-2">
                            <Input
                              autoFocus
                              value={editGoalName}
                              onChange={e => setEditGoalName(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") handleSaveGoal(goal.id, role.id) }}
                            />
                            <select
                              value={editGoalType}
                              onChange={e => setEditGoalType(e.target.value as "ongoing" | "completable")}
                              className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2"
                            >
                              <option value="ongoing">Ongoing</option>
                              <option value="completable">Completable</option>
                            </select>
                            {editGoalType === "completable" && (
                              <input
                                type="date"
                                value={editGoalTargetDate}
                                onChange={e => setEditGoalTargetDate(e.target.value)}
                                className="w-full border border-[rgba(0,255,136,0.15)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0]"
                              />
                            )}
                            <div className="flex gap-2">
                              <Button onClick={() => handleSaveGoal(goal.id, role.id)}>Save</Button>
                              <button onClick={() => setEditingGoalId(null)} className="text-sm text-[#666688] hover:text-[#c0c0d0]">Cancel</button>
                            </div>
                          </div>
                        ) : deletingGoalId === goal.id ? (
                          <div className="space-y-2">
                            <p className="text-sm text-[#c0c0d0]">Move items from &quot;{goal.name}&quot; to:</p>
                            <select
                              value={remapGoalId}
                              onChange={e => setRemapGoalId(e.target.value)}
                              className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2"
                            >
                              <option value="">Select a goal...</option>
                              {Object.values(roleGoals).flat().filter(g => g.id !== goal.id).map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                              ))}
                            </select>
                            <div className="flex gap-2">
                              <Button variant="danger" onClick={() => handleDeleteGoal(goal.id, role.id)} disabled={!remapGoalId}>Delete</Button>
                              <button onClick={() => { setDeletingGoalId(null); setRemapGoalId("") }} className="text-sm text-[#666688] hover:text-[#c0c0d0]">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-[#c0c0d0]">{goal.name}</span>
                              {goal.isDefault && <span className="text-xs text-[#666688]">(Default)</span>}
                              <span className={`text-xs px-1.5 py-0.5 rounded ${goal.goalType === "ongoing" ? "bg-[rgba(99,102,241,0.15)] text-[#818cf8]" : "bg-[rgba(0,255,136,0.1)] text-[#00ff88]"}`}>
                                {goal.goalType}
                              </span>
                              <span className={`text-xs ${goal.status === "completed" ? "text-[#00ff88]" : "text-[#666688]"}`}>
                                {goal.status}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              {!goal.isDefault && (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingGoalId(goal.id)
                                      setEditGoalName(goal.name)
                                      setEditGoalType(goal.goalType)
                                      setEditGoalTargetDate(goal.targetDate ? goal.targetDate.slice(0, 10) : "")
                                    }}
                                    className="text-xs text-[#666688] hover:text-[#00ff88]"
                                  >Edit</button>
                                  <button
                                    onClick={() => setDeletingGoalId(goal.id)}
                                    className="text-xs text-[#666688] hover:text-red-400"
                                  >Delete</button>
                                </>
                              )}
                              {goal.goalType === "completable" && goal.status === "active" && (
                                <button
                                  onClick={() => handleCompleteGoal(goal.id, role.id)}
                                  className="text-xs text-[#00ff88] hover:text-[#00cc6f]"
                                >Complete</button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add Goal button */}
                    {addingGoalForRole === role.id ? (
                      <div className="bg-[#0a0a1a] border border-[rgba(0,255,136,0.1)] rounded-lg px-3 py-2 space-y-2">
                        <Input
                          autoFocus
                          placeholder="Goal name"
                          value={newGoalName}
                          onChange={e => setNewGoalName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleAddGoal(role.id) }}
                        />
                        <select
                          value={newGoalType}
                          onChange={e => setNewGoalType(e.target.value as "ongoing" | "completable")}
                          className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2"
                        >
                          <option value="ongoing">Ongoing</option>
                          <option value="completable">Completable</option>
                        </select>
                        <div className="flex gap-2">
                          <Button onClick={() => handleAddGoal(role.id)} disabled={savingGoal || !newGoalName.trim()}>
                            {savingGoal ? "Adding..." : "Add"}
                          </Button>
                          <button onClick={() => { setAddingGoalForRole(null); setNewGoalName("") }} className="text-sm text-[#666688] hover:text-[#c0c0d0]">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAddingGoalForRole(role.id)} className="text-xs text-[#00ff88] hover:text-[#00cc6f]">
                        + Add goal
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-[#c0c0d0] mb-1">Scheduling</h2>
        <p className="text-sm text-[#666688] mb-4">Configure how the scheduling engine assigns tasks to time slots.</p>

        <div className="space-y-3">
          <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-[#c0c0d0] mb-2">Urgency windows (days)</p>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-[#666688] mb-1">ASAP</p>
                <input type="number" min={1} value={schedAsapDays} onChange={e => setSchedAsapDays(Number(e.target.value) || 1)} className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]" />
              </div>
              <div>
                <p className="text-xs text-[#666688] mb-1">Soon</p>
                <input type="number" min={1} value={schedSoonDays} onChange={e => setSchedSoonDays(Number(e.target.value) || 7)} className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]" />
              </div>
              <div>
                <p className="text-xs text-[#666688] mb-1">Sometime</p>
                <input type="number" min={1} value={schedSometimeDays} onChange={e => setSchedSometimeDays(Number(e.target.value) || 30)} className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]" />
              </div>
              <div>
                <p className="text-xs text-[#666688] mb-1">Scan ahead</p>
                <input type="number" min={1} value={schedScanAheadDays} onChange={e => setSchedScanAheadDays(Number(e.target.value) || 30)} className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]" />
              </div>
            </div>
          </div>

          <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-[#c0c0d0] mb-2">Effort sizes (minutes)</p>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-[#666688] mb-1">Minutes</p>
                <input type="number" min={1} value={schedSizeMinutes} onChange={e => setSchedSizeMinutes(Number(e.target.value) || 20)} className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]" />
              </div>
              <div>
                <p className="text-xs text-[#666688] mb-1">Hour</p>
                <input type="number" min={1} value={schedSizeHour} onChange={e => setSchedSizeHour(Number(e.target.value) || 90)} className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]" />
              </div>
              <div>
                <p className="text-xs text-[#666688] mb-1">Half Day</p>
                <input type="number" min={1} value={schedSizeHalfDay} onChange={e => setSchedSizeHalfDay(Number(e.target.value) || 240)} className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]" />
              </div>
              <div>
                <p className="text-xs text-[#666688] mb-1">Day</p>
                <input type="number" min={1} value={schedSizeDay} onChange={e => setSchedSizeDay(Number(e.target.value) || 480)} className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.15)] rounded px-2 py-1.5 text-sm text-[#c0c0d0]" />
              </div>
            </div>
          </div>

          <Button onClick={saveSchedulingPrefs} disabled={schedSaving}>
            {schedSaving ? "Saving..." : "Save scheduling preferences"}
          </Button>
        </div>
      </section>
    </div>
  )
}
