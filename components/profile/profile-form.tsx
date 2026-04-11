"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Props {
  initialName: string
  initialEmail: string
  hasPassword: boolean
}

export function ProfileForm({ initialName, initialEmail, hasPassword }: Props) {
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState(initialEmail)
  const [identityLoading, setIdentityLoading] = useState(false)
  const [identityError, setIdentityError] = useState("")
  const [identitySuccess, setIdentitySuccess] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordError, setPasswordError] = useState("")
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  async function saveIdentity(e: React.FormEvent) {
    e.preventDefault()
    setIdentityLoading(true)
    setIdentityError("")
    setIdentitySuccess(false)
    try {
      const res = await fetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      })
      if (res.ok) {
        setIdentitySuccess(true)
      } else {
        const data = await res.json()
        setIdentityError(data.error ?? "Failed to save")
      }
    } finally {
      setIdentityLoading(false)
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match"); return }
    setPasswordLoading(true)
    setPasswordError("")
    setPasswordSuccess(false)
    try {
      const res = await fetch("/api/v1/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.ok) {
        setPasswordSuccess(true)
        setCurrentPassword("")
        setNewPassword("")
        setConfirmPassword("")
      } else {
        const data = await res.json()
        setPasswordError(data.error ?? "Failed to update password")
      }
    } finally {
      setPasswordLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-4 space-y-4">
        <p className="text-sm font-medium text-[#c0c0d0]">Identity</p>
        <form onSubmit={saveIdentity} className="space-y-3">
          <Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
          <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          {identityError && <p className="text-xs text-red-400">{identityError}</p>}
          {identitySuccess && <p className="text-xs text-[#00ff88]">Saved.</p>}
          <Button type="submit" disabled={identityLoading}>
            {identityLoading ? "Saving..." : "Save"}
          </Button>
        </form>
      </div>

      {hasPassword && (
        <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-4 space-y-4">
          <p className="text-sm font-medium text-[#c0c0d0]">Change password</p>
          <form onSubmit={savePassword} className="space-y-3">
            <Input type="password" placeholder="Current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
            <Input type="password" placeholder="New password (min 8 characters)" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
            <Input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
            {passwordError && <p className="text-xs text-red-400">{passwordError}</p>}
            {passwordSuccess && <p className="text-xs text-[#00ff88]">Password updated.</p>}
            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading ? "Updating..." : "Update password"}
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
