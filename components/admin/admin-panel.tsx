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

interface Props {
  users: User[]
}

export function AdminPanel({ users }: Props) {
  const [userList, setUserList] = useState(users)
  const [claimUserId, setClaimUserId] = useState(() => {
    const first = users.find(u => u.status === "approved")
    return first?.id ?? ""
  })
  const [claimResult, setClaimResult] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)

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
    </div>
  )
}
