"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface User {
  id: string
  email: string
  name: string
  status: string
  createdAt: Date
}

interface Grant {
  id: string
  grantor: { name: string; email: string }
  grantee: { name: string; email: string }
  createdAt: Date
}

interface ApiKey {
  id: string
  name: string
  lastUsed: string | null
  createdAt: string
}

interface Props {
  users: User[]
  grants: Grant[]
}

export function AdminPanel({ users, grants: initialGrants }: Props) {
  const [userList, setUserList] = useState(users)
  const [grants, setGrants] = useState(initialGrants)
  const [claimUserId, setClaimUserId] = useState(() => {
    const first = users.find(u => u.status === "approved")
    return first?.id ?? ""
  })
  const [claimResult, setClaimResult] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [grantorEmail, setGrantorEmail] = useState("")
  const [granteeEmail, setGranteeEmail] = useState("")
  const [grantError, setGrantError] = useState<string | null>(null)

  // Holly API Keys
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyPlaintext, setNewKeyPlaintext] = useState("")
  const [apiKeyLoading, setApiKeyLoading] = useState(false)

  // Obsidian Vault
  const [vaultCouchDbUrl, setVaultCouchDbUrl] = useState("http://localhost:5984")
  const [vaultCouchDbDatabase, setVaultCouchDbDatabase] = useState("obsidian")
  const [vaultCouchDbUsername, setVaultCouchDbUsername] = useState("")
  const [vaultCouchDbPassword, setVaultCouchDbPassword] = useState("")
  const [vaultE2ePassphrase, setVaultE2ePassphrase] = useState("")
  const [vaultWorkdayCron, setVaultWorkdayCron] = useState("0 * * * 1-5")
  const [vaultWeekendCron, setVaultWeekendCron] = useState("0 */4 * * 0,6")
  const [vaultEnabled, setVaultEnabled] = useState(true)
  const [vaultLastSyncAt, setVaultLastSyncAt] = useState<string | null>(null)
  const [vaultTestStatus, setVaultTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle")
  const [vaultSaving, setVaultSaving] = useState(false)
  const [vaultSyncing, setVaultSyncing] = useState(false)
  const [vaultSyncResult, setVaultSyncResult] = useState<{ updatedNotes: unknown[]; errors: string[] } | null>(null)

  const pending = userList.filter(u => u.status === "pending")
  const approved = userList.filter(u => u.status === "approved")

  async function updateStatus(id: string, action: "approve" | "reject") {
    setWorking(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/users/${id}/${action}`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? "Action failed")
        return
      }
      setUserList(prev =>
        prev.map(u => u.id === id ? { ...u, status: action === "approve" ? "approved" : "rejected" } : u)
      )
      // Keep claim dropdown in sync: if we just approved someone, they may now appear
      if (action === "approve" && !claimUserId) setClaimUserId(id)
    } finally {
      setWorking(null)
    }
  }

  async function claimUnclaimed() {
    if (!claimUserId) return
    setWorking("claim")
    setClaimResult(null)
    try {
      const res = await fetch("/api/admin/claim-unclaimed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: claimUserId }),
      })
      const data = await res.json()
      if (res.ok) {
        const total = Object.values(data.claimed as Record<string, number>).reduce((a, b) => a + b, 0)
        setClaimResult(`Claimed ${total} records`)
      } else {
        setClaimResult("Claim failed")
      }
    } finally {
      setWorking(null)
    }
  }

  async function createGrant() {
    if (!grantorEmail.trim() || !granteeEmail.trim()) return
    setWorking("grant")
    setGrantError(null)
    try {
      const res = await fetch("/api/admin/access-grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantorEmail: grantorEmail.trim(), granteeEmail: granteeEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGrantError(data.error ?? "Failed to create grant")
        return
      }
      setGrants(prev => [data, ...prev])
      setGrantorEmail("")
      setGranteeEmail("")
    } finally {
      setWorking(null)
    }
  }

  async function revokeGrant(id: string) {
    const res = await fetch(`/api/admin/access-grants/${id}`, { method: "DELETE" })
    if (res.ok) {
      setGrants(prev => prev.filter(g => g.id !== id))
    } else {
      setGrantError("Failed to revoke grant")
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

  async function loadVaultStatus() {
    const res = await fetch("/api/v1/vault/status")
    if (res.ok) {
      const data = await res.json()
      if (data.config) {
        setVaultCouchDbUrl(data.config.couchDbUrl ?? "http://localhost:5984")
        setVaultCouchDbDatabase(data.config.couchDbDatabase ?? "obsidian")
        setVaultWorkdayCron(data.config.workdayCron)
        setVaultWeekendCron(data.config.weekendCron)
        setVaultEnabled(data.config.enabled)
        setVaultLastSyncAt(data.config.lastSyncAt ?? null)
      }
    }
  }

  async function testVaultConnection() {
    setVaultTestStatus("testing")
    try {
      await fetch("/api/v1/vault/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          couchDbUrl: vaultCouchDbUrl,
          couchDbDatabase: vaultCouchDbDatabase,
          couchDbUsername: vaultCouchDbUsername,
          couchDbPassword: vaultCouchDbPassword,
          e2ePassphrase: vaultE2ePassphrase,
          workdayCron: vaultWorkdayCron,
          weekendCron: vaultWeekendCron,
          enabled: vaultEnabled,
        }),
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
        body: JSON.stringify({
          couchDbUrl: vaultCouchDbUrl,
          couchDbDatabase: vaultCouchDbDatabase,
          couchDbUsername: vaultCouchDbUsername,
          couchDbPassword: vaultCouchDbPassword,
          e2ePassphrase: vaultE2ePassphrase,
          workdayCron: vaultWorkdayCron,
          weekendCron: vaultWeekendCron,
          enabled: vaultEnabled,
        }),
      })
    } catch (e) {
      console.error("[admin] save vault config failed", e)
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
      console.error("[admin] vault sync failed", e)
    } finally {
      setVaultSyncing(false)
    }
  }

  useEffect(() => {
    loadApiKeys()
    loadVaultStatus()
  }, [])

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold text-[#c0c0d0]">Admin</h1>
      {actionError && <p className="text-xs text-[#ff4444]">{actionError}</p>}

      <section>
        <h2 className="text-base font-semibold text-[#c0c0d0] mb-3">Pending approval</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-[#666688]">No pending requests.</p>
        ) : (
          <div className="space-y-2">
            {pending.map(u => (
              <div key={u.id} className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#c0c0d0]">{u.name}</p>
                  <p className="text-xs text-[#666688]">{u.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => updateStatus(u.id, "approve")} disabled={working === u.id}>
                    Approve
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => updateStatus(u.id, "reject")} disabled={working === u.id}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-[#c0c0d0] mb-3">Approved users</h2>
        {approved.length === 0 ? (
          <p className="text-sm text-[#666688]">No approved users yet.</p>
        ) : (
          <div className="space-y-2">
            {approved.map(u => (
              <div key={u.id} className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#c0c0d0]">{u.name}</p>
                  <p className="text-xs text-[#666688]">{u.email}</p>
                </div>
                <Button size="sm" variant="danger" onClick={() => updateStatus(u.id, "reject")} disabled={working === u.id}>
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-[#c0c0d0] mb-1">Claim unclaimed data</h2>
        <p className="text-sm text-[#666688] mb-3">Assign all records with no owner to an approved user. Run once after initial migration.</p>
        <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 space-y-3">
          <select
            value={claimUserId}
            onChange={e => setClaimUserId(e.target.value)}
            className="w-full bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2"
          >
            {approved.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
          <Button onClick={claimUnclaimed} disabled={working === "claim" || !claimUserId}>
            {working === "claim" ? "Claiming..." : "Claim all unclaimed records"}
          </Button>
          {claimResult && <p className="text-xs text-[#00ff88]">{claimResult}</p>}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[#c0c0d0] mb-3">Access grants</h2>
        <p className="text-sm text-[#666688] mb-3">Grant a user full read+contribute access to another user's contact book.</p>
        <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 space-y-3 mb-3">
          <div className="flex gap-2">
            <input
              value={grantorEmail}
              onChange={e => setGrantorEmail(e.target.value)}
              placeholder="Grantor email..."
              className="flex-1 border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-1.5 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-1 focus:ring-[#00ff88]"
            />
            <input
              value={granteeEmail}
              onChange={e => setGranteeEmail(e.target.value)}
              placeholder="Grantee email..."
              className="flex-1 border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-1.5 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-1 focus:ring-[#00ff88]"
            />
            <Button onClick={createGrant} disabled={working === "grant"}>
              {working === "grant" ? "Creating..." : "Create"}
            </Button>
          </div>
          {grantError && <p className="text-xs text-[#ff4444]">{grantError}</p>}
        </div>
        {grants.length === 0 ? (
          <p className="text-sm text-[#666688]">No access grants.</p>
        ) : (
          <div className="space-y-2">
            {grants.map(g => (
              <div key={g.id} className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#c0c0d0]">
                    <span className="font-medium">{g.grantor.name}</span>
                    <span className="text-[#666688]"> ({g.grantor.email})</span>
                    <span className="text-[#666688]"> granted to </span>
                    <span className="font-medium">{g.grantee.name}</span>
                    <span className="text-[#666688]"> ({g.grantee.email})</span>
                  </p>
                </div>
                <Button size="sm" variant="danger" onClick={() => revokeGrant(g.id)}>
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

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
        <h2 className="text-base font-semibold text-[#c0c0d0] mb-1">Obsidian Vault</h2>
        <p className="text-sm text-[#666688] mb-4">Connect your Obsidian vault for note search and sync.</p>

        <div className="space-y-3">
          {/* CouchDB connection */}
          <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 space-y-3">
            <p className="text-sm font-medium text-[#c0c0d0]">CouchDB connection</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-[#666688] mb-1">URL</p>
                <Input
                  placeholder="http://localhost:5984"
                  value={vaultCouchDbUrl}
                  onChange={e => setVaultCouchDbUrl(e.target.value)}
                />
              </div>
              <div>
                <p className="text-xs text-[#666688] mb-1">Database</p>
                <Input
                  placeholder="obsidian"
                  value={vaultCouchDbDatabase}
                  onChange={e => setVaultCouchDbDatabase(e.target.value)}
                />
              </div>
              <div>
                <p className="text-xs text-[#666688] mb-1">Username</p>
                <Input
                  placeholder="admin"
                  value={vaultCouchDbUsername}
                  onChange={e => setVaultCouchDbUsername(e.target.value)}
                />
              </div>
              <div>
                <p className="text-xs text-[#666688] mb-1">Password</p>
                <Input
                  type="password"
                  placeholder="password"
                  value={vaultCouchDbPassword}
                  onChange={e => setVaultCouchDbPassword(e.target.value)}
                />
              </div>
            </div>
            <div>
              <p className="text-xs text-[#666688] mb-1">E2E passphrase</p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="LiveSync E2E encryption passphrase"
                  value={vaultE2ePassphrase}
                  onChange={e => setVaultE2ePassphrase(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={testVaultConnection}
                  disabled={vaultTestStatus === "testing" || !vaultCouchDbUsername.trim() || !vaultCouchDbPassword.trim()}
                >
                  {vaultTestStatus === "testing" ? "Testing..." : "Test"}
                </Button>
              </div>
            </div>
            {vaultTestStatus === "ok" && <p className="text-xs text-[#00ff88]">Connected</p>}
            {vaultTestStatus === "fail" && <p className="text-xs text-[#ff4444]">Not accessible</p>}
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
