"use client"

import { useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })
      if (res.ok) {
        router.push("/login?message=password-reset")
      } else {
        const data = await res.json()
        setError(data.error ?? "Reset failed")
      }
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-red-400">Invalid reset link. <Link href="/auth/forgot-password" className="text-[#00ff88] hover:underline">Request a new one.</Link></p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input type="password" placeholder="New password (min 8 characters)" value={password} onChange={e => setPassword(e.target.value)} required />
      <Input type="password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Resetting..." : "Reset password"}
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0a0a1a]">
      <div className="w-full max-w-sm bg-[#111125] border border-[rgba(0,255,136,0.2)] rounded-lg p-8 space-y-6">
        <h1 className="text-2xl font-bold text-[#00ff88] tracking-wide">Holly PRM</h1>
        <p className="text-sm font-semibold text-[#c0c0d0]">Reset your password</p>
        <Suspense fallback={<p className="text-sm text-[#666688]">Loading...</p>}>
          <ResetPasswordForm />
        </Suspense>
        <p className="text-xs text-[#666688] text-center">
          <Link href="/login" className="text-[#00ff88] hover:underline">Back to sign in</Link>
        </p>
      </div>
    </main>
  )
}
