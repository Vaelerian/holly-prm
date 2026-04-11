"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0a0a1a]">
        <div className="w-full max-w-sm bg-[#111125] border border-[rgba(0,255,136,0.2)] rounded-lg p-8 text-center space-y-4">
          <h1 className="text-2xl font-bold text-[#00ff88] tracking-wide">Holly PRM</h1>
          <p className="text-sm font-semibold text-[#c0c0d0]">Check your email</p>
          <p className="text-sm text-[#666688]">If that email is registered, you will receive a reset link shortly.</p>
          <Link href="/login" className="text-sm text-[#00ff88] hover:underline">Back to sign in</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0a0a1a]">
      <div className="w-full max-w-sm bg-[#111125] border border-[rgba(0,255,136,0.2)] rounded-lg p-8 space-y-6">
        <h1 className="text-2xl font-bold text-[#00ff88] tracking-wide">Holly PRM</h1>
        <p className="text-sm text-[#666688]">Enter your email and we will send you a password reset link.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Sending..." : "Send reset link"}
          </Button>
        </form>
        <p className="text-xs text-[#666688] text-center">
          <Link href="/login" className="text-[#00ff88] hover:underline">Back to sign in</Link>
        </p>
      </div>
    </main>
  )
}
