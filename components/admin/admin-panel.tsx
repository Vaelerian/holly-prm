"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

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
    </div>
  )
}
