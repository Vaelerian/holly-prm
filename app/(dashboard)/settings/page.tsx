"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface ApiKey { id: string; name: string; lastUsed: string | null; createdAt: string }

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyPlaintext, setNewKeyPlaintext] = useState("")
  const [loading, setLoading] = useState(false)

  const [pushStatus, setPushStatus] = useState<"unknown" | "enabled" | "disabled" | "unsupported">("unknown")
  const [pushWorking, setPushWorking] = useState(false)

  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email: string | null }>({ connected: false, email: null })

  const [vaultPath, setVaultPath] = useState("")
  const [vaultWorkdayCron, setVaultWorkdayCron] = useState("0 * * * 1-5")
  const [vaultWeekendCron, setVaultWeekendCron] = useState("0 */4 * * 0,6")
  const [vaultEnabled, setVaultEnabled] = useState(true)
  const [vaultLastSyncAt, setVaultLastSyncAt] = useState<string | null>(null)
  const [vaultTestStatus, setVaultTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle")
  const [vaultSaving, setVaultSaving] = useState(false)
  const [vaultSyncing, setVaultSyncing] = useState(false)
  const [vaultSyncResult, setVaultSyncResult] = useState<{ updatedNotes: unknown[]; errors: string[] } | null>(null)

  async function loadKeys() {
    const res = await fetch("/api/v1/settings/api-keys")
    if (res.ok) setKeys(await res.json())
  }

  async function loadVaultStatus() {
    const res = await fetch("/api/v1/vault/status")
    if (res.ok) {
      const data = await res.json()
      if (data.config) {
        setVaultPath(data.config.vaultPath)
        setVaultWorkdayCron(data.config.workdayCron)
        setVaultWeekendCron(data.config.weekendCron)
        setVaultEnabled(data.config.enabled)
        setVaultLastSyncAt(data.config.lastSyncAt ?? null)
      }
    }
  }

  useEffect(() => {
    loadKeys()
    loadVaultStatus()
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
  }, [])

  async function generateKey() {
    if (!newKeyName.trim()) return
    setLoading(true)
    const res = await fetch("/api/v1/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName }),
    })
    const data = await res.json()
    setNewKeyPlaintext(data.key)
    setNewKeyName("")
    await loadKeys()
    setLoading(false)
  }

  async function deleteKey(id: string) {
    await fetch(`/api/v1/settings/api-keys/${id}`, { method: "DELETE" })
    await loadKeys()
  }

  async function testVaultConnection() {
    setVaultTestStatus("testing")
    try {
      // Save current config so the status check reflects the path in the input
      await fetch("/api/v1/vault/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultPath, workdayCron: vaultWorkdayCron, weekendCron: vaultWeekendCron, enabled: vaultEnabled }),
      })
      const res = await fetch("/api/v1/vault/status")
      if (res.ok) {
        const data = await res.json()
        setVaultTestStatus(data.accessible ? "ok" : "fail")
      } else {
        setVaultTestStatus("fail")
      }
    } catch {
      setVaultTestStatus("fail")
    }
  }

  async function saveVaultConfig() {
    setVaultSaving(true)
    try {
      await fetch("/api/v1/vault/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultPath, workdayCron: vaultWorkdayCron, weekendCron: vaultWeekendCron, enabled: vaultEnabled }),
      })
    } catch (e) {
      console.error("[settings] save vault config failed", e)
    } finally {
      setVaultSaving(false)
    }
  }

  async function syncVaultNow() {
    setVaultSyncing(true)
    setVaultSyncResult(null)
    try {
      const res = await fetch("/api/v1/vault/sync", { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        setVaultSyncResult(data)
        await loadVaultStatus()
      }
    } catch (e) {
      console.error("[settings] vault sync failed", e)
    } finally {
      setVaultSyncing(false)
    }
  }

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
        <h2 className="text-base font-semibold text-[#c0c0d0] mb-1">Holly API Keys</h2>
        <p className="text-sm text-[#666688] mb-4">API keys allow Holly (Openclaw) to access your data. Keys are shown once only.</p>

        {newKeyPlaintext && (
          <div className="bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.25)] rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-[#00ff88] mb-1">New API key (copy now - not shown again):</p>
            <code className="text-sm font-mono text-[#00ff88] break-all">{newKeyPlaintext}</code>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <Input placeholder="Key name (e.g. Holly production)" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} />
          <Button onClick={generateKey} disabled={loading || !newKeyName.trim()}>Generate</Button>
        </div>

        {keys.length === 0 ? (
          <p className="text-sm text-[#666688]">No API keys yet.</p>
        ) : (
          <div className="space-y-2">
            {keys.map(k => (
              <div key={k.id} className="flex items-center justify-between bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#c0c0d0]">{k.name}</p>
                  <p className="text-xs text-[#666688]">
                    Last used: {k.lastUsed ? new Date(k.lastUsed).toLocaleDateString("en-GB") : "Never"}
                  </p>
                </div>
                <Button variant="danger" size="sm" onClick={() => deleteKey(k.id)}>Revoke</Button>
              </div>
            ))}
          </div>
        )}
      </section>

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
        <h2 className="text-base font-semibold text-[#c0c0d0] mb-1">Obsidian Vault</h2>
        <p className="text-sm text-[#666688] mb-4">Connect your Obsidian vault for note search and sync.</p>

        <div className="space-y-3">
          {/* Vault path */}
          <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-[#c0c0d0] mb-2">Vault path</p>
            <div className="flex gap-2">
              <Input
                placeholder="/home/user/vault"
                value={vaultPath}
                onChange={e => setVaultPath(e.target.value)}
              />
              <Button onClick={testVaultConnection} disabled={vaultTestStatus === "testing" || !vaultPath.trim()}>
                {vaultTestStatus === "testing" ? "Testing..." : "Test"}
              </Button>
            </div>
            {vaultTestStatus === "ok" && <p className="text-xs text-[#00ff88] mt-1">Connected</p>}
            {vaultTestStatus === "fail" && <p className="text-xs text-[#ff4444] mt-1">Not accessible</p>}
          </div>

          {/* Sync schedule */}
          <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-[#c0c0d0] mb-2">Sync schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-[#666688] mb-1">Work days</p>
                <select
                  value={vaultWorkdayCron}
                  onChange={e => setVaultWorkdayCron(e.target.value)}
                  className="w-full bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2"
                >
                  <option value="0 * * * 1-5">Every hour</option>
                  <option value="0 */2 * * 1-5">Every 2 hours</option>
                  <option value="0 */4 * * 1-5">Every 4 hours</option>
                  <option value="0 9,17 * * 1-5">Twice daily (9am and 5pm)</option>
                  <option value="0 9 * * 1-5">Once daily (9am)</option>
                </select>
              </div>
              <div>
                <p className="text-xs text-[#666688] mb-1">Weekends</p>
                <select
                  value={vaultWeekendCron}
                  onChange={e => setVaultWeekendCron(e.target.value)}
                  className="w-full bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2"
                >
                  <option value="0 * * * 0,6">Every hour</option>
                  <option value="0 */2 * * 0,6">Every 2 hours</option>
                  <option value="0 */4 * * 0,6">Every 4 hours</option>
                  <option value="0 9,17 * * 0,6">Twice daily (9am and 5pm)</option>
                  <option value="0 9 * * 0,6">Once daily (9am)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Enabled + last synced + actions */}
          <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#c0c0d0]">Sync enabled</p>
                <p className="text-xs text-[#666688]">
                  Last synced: {vaultLastSyncAt ? new Date(vaultLastSyncAt).toLocaleString("en-GB") : "Never"}
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={vaultEnabled}
                  onChange={e => setVaultEnabled(e.target.checked)}
                  className="w-4 h-4 accent-[#00ff88]"
                />
                <span className="text-sm text-[#c0c0d0]">{vaultEnabled ? "Enabled" : "Disabled"}</span>
              </label>
            </div>
            <div className="flex gap-2">
              <Button onClick={saveVaultConfig} disabled={vaultSaving}>
                {vaultSaving ? "Saving..." : "Save"}
              </Button>
              <Button onClick={syncVaultNow} disabled={vaultSyncing}>
                {vaultSyncing ? "Syncing..." : "Sync now"}
              </Button>
            </div>
            {vaultSyncResult && (
              <p className="text-xs text-[#666688]">
                Synced - {vaultSyncResult.updatedNotes.length} note{vaultSyncResult.updatedNotes.length !== 1 ? "s" : ""} updated
                {vaultSyncResult.errors.length > 0 && `, ${vaultSyncResult.errors.length} error${vaultSyncResult.errors.length !== 1 ? "s" : ""}`}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
