"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface ApiKey { id: string; name: string; lastUsed: string | null; createdAt: string }

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyPlaintext, setNewKeyPlaintext] = useState("")
  const [loading, setLoading] = useState(false)

  async function loadKeys() {
    const res = await fetch("/api/v1/settings/api-keys")
    if (res.ok) setKeys(await res.json())
  }

  useEffect(() => { loadKeys() }, [])

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

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">Settings</h1>

      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Holly API Keys</h2>
        <p className="text-sm text-gray-500 mb-4">API keys allow Holly (Openclaw) to access your data. Keys are shown once only.</p>

        {newKeyPlaintext && (
          <div className="bg-green-50 border border-green-300 rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-green-800 mb-1">New API key (copy now - not shown again):</p>
            <code className="text-sm font-mono text-green-900 break-all">{newKeyPlaintext}</code>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <Input placeholder="Key name (e.g. Holly production)" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} />
          <Button onClick={generateKey} disabled={loading || !newKeyName.trim()}>Generate</Button>
        </div>

        {keys.length === 0 ? (
          <p className="text-sm text-gray-500">No API keys yet.</p>
        ) : (
          <div className="space-y-2">
            {keys.map(k => (
              <div key={k.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="text-xs text-gray-400">
                    Last used: {k.lastUsed ? new Date(k.lastUsed).toLocaleDateString("en-GB") : "Never"}
                  </p>
                </div>
                <Button variant="danger" size="sm" onClick={() => deleteKey(k.id)}>Revoke</Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
