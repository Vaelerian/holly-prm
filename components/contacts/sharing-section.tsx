"use client"

import { useState } from "react"

interface Share {
  id: string
  userId: string
  user: { name: string; email: string }
  createdAt: string
}

interface Props {
  contactId: string
  initialShares: Share[]
}

export function SharingSection({ contactId, initialShares }: Props) {
  const [shares, setShares] = useState(initialShares)
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  async function addShare() {
    if (!email.trim()) return
    setWorking(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/contacts/${contactId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to share")
        return
      }
      setShares(prev => [...prev, { id: data.id, userId: data.userId, user: { name: data.user.name, email: data.user.email }, createdAt: new Date().toISOString() }])
      setEmail("")
    } finally {
      setWorking(false)
    }
  }

  async function removeShare(userId: string) {
    const res = await fetch(`/api/v1/contacts/${contactId}/shares/${userId}`, { method: "DELETE" })
    if (res.ok) {
      setShares(prev => prev.filter(s => s.userId !== userId))
    }
  }

  return (
    <div>
      <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-2">Sharing</h2>
      <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 space-y-3">
        {shares.length === 0 ? (
          <p className="text-sm text-[#666688]">Not shared with anyone.</p>
        ) : (
          <div className="space-y-2">
            {shares.map(s => (
              <div key={s.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#c0c0d0]">{s.user.name}</p>
                  <p className="text-xs text-[#666688]">{s.user.email}</p>
                </div>
                <button
                  onClick={() => removeShare(s.userId)}
                  className="text-xs text-[#ff4444] hover:text-[#ff6666]"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email address..."
            className="flex-1 border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-1.5 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-1 focus:ring-[#00ff88]"
            onKeyDown={e => e.key === "Enter" && addShare()}
          />
          <button
            onClick={addShare}
            disabled={working}
            className="bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] text-[#c0c0d0] text-sm px-3 py-1.5 rounded-lg hover:bg-[rgba(0,255,136,0.08)] disabled:opacity-50"
          >
            Share
          </button>
        </div>
        {error && <p className="text-xs text-[#ff4444]">{error}</p>}
      </div>
    </div>
  )
}
