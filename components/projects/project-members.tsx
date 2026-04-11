"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Member {
  userId: string
  user: { id: string; name: string; email: string }
}

interface Props {
  projectId: string
  members: Member[]
  isOwner: boolean
}

export function ProjectMembers({ projectId, members: initialMembers, isOwner }: Props) {
  const [members, setMembers] = useState(initialMembers)
  const [email, setEmail] = useState("")
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState("")

  async function addMember() {
    if (!email.trim()) return
    setAdding(true)
    setError("")
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        window.location.reload()
      } else {
        const data = await res.json()
        setError(data.error ?? "Failed to add member")
      }
    } finally {
      setAdding(false)
    }
  }

  async function removeMember(memberId: string) {
    await fetch(`/api/v1/projects/${projectId}/members/${memberId}`, { method: "DELETE" })
    setMembers(prev => prev.filter(m => m.userId !== memberId))
  }

  if (!isOwner && members.length === 0) return null

  return (
    <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 space-y-3">
      <p className="text-sm font-medium text-[#c0c0d0]">Shared with</p>
      {members.length === 0 ? (
        <p className="text-xs text-[#666688]">Not shared with anyone.</p>
      ) : (
        <div className="space-y-1">
          {members.map(m => (
            <div key={m.userId} className="flex items-center justify-between">
              <div>
                <span className="text-sm text-[#c0c0d0]">{m.user.name}</span>
                <span className="text-xs text-[#666688] ml-2">{m.user.email}</span>
              </div>
              {isOwner && (
                <Button size="sm" variant="danger" onClick={() => removeMember(m.userId)}>
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {isOwner && (
        <div className="flex gap-2 pt-1">
          <Input
            placeholder="Invite by email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addMember()}
          />
          <Button onClick={addMember} disabled={adding || !email.trim()}>
            {adding ? "Adding..." : "Add"}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-[#ff4444]">{error}</p>}
    </div>
  )
}
