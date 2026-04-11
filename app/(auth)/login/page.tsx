"use client"

import { signIn } from "next-auth/react"
import { useState, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const searchParams = useSearchParams()
  const message = searchParams.get("message")

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    const res = await signIn("credentials", { email, password, redirect: false })
    if (res?.error) setError("Invalid email or password")
    else window.location.href = "/"
  }

  return (
    <div className="w-full max-w-sm bg-[#111125] border border-[rgba(0,255,136,0.2)] rounded-lg p-8 space-y-6">
      <h1 className="text-2xl font-bold text-[#00ff88] tracking-wide">Holly PRM</h1>

      {message === "password-reset" && (
        <p className="text-sm text-[#00ff88] bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2">
          Password reset successfully. Sign in with your new password.
        </p>
      )}

      <button
        onClick={() => signIn("google", { callbackUrl: "/" })}
        className="w-full flex items-center justify-center gap-2 border border-[rgba(0,255,136,0.3)] rounded px-4 py-2 text-sm font-medium text-[#c0c0d0] hover:border-[rgba(0,255,136,0.7)] hover:text-[#00ff88] transition-colors"
      >
        Sign in with Google
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[rgba(0,255,136,0.15)]" /></div>
        <div className="relative flex justify-center text-xs text-[#666688]"><span className="bg-[#111125] px-2">or</span></div>
      </div>

      <form onSubmit={handleCredentials} className="space-y-4">
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.2)] rounded px-3 py-2 text-sm text-[#c0c0d0] placeholder-[#666688] focus:outline-none focus:border-[#00ff88] focus:ring-1 focus:ring-[#00ff88]" required />
        <div className="space-y-2">
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-[#0a0a1a] border border-[rgba(0,255,136,0.2)] rounded px-3 py-2 text-sm text-[#c0c0d0] placeholder-[#666688] focus:outline-none focus:border-[#00ff88] focus:ring-1 focus:ring-[#00ff88]" required />
          <p className="text-xs text-[#666688] text-right">
            <Link href="/forgot-password" className="text-[#00ff88] hover:underline">Forgot password?</Link>
          </p>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" className="w-full bg-[#00ff88] text-[#0a0a1a] rounded px-4 py-2 text-sm font-bold hover:bg-[#00cc6f] transition-colors">Sign in</button>
      </form>
      <p className="text-xs text-[#666688] text-center mt-4">
        Need access? <Link href="/register" className="text-[#00ff88] hover:underline">Request an account</Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0a0a1a]">
      <Suspense fallback={
        <div className="w-full max-w-sm bg-[#111125] border border-[rgba(0,255,136,0.2)] rounded-lg p-8 space-y-6">
          <h1 className="text-2xl font-bold text-[#00ff88] tracking-wide">Holly PRM</h1>
        </div>
      }>
        <LoginForm />
      </Suspense>
    </main>
  )
}
