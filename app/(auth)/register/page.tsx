"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

export default function RegisterPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await res.json()
      if (res.ok) {
        setSubmitted(true)
      } else {
        setError(data.error ?? "Registration failed")
      }
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0a0a1a]">
        <div className="w-full max-w-sm bg-[#111125] border border-[rgba(0,255,136,0.2)] rounded-lg p-8 text-center space-y-4">
          <h1 className="text-2xl font-bold text-[#00ff88] tracking-wide">Holly PRM</h1>
          <p className="text-sm font-semibold text-[#c0c0d0]">Request submitted</p>
          <p className="text-sm text-[#666688]">Your account is pending approval. You will be able to sign in once approved.</p>
          <Link href="/login" className="text-sm text-[#00ff88] hover:underline">Back to sign in</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0a0a1a]">
      <div className="w-full max-w-sm bg-[#111125] border border-[rgba(0,255,136,0.2)] rounded-lg p-8 space-y-6">
        <h1 className="text-2xl font-bold text-[#00ff88] tracking-wide">Holly PRM</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required />
          <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password (min 8 characters)" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Submitting..." : "Request access"}
          </Button>
        </form>
        <p className="text-xs text-[#666688] text-center">
          Already have access? <Link href="/login" className="text-[#00ff88] hover:underline">Sign in</Link>
        </p>
      </div>
    </main>
  )
}
