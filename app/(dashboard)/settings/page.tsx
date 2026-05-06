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
  allowFallbackTasks: boolean
  _count: { goals: number }
}

interface ApiKey {
  id: string
  name: string
  lastUsed: string | null
  createdAt: string
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

  // --- Roles state ---
  const [rolesExpanded, setRolesExpanded] = useState(true)
  const [roles, setRoles] = useState<RoleData[]>([])

  // Add role inline form
  const [addingRole, setAddingRole] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleColour, setNewRoleColour] = useState("#6366F1")
  const [newRoleAllowFallback, setNewRoleAllowFallback] = useState(false)
  const [savingRole, setSavingRole] = useState(false)

  // Edit role inline
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editRoleName, setEditRoleName] = useState("")
  const [editRoleColour, setEditRoleColour] = useState("")
  const [editRoleAllowFallback, setEditRoleAllowFallback] = useState(false)

  // Delete role
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null)
  const [remapRoleId, setRemapRoleId] = useState("")

  // Holly API keys
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyPlaintext, setNewKeyPlaintext] = useState("")
  const [apiKeyLoading, setApiKeyLoading] = useState(false)

  const loadRoles = useCallback(async () => {
    const res = await fetch("/api/v1/roles")
    if (res.ok) {
      const data: RoleData[] = await res.json()
      setRoles(data)
    }
  }, [])

  async function handleAddRole() {
    if (!newRoleName.trim()) return
    setSavingRole(true)
    try {
      const res = await fetch("/api/v1/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRoleName.trim(),
          colour: newRoleColour,
          allowFallbackTasks: newRoleAllowFallback,
        }),
      })
      if (res.ok) {
        setNewRoleName("")
        setNewRoleColour("#6366F1")
        setNewRoleAllowFallback(false)
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
      body: JSON.stringify({
        name: editRoleName.trim(),
        colour: editRoleColour,
        allowFallbackTasks: editRoleAllowFallback,
      }),
    })
    if (res.ok) {
      setEditingRoleId(null)
      await loadRoles()
    }
  }

  async function toggleRoleFallback(role: RoleData) {
    const res = await fetch(`/api/v1/roles/${role.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowFallbackTasks: !role.allowFallbackTasks }),
    })
    if (res.ok) await loadRoles()
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

  async function loadApiKeys() {
    const res = await fetch("/api/v1/settings/api-keys")
    if (res.ok) setApiKeys(await res.json())
  }

  async function generateApiKey() {
    if (!newKeyName.trim()) return
    setApiKeyLoading(true)
    try {
      const res = await fetch("/api/v1/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      })
      if (res.ok) {
        const data = await res.json()
        setNewKeyPlaintext(data.key)
        setNewKeyName("")
        await loadApiKeys()
      }
    } finally {
      setApiKeyLoading(false)
    }
  }

  async function deleteApiKey(id: string) {
    await fetch(`/api/v1/settings/api-keys/${id}`, { method: "DELETE" })
    await loadApiKeys()
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
    loadApiKeys()
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
        <h2 className="text-base font-semibold text-[#c0c0d0] mb-1">Holly API Keys</h2>
        <p className="text-sm text-[#666688] mb-4">API keys allow Holly (Openclaw) to read and write your data on your behalf. Keys are tied to your account and shown once only.</p>

        {newKeyPlaintext && (
          <div className="bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.25)] rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-[#00ff88] mb-1">New API key (copy now - not shown again):</p>
            <code className="text-sm font-mono text-[#00ff88] break-all">{newKeyPlaintext}</code>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <Input placeholder="Key name (e.g. Openclaw production)" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} />
          <Button onClick={generateApiKey} disabled={apiKeyLoading || !newKeyName.trim()}>Generate</Button>
        </div>

        {apiKeys.length === 0 ? (
          <p className="text-sm text-[#666688]">No API keys yet.</p>
        ) : (
          <div className="space-y-2">
            {apiKeys.map(k => (
              <div key={k.id} className="flex items-center justify-between bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#c0c0d0]">{k.name}</p>
                  <p className="text-xs text-[#666688]">
                    Last used: {k.lastUsed ? new Date(k.lastUsed).toLocaleDateString("en-GB") : "Never"}
                  </p>
                </div>
                <Button variant="danger" size="sm" onClick={() => deleteApiKey(k.id)}>Revoke</Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <button
          onClick={() => setRolesExpanded(!rolesExpanded)}
          className="flex items-center gap-2 w-full text-left"
        >
          <span className="text-xs text-[#666688]">{rolesExpanded ? "\u25BC" : "\u25B6"}</span>
          <h2 className="text-base font-semibold text-[#c0c0d0]">Roles</h2>
        </button>
        <p className="text-sm text-[#666688] mb-4 mt-1">The long-term areas of life you organise work under. Goals live in their own section in the menu.</p>

        {rolesExpanded && (
          <div className="space-y-3">
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
                <label className="flex items-center gap-2 text-xs text-[#c0c0d0] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newRoleAllowFallback}
                    onChange={e => setNewRoleAllowFallback(e.target.checked)}
                    className="accent-[#00ff88]"
                  />
                  Allow tasks from other roles to schedule into this role&rsquo;s slots when their own slots are full
                </label>
                <div className="flex gap-2">
                  <Button onClick={handleAddRole} disabled={savingRole || !newRoleName.trim()}>
                    {savingRole ? "Adding..." : "Add"}
                  </Button>
                  <button onClick={() => { setAddingRole(false); setNewRoleName("") }} className="text-sm text-[#666688] hover:text-[#c0c0d0]">Cancel</button>
                </div>
              </div>
            )}

            {roles.map(role => (
              <div key={role.id} className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3">
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
                    <label className="flex items-center gap-2 text-xs text-[#c0c0d0] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editRoleAllowFallback}
                        onChange={e => setEditRoleAllowFallback(e.target.checked)}
                        className="accent-[#00ff88]"
                      />
                      Allow tasks from other roles to schedule into this role&rsquo;s slots when their own slots are full
                    </label>
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
                  <div className="flex items-center justify-between flex-wrap gap-y-1">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: role.colour }} />
                      <span className="text-sm font-medium text-[#c0c0d0] truncate">{role.name}</span>
                      {role.isDefault && <span className="text-xs text-[#666688]">(Default)</span>}
                      <span className="text-xs text-[#666688]">{role._count.goals} goal{role._count.goals !== 1 ? "s" : ""}</span>
                      <span
                        className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${
                          role.allowFallbackTasks
                            ? "bg-[rgba(0,255,136,0.1)] text-[#00ff88] border border-[rgba(0,255,136,0.25)]"
                            : "bg-[rgba(99,102,241,0.1)] text-[#818cf8] border border-[rgba(99,102,241,0.25)]"
                        }`}
                        title={
                          role.allowFallbackTasks
                            ? "Open: tasks from other roles can fall back into this role's slots"
                            : "Protected: only this role's tasks can use its slots"
                        }
                      >
                        {role.allowFallbackTasks ? "Open" : "Protected"}
                      </span>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => toggleRoleFallback(role)}
                        className="text-xs text-[#666688] hover:text-[#00ff88]"
                        title="Toggle whether other roles' tasks can fall back into this role's slots"
                      >
                        {role.allowFallbackTasks ? "Make protected" : "Make open"}
                      </button>
                      {!role.isDefault && (
                        <>
                          <button
                            onClick={() => {
                              setEditingRoleId(role.id)
                              setEditRoleName(role.name)
                              setEditRoleColour(role.colour)
                              setEditRoleAllowFallback(role.allowFallbackTasks)
                            }}
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
