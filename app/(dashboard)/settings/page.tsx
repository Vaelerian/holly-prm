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

  async function loadKeys() {
    const res = await fetch("/api/v1/settings/api-keys")
    if (res.ok) setKeys(await res.json())
  }

  useEffect(() => {
    loadKeys()
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
    </div>
  )
}
