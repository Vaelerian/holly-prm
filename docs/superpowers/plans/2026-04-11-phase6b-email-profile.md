# Phase 6b: Email, Password Reset, User Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Resend email infrastructure, lifecycle notifications (registration/approval/rejection), self-service password reset, and a user profile edit page.

**Architecture:** Resend is added as a thin helper in `lib/email.ts` with fire-and-forget semantics; templates live in `lib/email-templates.ts`. A `PasswordResetToken` table stores SHA-256-hashed single-use tokens. Profile editing gets two PATCH routes and a client page. Notifications are wired into three existing routes with no structural changes.

**Tech Stack:** Next.js 16 App Router, Prisma 7, NextAuth v5 (beta), Resend, bcryptjs, Node.js `crypto` (built-in), Jest, TypeScript

---

## File Map

**Create:**
- `lib/email.ts` - Resend client + `sendEmail` fire-and-forget helper
- `lib/email-templates.ts` - four template functions
- `lib/services/password-reset.ts` - token creation, validation, consumption
- `app/api/auth/forgot-password/route.ts` - POST handler
- `app/api/auth/reset-password/route.ts` - POST handler
- `app/(auth)/forgot-password/page.tsx` - email input form
- `app/(auth)/reset-password/page.tsx` - new password form
- `app/(dashboard)/profile/page.tsx` - profile edit page (server + client)
- `app/api/v1/profile/route.ts` - PATCH name/email
- `app/api/v1/profile/password/route.ts` - PATCH password
- `prisma/migrations/20260411000001_phase6b_password_reset/migration.sql`
- `__tests__/lib/email-templates.test.ts`
- `__tests__/services/password-reset.test.ts`
- `__tests__/api/auth/password-reset.test.ts`
- `__tests__/api/v1/profile.test.ts`

**Modify:**
- `prisma/schema.prisma` - add `PasswordResetToken` model
- `app/api/auth/register/route.ts` - send registration received email
- `app/api/admin/users/[id]/approve/route.ts` - send approval email
- `app/api/admin/users/[id]/reject/route.ts` - send rejection email
- `components/layout/sidebar.tsx` - add Profile link
- `components/layout/bottom-nav.tsx` - add Profile tab

---

### Task 1: Install Resend + Email Infrastructure

**Files:**
- Modify: `package.json` (install resend)
- Create: `lib/email.ts`
- Create: `lib/email-templates.ts`
- Create: `__tests__/lib/email-templates.test.ts`

- [ ] **Step 1: Install resend**

```bash
npm install resend
```

Expected: resend appears in `package.json` dependencies.

- [ ] **Step 2: Write failing tests for email templates**

Create `__tests__/lib/email-templates.test.ts`:

```ts
import {
  registrationReceivedEmail,
  accountApprovedEmail,
  accountRejectedEmail,
  passwordResetEmail,
} from "@/lib/email-templates"

describe("registrationReceivedEmail", () => {
  it("returns subject and html containing the user name", () => {
    const { subject, html } = registrationReceivedEmail("Alice")
    expect(subject).toBeTruthy()
    expect(html).toContain("Alice")
    expect(html).toContain("pending")
  })
})

describe("accountApprovedEmail", () => {
  it("returns html containing name and sign-in URL", () => {
    const { subject, html } = accountApprovedEmail("Bob", "https://example.com/login")
    expect(subject).toBeTruthy()
    expect(html).toContain("Bob")
    expect(html).toContain("https://example.com/login")
  })
})

describe("accountRejectedEmail", () => {
  it("returns html containing the user name", () => {
    const { subject, html } = accountRejectedEmail("Carol")
    expect(subject).toBeTruthy()
    expect(html).toContain("Carol")
  })
})

describe("passwordResetEmail", () => {
  it("returns html containing name and reset URL", () => {
    const { subject, html } = passwordResetEmail("Dan", "https://example.com/auth/reset-password?token=abc")
    expect(subject).toBeTruthy()
    expect(html).toContain("Dan")
    expect(html).toContain("https://example.com/auth/reset-password?token=abc")
    expect(html).toContain("1 hour")
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest __tests__/lib/email-templates.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module '@/lib/email-templates'"

- [ ] **Step 4: Create `lib/email-templates.ts`**

```ts
export function registrationReceivedEmail(name: string): { subject: string; html: string } {
  return {
    subject: "Your Holly PRM registration is pending",
    html: `<p>Hi ${name},</p><p>Your registration request has been received. Your account is pending approval. You will be notified when access is granted.</p>`,
  }
}

export function accountApprovedEmail(name: string, signInUrl: string): { subject: string; html: string } {
  return {
    subject: "Your Holly PRM account has been approved",
    html: `<p>Hi ${name},</p><p>Your account has been approved. You can now sign in at <a href="${signInUrl}">${signInUrl}</a>.</p>`,
  }
}

export function accountRejectedEmail(name: string): { subject: string; html: string } {
  return {
    subject: "Your Holly PRM registration was not approved",
    html: `<p>Hi ${name},</p><p>Your registration request was reviewed and was not approved. If you believe this is an error, please contact the administrator.</p>`,
  }
}

export function passwordResetEmail(name: string, resetUrl: string): { subject: string; html: string } {
  return {
    subject: "Reset your Holly PRM password",
    html: `<p>Hi ${name},</p><p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request a password reset, ignore this email.</p>`,
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest __tests__/lib/email-templates.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 6: Create `lib/email.ts`**

This is the Resend client wrapper. No test needed - it's a thin integration wrapper over an external API.

```ts
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "noreply@example.com"
  try {
    await resend.emails.send({ from, to, subject, html })
  } catch (err) {
    console.error("[email] Failed to send email to", to, err)
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add lib/email.ts lib/email-templates.ts __tests__/lib/email-templates.test.ts package.json package-lock.json
git commit -m "feat: add Resend email infrastructure and templates"
```

---

### Task 2: PasswordResetToken Schema + Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260411000001_phase6b_password_reset/migration.sql`

- [ ] **Step 1: Add `PasswordResetToken` model to schema**

Open `prisma/schema.prisma`. After the `User` model (around line 110), add:

```prisma
model PasswordResetToken {
  id         String    @id @default(uuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash  String    @unique
  expiresAt  DateTime
  usedAt     DateTime?
  createdAt  DateTime  @default(now())
}
```

Also add the back-relation to the `User` model. After the last relation line in `User` (currently `vaultNotes VaultNote[]`), add:

```prisma
  passwordResetTokens PasswordResetToken[]
```

- [ ] **Step 2: Regenerate the Prisma client**

```bash
npx prisma generate
```

Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 3: Create the migration SQL file**

Create directory `prisma/migrations/20260411000001_phase6b_password_reset/` and file `migration.sql`:

```sql
-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260411000001_phase6b_password_reset/migration.sql app/generated/
git commit -m "feat: add PasswordResetToken schema and migration"
```

---

### Task 3: Password Reset Service

**Files:**
- Create: `lib/services/password-reset.ts`
- Create: `__tests__/services/password-reset.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/services/password-reset.test.ts`:

```ts
import { createResetToken, validateResetToken, consumeResetToken } from "@/lib/services/password-reset"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"

jest.mock("@/lib/db", () => ({
  prisma: {
    passwordResetToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: { update: jest.fn() },
  },
}))

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("hashed-password"),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("createResetToken", () => {
  it("deletes existing tokens for user, creates new token, returns plaintext", async () => {
    mockPrisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 })
    mockPrisma.passwordResetToken.create.mockResolvedValue({} as any)

    const token = await createResetToken("user-1")

    expect(mockPrisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", usedAt: null },
    })
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-1" }) })
    )
    expect(typeof token).toBe("string")
    expect(token.length).toBe(64) // 32 bytes as hex
  })
})

describe("validateResetToken", () => {
  it("returns user when token is valid", async () => {
    const fakeUser = { id: "user-1", email: "a@b.com", name: "Alice" }
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue({
      user: fakeUser,
    } as any)

    const result = await validateResetToken("a".repeat(64))

    expect(result).toEqual(fakeUser)
    expect(mockPrisma.passwordResetToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ usedAt: null }),
        include: { user: true },
      })
    )
  })

  it("returns null when token not found", async () => {
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null)
    const result = await validateResetToken("b".repeat(64))
    expect(result).toBeNull()
  })
})

describe("consumeResetToken", () => {
  it("returns false when token is invalid", async () => {
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null)
    const result = await consumeResetToken("bad-token", "newpassword")
    expect(result).toBe(false)
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it("hashes new password, updates user and marks token used, returns true", async () => {
    const fakeUser = { id: "user-1", email: "a@b.com", name: "Alice" }
    mockPrisma.passwordResetToken.findFirst
      .mockResolvedValueOnce({ id: "tok-1", user: fakeUser } as any)
    mockPrisma.passwordResetToken.update.mockResolvedValue({} as any)
    mockPrisma.user.update.mockResolvedValue({} as any)

    const result = await consumeResetToken("a".repeat(64), "newpassword123")

    expect(result).toBe(true)
    expect(bcrypt.hash).toHaveBeenCalledWith("newpassword123", 12)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "hashed-password" },
    })
    expect(mockPrisma.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: "tok-1" },
      data: { usedAt: expect.any(Date) },
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/services/password-reset.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module '@/lib/services/password-reset'"

- [ ] **Step 3: Create `lib/services/password-reset.ts`**

```ts
import { createHash, randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"

function generateToken(): string {
  return randomBytes(32).toString("hex")
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export async function createResetToken(userId: string): Promise<string> {
  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } })
  await prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } })

  return token
}

export async function validateResetToken(token: string): Promise<{ id: string; email: string; name: string } | null> {
  const tokenHash = hashToken(token)
  const row = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  })
  if (!row) return null
  return row.user
}

export async function consumeResetToken(token: string, newPassword: string): Promise<boolean> {
  const tokenHash = hashToken(token)
  const row = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  })
  if (!row) return false

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({ where: { id: row.user.id }, data: { passwordHash } })
  await prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } })

  return true
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/services/password-reset.test.ts --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/services/password-reset.ts __tests__/services/password-reset.test.ts
git commit -m "feat: add password reset service with token create/validate/consume"
```

---

### Task 4: Password Reset API Routes

**Files:**
- Create: `app/api/auth/forgot-password/route.ts`
- Create: `app/api/auth/reset-password/route.ts`
- Create: `__tests__/api/auth/password-reset.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/auth/password-reset.test.ts`:

```ts
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route"
import { POST as resetPassword } from "@/app/api/auth/reset-password/route"
import { prisma } from "@/lib/db"
import { NextRequest } from "next/server"

jest.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: jest.fn() } },
}))

jest.mock("@/lib/services/password-reset", () => ({
  createResetToken: jest.fn().mockResolvedValue("tok123"),
  consumeResetToken: jest.fn(),
}))

jest.mock("@/lib/email", () => ({ sendEmail: jest.fn() }))

import { createResetToken, consumeResetToken } from "@/lib/services/password-reset"
import { sendEmail } from "@/lib/email"
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockCreateResetToken = createResetToken as jest.Mock
const mockConsumeResetToken = consumeResetToken as jest.Mock
const mockSendEmail = sendEmail as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/auth/forgot-password", () => {
  it("returns 200 when email not found (no enumeration)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const res = await forgotPassword(makeRequest({ email: "unknown@example.com" }))
    expect(res.status).toBe(200)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("returns 200 and sends email for approved credential user", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1", name: "Alice", email: "alice@example.com",
      passwordHash: "hash", status: "approved",
    } as any)
    const res = await forgotPassword(makeRequest({ email: "alice@example.com" }))
    expect(res.status).toBe(200)
    expect(mockCreateResetToken).toHaveBeenCalledWith("user-1")
    expect(mockSendEmail).toHaveBeenCalledWith(
      "alice@example.com",
      expect.any(String),
      expect.stringContaining("tok123")
    )
  })

  it("returns 200 silently for Google OAuth user (no passwordHash)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-2", name: "Bob", email: "bob@example.com",
      passwordHash: null, status: "approved",
    } as any)
    const res = await forgotPassword(makeRequest({ email: "bob@example.com" }))
    expect(res.status).toBe(200)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("returns 200 silently for pending user", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-3", name: "Carol", email: "carol@example.com",
      passwordHash: "hash", status: "pending",
    } as any)
    const res = await forgotPassword(makeRequest({ email: "carol@example.com" }))
    expect(res.status).toBe(200)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})

describe("POST /api/auth/reset-password", () => {
  it("returns 400 when token is invalid", async () => {
    mockConsumeResetToken.mockResolvedValue(false)
    const res = await resetPassword(makeRequest({ token: "badtoken", password: "newpass123" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("Invalid")
  })

  it("returns 400 when password is too short", async () => {
    const res = await resetPassword(makeRequest({ token: "tok", password: "short" }))
    expect(res.status).toBe(400)
  })

  it("returns 200 when token is valid and password updated", async () => {
    mockConsumeResetToken.mockResolvedValue(true)
    const res = await resetPassword(makeRequest({ token: "goodtoken", password: "newpassword123" }))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/api/auth/password-reset.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module '@/app/api/auth/forgot-password/route'"

- [ ] **Step 3: Create `app/api/auth/forgot-password/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { createResetToken } from "@/lib/services/password-reset"
import { sendEmail } from "@/lib/email"
import { passwordResetEmail } from "@/lib/email-templates"

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({}, { status: 200 }) }

  const email = typeof (body as any)?.email === "string" ? (body as any).email.trim().toLowerCase() : null
  if (!email) return NextResponse.json({}, { status: 200 })

  const user = await prisma.user.findUnique({ where: { email } })

  // Always return 200 — no user enumeration
  if (!user || !user.passwordHash || user.status !== "approved") {
    return NextResponse.json({}, { status: 200 })
  }

  const token = await createResetToken(user.id)
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`
  const { subject, html } = passwordResetEmail(user.name, resetUrl)
  sendEmail(user.email, subject, html)

  return NextResponse.json({}, { status: 200 })
}
```

- [ ] **Step 4: Create `app/api/auth/reset-password/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { consumeResetToken } from "@/lib/services/password-reset"
import { z } from "zod"

const ResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const parsed = ResetSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  const { token, password } = parsed.data
  const ok = await consumeResetToken(token, password)
  if (!ok) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest __tests__/api/auth/password-reset.test.ts --no-coverage
```

Expected: PASS (7 tests)

- [ ] **Step 6: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add app/api/auth/forgot-password/route.ts app/api/auth/reset-password/route.ts __tests__/api/auth/password-reset.test.ts
git commit -m "feat: add forgot-password and reset-password API routes"
```

---

### Task 5: Password Reset Pages

**Files:**
- Create: `app/(auth)/forgot-password/page.tsx`
- Create: `app/(auth)/reset-password/page.tsx`

No unit tests for these pages (they are client components with no testable logic beyond what the API tests already cover).

- [ ] **Step 1: Create `app/(auth)/forgot-password/page.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `app/(auth)/reset-password/page.tsx`**

```tsx
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
    if (password !== confirm) { setError("Passwords do not match"); return }
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
```

- [ ] **Step 3: Add "Forgot password?" link to the login page**

Open `app/(auth)/login/page.tsx` (or `app/(auth)/signin/page.tsx` - check which exists). Find the existing form and add a forgot password link below the password field or below the submit button. Add:

```tsx
<p className="text-xs text-[#666688] text-center">
  <Link href="/auth/forgot-password" className="text-[#00ff88] hover:underline">Forgot password?</Link>
</p>
```

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/forgot-password/page.tsx app/\(auth\)/reset-password/page.tsx
git commit -m "feat: add forgot-password and reset-password pages"
```

---

### Task 6: Email Notifications

**Files:**
- Modify: `app/api/auth/register/route.ts`
- Modify: `app/api/admin/users/[id]/approve/route.ts`
- Modify: `app/api/admin/users/[id]/reject/route.ts`
- Create: `__tests__/api/auth/register-email.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/auth/register-email.test.ts`:

```ts
import { POST as register } from "@/app/api/auth/register/route"
import { POST as approve } from "@/app/api/admin/users/[id]/approve/route"
import { POST as reject } from "@/app/api/admin/users/[id]/reject/route"
import { prisma } from "@/lib/db"
import { NextRequest } from "next/server"

jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}))

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))

jest.mock("@/lib/email", () => ({ sendEmail: jest.fn() }))

import { auth } from "@/lib/auth"
import { sendEmail } from "@/lib/email"
const mockAuth = auth as jest.Mock
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendEmail = sendEmail as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeRegisterRequest() {
  return new NextRequest("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Alice", email: "alice@example.com", password: "password123" }),
  })
}

function makeAdminRequest() {
  return new NextRequest("http://localhost/", { method: "POST" })
}

it("register sends registration received email on success", async () => {
  mockPrisma.user.findUnique.mockResolvedValue(null)
  mockPrisma.user.create.mockResolvedValue({
    id: "u1", email: "alice@example.com", name: "Alice", status: "pending",
  } as any)

  const res = await register(makeRegisterRequest())

  expect(res.status).toBe(201)
  expect(mockSendEmail).toHaveBeenCalledWith(
    "alice@example.com",
    expect.any(String),
    expect.stringContaining("Alice")
  )
})

it("register does NOT send email when email already registered", async () => {
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1" } as any)

  await register(makeRegisterRequest())

  expect(mockSendEmail).not.toHaveBeenCalled()
})

it("approve sends approval email", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "alice@example.com", name: "Alice" } as any)
  mockPrisma.user.update.mockResolvedValue({ id: "u1", status: "approved" } as any)

  await approve(makeAdminRequest(), { params: Promise.resolve({ id: "u1" }) })

  expect(mockSendEmail).toHaveBeenCalledWith(
    "alice@example.com",
    expect.any(String),
    expect.stringContaining("Alice")
  )
})

it("reject sends rejection email", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "alice@example.com", name: "Alice" } as any)
  mockPrisma.user.update.mockResolvedValue({ id: "u1", status: "rejected" } as any)

  await reject(makeAdminRequest(), { params: Promise.resolve({ id: "u1" }) })

  expect(mockSendEmail).toHaveBeenCalledWith(
    "alice@example.com",
    expect.any(String),
    expect.stringContaining("Alice")
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/api/auth/register-email.test.ts --no-coverage
```

Expected: FAIL - sendEmail not called (not yet wired in)

- [ ] **Step 3: Modify `app/api/auth/register/route.ts`**

Add imports at top:

```ts
import { sendEmail } from "@/lib/email"
import { registrationReceivedEmail } from "@/lib/email-templates"
```

Replace the final return statement (currently `return NextResponse.json({ ok: true }, { status: 201 })`):

```ts
  await prisma.user.create({ data: { email, name, passwordHash, status: "pending" } })
  const { subject, html } = registrationReceivedEmail(name)
  sendEmail(email, subject, html)
  return NextResponse.json({ ok: true }, { status: 201 })
```

- [ ] **Step 4: Modify `app/api/admin/users/[id]/approve/route.ts`**

Add imports at top:

```ts
import { sendEmail } from "@/lib/email"
import { accountApprovedEmail } from "@/lib/email-templates"
```

Replace the final return statement:

```ts
  const user = await prisma.user.update({ where: { id }, data: { status: "approved" } })
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const { subject, html } = accountApprovedEmail(existing.name, `${baseUrl}/login`)
  sendEmail(existing.email, subject, html)
  return NextResponse.json({ ok: true, user })
```

- [ ] **Step 5: Modify `app/api/admin/users/[id]/reject/route.ts`**

Add imports at top:

```ts
import { sendEmail } from "@/lib/email"
import { accountRejectedEmail } from "@/lib/email-templates"
```

Replace the final return statement:

```ts
  const user = await prisma.user.update({ where: { id }, data: { status: "rejected" } })
  const { subject, html } = accountRejectedEmail(existing.name)
  sendEmail(existing.email, subject, html)
  return NextResponse.json({ ok: true, user })
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx jest __tests__/api/auth/register-email.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 7: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add app/api/auth/register/route.ts app/api/admin/users/[id]/approve/route.ts app/api/admin/users/[id]/reject/route.ts __tests__/api/auth/register-email.test.ts
git commit -m "feat: send email notifications on registration, approval, and rejection"
```

---

### Task 7: Profile API Routes

**Files:**
- Create: `app/api/v1/profile/route.ts`
- Create: `app/api/v1/profile/password/route.ts`
- Create: `__tests__/api/v1/profile.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/v1/profile.test.ts`:

```ts
import { PATCH as patchProfile } from "@/app/api/v1/profile/route"
import { PATCH as patchPassword } from "@/app/api/v1/profile/password/route"
import { prisma } from "@/lib/db"
import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  },
}))
jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue("new-hash"),
}))

import { auth } from "@/lib/auth"
const mockAuth = auth as jest.Mock
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>

beforeEach(() => jest.clearAllMocks())

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("PATCH /api/v1/profile", () => {
  it("returns 401 with no session", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await patchProfile(makeRequest({ name: "Alice" }))
    expect(res.status).toBe(401)
  })

  it("returns 401 for admin session (no userId)", async () => {
    mockAuth.mockResolvedValue({ role: "admin" })
    const res = await patchProfile(makeRequest({ name: "Admin" }))
    expect(res.status).toBe(401)
  })

  it("updates name and returns 200", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", role: "user" })
    mockPrisma.user.findFirst.mockResolvedValue(null) // no email conflict check needed for name-only
    mockPrisma.user.update.mockResolvedValue({ id: "u1", name: "New Name", email: "a@b.com" } as any)

    const res = await patchProfile(makeRequest({ name: "New Name" }))
    expect(res.status).toBe(200)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({ name: "New Name" }),
    })
  })

  it("returns 422 when new email is already taken by another user", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", role: "user" })
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u2" } as any) // another user has this email

    const res = await patchProfile(makeRequest({ email: "taken@example.com" }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain("already in use")
  })
})

describe("PATCH /api/v1/profile/password", () => {
  it("returns 401 with no userId in session", async () => {
    mockAuth.mockResolvedValue({ role: "admin" })
    const res = await patchPassword(makeRequest({ currentPassword: "old", newPassword: "newpassword123" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when current password is wrong", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", role: "user" })
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", passwordHash: "old-hash" } as any)
    mockBcrypt.compare.mockResolvedValue(false as never)

    const res = await patchPassword(makeRequest({ currentPassword: "wrong", newPassword: "newpassword123" }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("incorrect")
  })

  it("updates password hash when current password is correct", async () => {
    mockAuth.mockResolvedValue({ userId: "u1", role: "user" })
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", passwordHash: "old-hash" } as any)
    mockBcrypt.compare.mockResolvedValue(true as never)
    mockPrisma.user.update.mockResolvedValue({} as any)

    const res = await patchPassword(makeRequest({ currentPassword: "correctpassword", newPassword: "newpassword123" }))
    expect(res.status).toBe(200)
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "new-hash" },
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/api/v1/profile.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module '@/app/api/v1/profile/route'"

- [ ] **Step 3: Create `app/api/v1/profile/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
})

export async function PATCH(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 422 })
  }

  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 422 })
  }

  const { name, email } = parsed.data

  if (email) {
    const conflict = await prisma.user.findFirst({ where: { email, NOT: { id: userId } } })
    if (conflict) {
      return NextResponse.json({ error: "Email already in use" }, { status: 422 })
    }
  }

  const data: Record<string, string> = {}
  if (name) data.name = name
  if (email) data.email = email

  const user = await prisma.user.update({ where: { id: userId }, data, select: { name: true, email: true } })
  return NextResponse.json(user)
}
```

- [ ] **Step 4: Create `app/api/v1/profile/password/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { z } from "zod"

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

export async function PATCH(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const parsed = ChangePasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }

  const { currentPassword, newPassword } = parsed.data

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true } })
  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest __tests__/api/v1/profile.test.ts --no-coverage
```

Expected: PASS (6 tests)

- [ ] **Step 6: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/api/v1/profile/route.ts app/api/v1/profile/password/route.ts __tests__/api/v1/profile.test.ts
git commit -m "feat: add profile PATCH routes for name/email and password change"
```

---

### Task 8: Profile Page + Navigation

**Files:**
- Create: `app/(dashboard)/profile/page.tsx`
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/bottom-nav.tsx`

No unit tests for these components (client UI with no independently testable logic).

- [ ] **Step 1: Create `app/(dashboard)/profile/page.tsx`**

This is a server component that fetches the user record, then renders a client component. Create the file:

```tsx
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { ProfileForm } from "@/components/profile/profile-form"

export default async function ProfilePage() {
  const session = await auth()
  const userId = session?.userId
  if (!userId) redirect("/login")

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, passwordHash: true },
  })
  if (!user) redirect("/login")

  return (
    <div className="p-6 space-y-6 max-w-lg">
      <h1 className="text-xl font-semibold text-[#c0c0d0]">Profile</h1>
      <ProfileForm
        initialName={user.name}
        initialEmail={user.email}
        hasPassword={user.passwordHash !== null}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create `components/profile/profile-form.tsx`**

```tsx
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
```

- [ ] **Step 3: Add Profile to sidebar**

Open `components/layout/sidebar.tsx`. The `links` array currently ends with `{ href: "/settings", label: "Settings" }`. Add Profile before Settings:

```ts
const links = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/projects", label: "Projects" },
  { href: "/tasks", label: "Tasks" },
  { href: "/calendar", label: "Calendar" },
  { href: "/reports", label: "Reports" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
]
```

- [ ] **Step 4: Add Profile to bottom nav**

Open `components/layout/bottom-nav.tsx`. The `tabs` array currently has 7 items. The bottom nav is already at 7 items which may be crowded, so replace the existing "Reports" tab with "Profile" since reports is still accessible on desktop:

Actually, add Profile after "Tasks" tab. The tabs array is:

```ts
const tabs = [
  { href: "/", label: "Home", icon: "⊞" },
  { href: "/contacts", label: "Contacts", icon: "👤" },
  { href: "/log", label: "Log", icon: "+" },
  { href: "/projects", label: "Projects", icon: "📋" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
  { href: "/calendar", label: "Cal", icon: "▦" },
  { href: "/profile", label: "Profile", icon: "◉" },
]
```

Remove "Reports" from the bottom nav (it remains in the sidebar) and replace the last item with Profile.

- [ ] **Step 5: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/\(dashboard\)/profile/page.tsx components/profile/profile-form.tsx components/layout/sidebar.tsx components/layout/bottom-nav.tsx
git commit -m "feat: add profile page with identity and password sections, add to nav"
```

---

## Self-Review

**Spec coverage:**
- Email infrastructure (Resend, `lib/email.ts`, `lib/email-templates.ts`): Task 1
- Email notifications on register/approve/reject: Task 6
- PasswordResetToken schema: Task 2
- Password reset service: Task 3
- Password reset routes: Task 4
- Password reset pages: Task 5
- Profile PATCH routes (name/email, password): Task 7
- Profile page + nav: Task 8

**Placeholder scan:** No TBDs or incomplete code blocks found.

**Type consistency:**
- `sendEmail(to, subject, html)` - consistent across Tasks 1, 4, 6
- `createResetToken(userId)` returns `string` - consistent between Tasks 3 and 4
- `consumeResetToken(token, password)` returns `boolean` - consistent between Tasks 3 and 4
- `validateResetToken(token)` returns `User | null` - defined in Task 3, used in Task 3 tests only (not called directly in routes - routes use `consumeResetToken`)
- `ProfileForm` props `{ initialName, initialEmail, hasPassword }` - consistent between Task 8 page and form component
- `PATCH /api/v1/profile` body `{ name?, email? }` - consistent between Task 7 route and Task 8 form
- `PATCH /api/v1/profile/password` body `{ currentPassword, newPassword }` - consistent between Task 7 route and Task 8 form
