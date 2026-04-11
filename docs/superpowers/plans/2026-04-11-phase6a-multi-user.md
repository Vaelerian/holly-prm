# Phase 6a: Multi-User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add invite-only multi-user support where each user has a private PRM and projects can be shared with team members.

**Architecture:** A `User` table stores registered accounts with approval status. All personal-data tables gain a nullable `userId` FK, populated via a one-time "claim unclaimed data" admin action. Auth splits: Google OAuth for the personal account, email/password for invited users, env-var admin unchanged. Project sharing uses a `ProjectMember` join table. Service functions gain a `userId` parameter for filtering; Holly API routes resolve `userId` from the validated API key.

**Tech Stack:** Next.js 16, NextAuth v5 beta (already installed), Prisma 7, PostgreSQL, bcryptjs (already installed), zod (already installed)

---

## File Map

**Create:**
- `types/next-auth.d.ts` — NextAuth session/JWT type augmentation
- `prisma/migrations/20260411000000_phase6a_multiuser/migration.sql`
- `app/api/auth/register/route.ts` — public registration endpoint
- `app/(auth)/register/page.tsx` — registration form UI
- `app/api/admin/users/[id]/approve/route.ts`
- `app/api/admin/users/[id]/reject/route.ts`
- `app/api/admin/claim-unclaimed/route.ts`
- `app/admin/page.tsx` — admin user management panel
- `app/api/v1/projects/[id]/members/route.ts` — add project member
- `app/api/v1/projects/[id]/members/[memberId]/route.ts` — remove project member

**Modify:**
- `prisma/schema.prisma` — User, ProjectMember, UserStatus enum, userId on 13 tables
- `lib/auth.ts` — multi-user Google OAuth + credentials + callbacks
- `lib/holly-auth.ts` — return `userId` from validated key
- `lib/services/contacts.ts` — userId param on all functions
- `lib/services/interactions.ts` — userId param
- `lib/services/action-items.ts` — userId param
- `lib/services/projects.ts` — userId param, shared project queries
- `lib/services/api-keys.ts` — userId param
- `lib/services/briefing.ts` — userId param on all queries
- `lib/services/vault.ts` — userId param on `getVaultConfig`, `isVaultAccessible`
- `lib/google.ts` — userId param on all functions
- `app/api/v1/contacts/route.ts` + `[id]/route.ts`
- `app/api/v1/interactions/route.ts` + `[id]/route.ts`
- `app/api/v1/action-items/route.ts` + `[id]/route.ts`
- `app/api/v1/projects/route.ts` + `[id]/route.ts`
- `app/api/v1/settings/api-keys/route.ts` + `[id]/route.ts`
- `app/api/v1/push/subscribe/route.ts` + `unsubscribe/route.ts`
- `app/api/v1/google/status/route.ts` + `connect/route.ts` + `callback/route.ts` + `disconnect/route.ts`
- `app/api/v1/calendar/events/route.ts` + `sync/route.ts`
- `app/api/v1/vault/status/route.ts` + `config/route.ts` + `sync/route.ts`
- `app/api/v1/cron/notify/route.ts` — per-user push notification scoping
- `app/api/holly/v1/contacts/route.ts` + `[id]/route.ts`
- `app/api/holly/v1/interactions/route.ts` + `[id]/route.ts`
- `app/api/holly/v1/action-items/route.ts` + `[id]/route.ts`
- `app/api/holly/v1/briefing/route.ts`
- `app/api/holly/v1/vault/search/route.ts` + `note/route.ts` + `sync/route.ts`
- `app/(dashboard)/projects/[id]/page.tsx` — members section

---

## Task 1: Schema and Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260411000000_phase6a_multiuser/migration.sql`

- [ ] **Step 1: Add UserStatus enum and User model to schema**

In `prisma/schema.prisma`, after the existing `enum Actor` block, add:

```prisma
enum UserStatus {
  pending
  approved
  rejected
}

model User {
  id           String     @id @default(uuid())
  email        String     @unique
  name         String
  passwordHash String?
  status       UserStatus @default(pending)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  contacts          Contact[]
  interactions      Interaction[]
  actionItems       ActionItem[]
  projects          Project[]
  projectMemberships ProjectMember[]
  auditLogs         AuditLog[]
  knowledgeItems    KnowledgeItem[]
  hollyApiKeys      HollyApiKey[]
  pushSubscriptions PushSubscription[]
  googleToken       GoogleToken?
  calendarSync      CalendarSync?
  userPreference    UserPreference?
  vaultConfig       VaultConfig?
  vaultNotes        VaultNote[]
}

model ProjectMember {
  id        String   @id @default(uuid())
  projectId String
  userId    String
  createdAt DateTime @default(now())

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
}
```

- [ ] **Step 2: Add userId and members relation to Project model**

Find the `model Project` block and add inside it:

```prisma
  userId  String?
  user    User?          @relation(fields: [userId], references: [id])
  members ProjectMember[]
```

- [ ] **Step 3: Add userId to the remaining 12 personal-data models**

For each of the following models, add `userId String?` and the relation `user User? @relation(fields: [userId], references: [id])`:

- `Contact`
- `Interaction`
- `ActionItem`
- `AuditLog`
- `KnowledgeItem`
- `HollyApiKey`
- `PushSubscription`
- `GoogleToken`
- `CalendarSync`
- `UserPreference`
- `VaultConfig`
- `VaultNote`

Example for Contact (add these two lines inside the model):
```prisma
  userId String?
  user   User?   @relation(fields: [userId], references: [id])
```

- [ ] **Step 4: Create the migration SQL file**

Create `prisma/migrations/20260411000000_phase6a_multiuser/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddColumn: nullable userId on all personal-data tables
ALTER TABLE "Contact" ADD COLUMN "userId" TEXT;
ALTER TABLE "Interaction" ADD COLUMN "userId" TEXT;
ALTER TABLE "ActionItem" ADD COLUMN "userId" TEXT;
ALTER TABLE "Project" ADD COLUMN "userId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "userId" TEXT;
ALTER TABLE "KnowledgeItem" ADD COLUMN "userId" TEXT;
ALTER TABLE "HollyApiKey" ADD COLUMN "userId" TEXT;
ALTER TABLE "PushSubscription" ADD COLUMN "userId" TEXT;
ALTER TABLE "GoogleToken" ADD COLUMN "userId" TEXT;
ALTER TABLE "CalendarSync" ADD COLUMN "userId" TEXT;
ALTER TABLE "UserPreference" ADD COLUMN "userId" TEXT;
ALTER TABLE "VaultConfig" ADD COLUMN "userId" TEXT;
ALTER TABLE "VaultNote" ADD COLUMN "userId" TEXT;

-- AddForeignKey: userId columns (SET NULL on user delete - data becomes unclaimed, not deleted)
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HollyApiKey" ADD CONSTRAINT "HollyApiKey_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoogleToken" ADD CONSTRAINT "GoogleToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarSync" ADD CONSTRAINT "CalendarSync_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VaultConfig" ADD CONSTRAINT "VaultConfig_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VaultNote" ADD CONSTRAINT "VaultNote_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Apply migration**

Run:
```bash
npx prisma migrate deploy
```
Expected: "1 migration applied"

Then regenerate the Prisma client:
```bash
npx prisma generate
```

- [ ] **Step 6: Verify schema compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors (userId fields are all nullable so existing code still compiles)

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add User, ProjectMember schema and userId columns for multi-user"
```

---

## Task 2: NextAuth Session Types and Auth Refactor

**Files:**
- Create: `types/next-auth.d.ts`
- Modify: `lib/auth.ts`
- Modify: `lib/holly-auth.ts`
- Test: `__tests__/lib/holly-auth.test.ts`

- [ ] **Step 1: Write failing tests for holly-auth userId**

Read `__tests__/lib/holly-auth.test.ts`. Add two new tests after the existing ones:

```ts
it("returns userId of the matched key owner", async () => {
  const plaintext = "hky_testkey123"
  const hash = await bcrypt.hash(plaintext, 12)
  mockPrisma.hollyApiKey.findMany.mockResolvedValue([
    { id: "key-1", keyHash: hash, userId: "user-abc" },
  ] as any)
  mockPipeline.exec.mockResolvedValue([[null, 1], [null, true]])

  const req = new NextRequest("http://localhost/api/test", {
    headers: { "x-holly-api-key": plaintext },
  })
  const result = await validateHollyRequest(req)

  expect(result.valid).toBe(true)
  if (result.valid) {
    expect(result.userId).toBe("user-abc")
  }
})

it("returns valid: false when key has no userId (unclaimed)", async () => {
  const plaintext = "hky_testkey456"
  const hash = await bcrypt.hash(plaintext, 12)
  mockPrisma.hollyApiKey.findMany.mockResolvedValue([
    { id: "key-2", keyHash: hash, userId: null },
  ] as any)
  mockPipeline.exec.mockResolvedValue([[null, 1], [null, true]])

  const req = new NextRequest("http://localhost/api/test", {
    headers: { "x-holly-api-key": plaintext },
  })
  const result = await validateHollyRequest(req)

  expect(result.valid).toBe(false)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/lib/holly-auth.test.ts
```
Expected: FAIL — "userId" is not in the return type yet

- [ ] **Step 3: Create NextAuth session type augmentation**

Create `types/next-auth.d.ts`:

```ts
import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    userId?: string
    role: "user" | "admin"
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string
    role?: "user" | "admin"
  }
}
```

- [ ] **Step 4: Rewrite lib/auth.ts**

```ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"

const secret = process.env.AUTH_SECRET
if (!secret) throw new Error("AUTH_SECRET environment variable is not set")

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        // Admin check (env-var based, separate identity from User table)
        const adminEmail = process.env.ADMIN_EMAIL
        const adminHash = process.env.ADMIN_PASSWORD_HASH
        if (adminEmail && adminHash && email === adminEmail) {
          const valid = await bcrypt.compare(password, adminHash)
          if (!valid) return null
          return { id: "admin", email: adminEmail, name: "Admin", role: "admin" } as any
        }

        // Regular user (DB-based)
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user || !user.passwordHash || user.status !== "approved") return null
        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null
        return { id: user.id, email: user.email, name: user.name, role: "user" } as any
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google" && profile?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: profile.email } })
        if (!dbUser) {
          // Create pending account — must be approved before first access
          await prisma.user.create({
            data: {
              email: profile.email,
              name: profile.name ?? profile.email,
              status: "pending",
            },
          })
          return "/login?error=pending"
        }
        if (dbUser.status !== "approved") return "/login?error=pending"
      }
      return true
    },
    async jwt({ token, user, account }) {
      // user is only present on initial sign-in
      if (user) {
        const role = (user as any).role as "user" | "admin" | undefined
        if (role === "admin") {
          token.role = "admin"
        } else {
          token.role = "user"
          if (account?.provider === "google" && token.email) {
            // Google OAuth: look up our DB user ID from email
            const dbUser = await prisma.user.findUnique({ where: { email: token.email } })
            if (dbUser) token.userId = dbUser.id
          } else {
            // Credentials: user.id is already our DB user ID
            token.userId = user.id
          }
        }
      }
      return token
    },
    async session({ session, token }) {
      session.role = (token.role as "user" | "admin") ?? "user"
      if (token.userId) session.userId = token.userId as string
      return session
    },
  },
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
})
```

- [ ] **Step 5: Update lib/holly-auth.ts**

Replace the `ValidationResult` interface and the return statement:

```ts
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import bcrypt from "bcryptjs"

type ValidationResult =
  | { valid: true; keyId: string; userId: string }
  | { valid: false; rateLimited?: boolean }

export async function validateHollyRequest(req: NextRequest): Promise<ValidationResult> {
  const apiKey = req.headers.get("x-holly-api-key")
  if (!apiKey || !apiKey.startsWith("hky_")) return { valid: false }

  const keys = await prisma.hollyApiKey.findMany()
  let matchedKeyId: string | undefined
  let matchedUserId: string | null | undefined
  for (const key of keys) {
    const match = await bcrypt.compare(apiKey, key.keyHash)
    if (match) {
      matchedKeyId = key.id
      matchedUserId = key.userId
      break
    }
  }

  if (!matchedKeyId) return { valid: false }

  // Reject unclaimed keys (no userId assigned) — user must claim data first
  if (!matchedUserId) return { valid: false }

  const rateLimitKey = `holly:ratelimit:${apiKey.slice(0, 24)}`
  let count: number
  try {
    const pipeline = redis.pipeline()
    pipeline.incr(rateLimitKey)
    pipeline.expire(rateLimitKey, 60, "NX")
    const results = await pipeline.exec()
    count = (results?.[0]?.[1] as number) ?? 0
  } catch {
    return { valid: false, rateLimited: true }
  }

  if (count > 1000) return { valid: false, rateLimited: true }

  prisma.hollyApiKey
    .update({ where: { id: matchedKeyId }, data: { lastUsed: new Date() } })
    .catch((err) => console.error("[holly-auth] lastUsed update failed", err))

  return { valid: true, keyId: matchedKeyId, userId: matchedUserId }
}
```

- [ ] **Step 6: Run tests**

```bash
npx jest __tests__/lib/holly-auth.test.ts
```
Expected: all tests pass

- [ ] **Step 7: Run full suite**

```bash
npx jest
```
Expected: all tests pass (existing tests unaffected — userId fields are new optional returns)

- [ ] **Step 8: Commit**

```bash
git add types/next-auth.d.ts lib/auth.ts lib/holly-auth.ts __tests__/lib/holly-auth.test.ts
git commit -m "feat: multi-user auth — Google OAuth + credentials + userId in session and Holly auth"
```

---

## Task 3: Registration Route and Page

**Files:**
- Create: `app/api/auth/register/route.ts`
- Create: `app/(auth)/register/page.tsx`
- Test: `__tests__/api/auth/register.test.ts`

- [ ] **Step 1: Write failing test**

Create `__tests__/api/auth/register.test.ts`:

```ts
import { POST } from "@/app/api/auth/register/route"
import { prisma } from "@/lib/db"
import { NextRequest } from "next/server"
import bcrypt from "bcryptjs"

jest.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: jest.fn(), create: jest.fn() } },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

it("creates a pending user and returns 201", async () => {
  mockPrisma.user.findUnique.mockResolvedValue(null)
  mockPrisma.user.create.mockResolvedValue({ id: "u1" } as any)

  const res = await POST(makeRequest({ email: "alice@example.com", name: "Alice", password: "password123" }))

  expect(res.status).toBe(201)
  expect(mockPrisma.user.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ email: "alice@example.com", name: "Alice", status: "pending" }),
    })
  )
  // Password should be hashed
  const createCall = mockPrisma.user.create.mock.calls[0][0]
  expect(createCall.data.passwordHash).toBeDefined()
  const valid = await bcrypt.compare("password123", createCall.data.passwordHash)
  expect(valid).toBe(true)
})

it("returns 422 when email is already registered", async () => {
  mockPrisma.user.findUnique.mockResolvedValue({ id: "existing" } as any)

  const res = await POST(makeRequest({ email: "alice@example.com", name: "Alice", password: "password123" }))

  expect(res.status).toBe(422)
  const body = await res.json()
  expect(body.error).toBe("Email already registered")
})

it("returns 422 for invalid input", async () => {
  const res = await POST(makeRequest({ email: "not-an-email", name: "", password: "short" }))
  expect(res.status).toBe(422)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/api/auth/register.test.ts
```
Expected: FAIL — route does not exist

- [ ] **Step 3: Create the registration API route**

Create `app/api/auth/register/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { z } from "zod"

const RegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = RegisterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 422 })
  }

  const { email, name, password } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 422 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.create({ data: { email, name, passwordHash, status: "pending" } })

  return NextResponse.json({ ok: true }, { status: 201 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/api/auth/register.test.ts
```
Expected: 3 tests pass

- [ ] **Step 5: Create the registration page**

Create `app/(auth)/register/page.tsx`:

```tsx
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
    setLoading(false)
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-xl font-semibold text-[#c0c0d0]">Request submitted</h1>
          <p className="text-sm text-[#666688]">Your account is pending approval. You will be able to sign in once approved.</p>
          <Link href="/login" className="text-sm text-[#00ff88] hover:underline">Back to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a1a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold text-[#c0c0d0]">Request access</h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required />
          <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <Input type="password" placeholder="Password (min 8 characters)" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p className="text-xs text-[#ff4444]">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Submitting..." : "Request access"}
          </Button>
        </form>
        <p className="text-xs text-[#666688] text-center">
          Already have access? <Link href="/login" className="text-[#00ff88] hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Add "Request access" link to the login page**

Read `app/(auth)/login/page.tsx`. At the bottom of the form JSX (after the last button/section), add:

```tsx
<p className="text-xs text-[#666688] text-center mt-4">
  Need access? <Link href="/register" className="text-[#00ff88] hover:underline">Request an account</Link>
</p>
```

Make sure `Link` is imported from `"next/link"`.

- [ ] **Step 7: Run full test suite**

```bash
npx jest
```
Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add app/api/auth/register/ app/\(auth\)/register/ app/\(auth\)/login/page.tsx __tests__/api/auth/register.test.ts
git commit -m "feat: add registration route and page"
```

---

## Task 4: Admin Routes and Panel

**Files:**
- Create: `app/api/admin/users/[id]/approve/route.ts`
- Create: `app/api/admin/users/[id]/reject/route.ts`
- Create: `app/api/admin/claim-unclaimed/route.ts`
- Create: `app/admin/page.tsx`
- Test: `__tests__/api/admin/users.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/admin/users.test.ts`:

```ts
import { POST as approve } from "@/app/api/admin/users/[id]/approve/route"
import { POST as reject } from "@/app/api/admin/users/[id]/reject/route"
import { POST as claimUnclaimed } from "@/app/api/admin/claim-unclaimed/route"
import { prisma } from "@/lib/db"
import { NextRequest } from "next/server"

jest.mock("@/lib/db", () => ({
  prisma: {
    user: { update: jest.fn(), findUnique: jest.fn() },
    contact: { updateMany: jest.fn() },
    interaction: { updateMany: jest.fn() },
    actionItem: { updateMany: jest.fn() },
    project: { updateMany: jest.fn() },
    auditLog: { updateMany: jest.fn() },
    knowledgeItem: { updateMany: jest.fn() },
    hollyApiKey: { updateMany: jest.fn() },
    pushSubscription: { updateMany: jest.fn() },
    googleToken: { updateMany: jest.fn() },
    calendarSync: { updateMany: jest.fn() },
    userPreference: { updateMany: jest.fn() },
    vaultConfig: { updateMany: jest.fn() },
    vaultNote: { updateMany: jest.fn() },
  },
}))

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}))

import { auth } from "@/lib/auth"
const mockAuth = auth as jest.Mock
const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

function makeRequest(body?: unknown) {
  return new NextRequest("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
}

it("approve returns 401 if not admin", async () => {
  mockAuth.mockResolvedValue({ role: "user", userId: "u1" })
  const res = await approve(makeRequest(), { params: Promise.resolve({ id: "target-id" }) })
  expect(res.status).toBe(401)
})

it("approve sets user status to approved", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  mockPrisma.user.update.mockResolvedValue({ id: "target-id", status: "approved" } as any)
  const res = await approve(makeRequest(), { params: Promise.resolve({ id: "target-id" }) })
  expect(res.status).toBe(200)
  expect(mockPrisma.user.update).toHaveBeenCalledWith({
    where: { id: "target-id" },
    data: { status: "approved" },
  })
})

it("reject sets user status to rejected", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  mockPrisma.user.update.mockResolvedValue({ id: "target-id", status: "rejected" } as any)
  const res = await reject(makeRequest(), { params: Promise.resolve({ id: "target-id" }) })
  expect(res.status).toBe(200)
  expect(mockPrisma.user.update).toHaveBeenCalledWith({
    where: { id: "target-id" },
    data: { status: "rejected" },
  })
})

it("claim-unclaimed assigns null-userId records to target user", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", status: "approved" } as any)
  // All updateMany calls return { count: 0 }
  Object.values(mockPrisma).forEach((m: any) => {
    if (m.updateMany) m.updateMany.mockResolvedValue({ count: 0 })
  })

  const res = await claimUnclaimed(makeRequest({ userId: "u1" }))
  expect(res.status).toBe(200)
  expect(mockPrisma.contact.updateMany).toHaveBeenCalledWith({
    where: { userId: null },
    data: { userId: "u1" },
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/api/admin/users.test.ts
```
Expected: FAIL — routes do not exist

- [ ] **Step 3: Create approve route**

Create `app/api/admin/users/[id]/approve/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await params
  const user = await prisma.user.update({ where: { id }, data: { status: "approved" } })
  return NextResponse.json({ ok: true, user })
}
```

- [ ] **Step 4: Create reject route**

Create `app/api/admin/users/[id]/reject/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { id } = await params
  const user = await prisma.user.update({ where: { id }, data: { status: "rejected" } })
  return NextResponse.json({ ok: true, user })
}
```

- [ ] **Step 5: Create claim-unclaimed route**

Create `app/api/admin/claim-unclaimed/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const Schema = z.object({ userId: z.string().min(1) })

export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 422 })
  }
  const { userId } = parsed.data

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.status !== "approved") {
    return NextResponse.json({ error: "User not found or not approved" }, { status: 404 })
  }

  const filter = { where: { userId: null }, data: { userId } }
  const [
    contacts, interactions, actionItems, projects, auditLogs,
    knowledgeItems, hollyApiKeys, pushSubscriptions, googleTokens,
    calendarSyncs, userPreferences, vaultConfigs, vaultNotes,
  ] = await Promise.all([
    prisma.contact.updateMany(filter),
    prisma.interaction.updateMany(filter),
    prisma.actionItem.updateMany(filter),
    prisma.project.updateMany(filter),
    prisma.auditLog.updateMany(filter),
    prisma.knowledgeItem.updateMany(filter),
    prisma.hollyApiKey.updateMany(filter),
    prisma.pushSubscription.updateMany(filter),
    prisma.googleToken.updateMany(filter),
    prisma.calendarSync.updateMany(filter),
    prisma.userPreference.updateMany(filter),
    prisma.vaultConfig.updateMany(filter),
    prisma.vaultNote.updateMany(filter),
  ])

  return NextResponse.json({
    ok: true,
    claimed: {
      contacts: contacts.count, interactions: interactions.count,
      actionItems: actionItems.count, projects: projects.count,
      auditLogs: auditLogs.count, knowledgeItems: knowledgeItems.count,
      hollyApiKeys: hollyApiKeys.count, pushSubscriptions: pushSubscriptions.count,
      googleTokens: googleTokens.count, calendarSyncs: calendarSyncs.count,
      userPreferences: userPreferences.count, vaultConfigs: vaultConfigs.count,
      vaultNotes: vaultNotes.count,
    },
  })
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx jest __tests__/api/admin/users.test.ts
```
Expected: all tests pass

- [ ] **Step 7: Create the admin page**

Create `app/admin/page.tsx`:

```tsx
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"
import { AdminPanel } from "@/components/admin/admin-panel"

export default async function AdminPage() {
  const session = await auth()
  if (session?.role !== "admin") redirect("/login")

  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } })
  const approvedUsers = users.filter(u => u.status === "approved")

  return <AdminPanel users={users} approvedUsers={approvedUsers} />
}
```

Create `components/admin/admin-panel.tsx`:

```tsx
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
  approvedUsers: User[]
}

export function AdminPanel({ users, approvedUsers }: Props) {
  const [userList, setUserList] = useState(users)
  const [claimUserId, setClaimUserId] = useState(approvedUsers[0]?.id ?? "")
  const [claimResult, setClaimResult] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)

  const pending = userList.filter(u => u.status === "pending")
  const approved = userList.filter(u => u.status === "approved")

  async function updateStatus(id: string, action: "approve" | "reject") {
    setWorking(id)
    await fetch(`/api/admin/users/${id}/${action}`, { method: "POST" })
    setUserList(prev =>
      prev.map(u => u.id === id ? { ...u, status: action === "approve" ? "approved" : "rejected" } : u)
    )
    setWorking(null)
  }

  async function claimUnclaimed() {
    if (!claimUserId) return
    setWorking("claim")
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
    setWorking(null)
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold text-[#c0c0d0]">Admin</h1>

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
            {approvedUsers.map(u => (
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
```

- [ ] **Step 8: Run full test suite**

```bash
npx jest
```
Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add app/api/admin/ app/admin/ components/admin/ __tests__/api/admin/
git commit -m "feat: admin approval panel and claim-unclaimed endpoint"
```

---

## Task 5: Service Layer — Contacts and Interactions

**Files:**
- Modify: `lib/services/contacts.ts`
- Modify: `lib/services/interactions.ts`
- Modify: `app/api/v1/contacts/route.ts`
- Modify: `app/api/v1/contacts/[id]/route.ts`
- Modify: `app/api/v1/interactions/route.ts`
- Modify: `app/api/v1/interactions/[id]/route.ts`
- Test: `__tests__/services/contacts.test.ts`

- [ ] **Step 1: Write failing tests for contacts service**

Read `__tests__/services/contacts.test.ts`. Add tests for userId scoping:

```ts
it("listContacts filters by userId", async () => {
  mockPrisma.contact.findMany.mockResolvedValue([{ id: "c1", name: "Alice" }] as any)

  const result = await listContacts({ userId: "user-1" })

  expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ userId: "user-1" }) })
  )
  expect(result).toHaveLength(1)
})

it("getContact returns null when contact belongs to different user", async () => {
  mockPrisma.contact.findFirst.mockResolvedValue(null)

  const result = await getContact("c1", "user-2")

  expect(mockPrisma.contact.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "c1", userId: "user-2" } })
  )
  expect(result).toBeNull()
})

it("createContact sets userId on the new record", async () => {
  mockPrisma.contact.create.mockResolvedValue({ id: "c2", userId: "user-1" } as any)
  mockPrisma.auditLog.create.mockResolvedValue({} as any)

  await createContact({ name: "Bob" } as any, "ian", "user-1")

  expect(mockPrisma.contact.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ userId: "user-1" }) })
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/services/contacts.test.ts
```
Expected: FAIL — functions don't accept userId yet

- [ ] **Step 3: Update lib/services/contacts.ts**

```ts
import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import type { CreateContactInput, UpdateContactInput } from "@/lib/validations/contact"

interface ListContactsOptions {
  q?: string
  type?: string
  overdue?: boolean
  userId: string
}

export async function listContacts(opts: ListContactsOptions) {
  const where: Record<string, unknown> = { userId: opts.userId }
  if (opts.q) where.name = { contains: opts.q, mode: "insensitive" }
  if (opts.type) where.type = opts.type
  if (opts.overdue) {
    where.interactionFreqDays = { not: null }
    where.OR = [{ healthScore: { lt: 100 } }, { lastInteraction: null }]
  }
  return prisma.contact.findMany({ where, orderBy: { name: "asc" } })
}

export async function getContact(id: string, userId: string) {
  return prisma.contact.findFirst({
    where: { id, userId },
    include: {
      interactions: {
        orderBy: { occurredAt: "desc" },
        take: 20,
        include: { actionItems: { orderBy: { createdAt: "asc" } } },
      },
    },
  })
}

export async function createContact(data: CreateContactInput, actor: Actor, userId: string) {
  const contact = await prisma.contact.create({ data: { ...(data as any), userId } })
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: contact.id, action: "create", actor, userId },
  })
  return contact
}

export async function updateContact(id: string, data: UpdateContactInput, actor: Actor, userId: string) {
  // Verify ownership first
  const existing = await prisma.contact.findFirst({ where: { id, userId } })
  if (!existing) return null
  const before = existing
  const contact = await prisma.contact.update({ where: { id }, data: data as any })
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: id, action: "update", actor, userId, diff: { before, after: contact } },
  })
  return contact
}

export async function deleteContact(id: string, actor: Actor, userId: string) {
  // Verify ownership first
  const existing = await prisma.contact.findFirst({ where: { id, userId } })
  if (!existing) return null
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: id, action: "delete", actor, userId },
  })
  return prisma.contact.delete({ where: { id } })
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/services/contacts.test.ts
```
Expected: all tests pass

- [ ] **Step 5: Update contacts routes**

Replace `app/api/v1/contacts/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listContacts, createContact } from "@/lib/services/contacts"
import { CreateContactSchema } from "@/lib/validations/contact"

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { searchParams } = req.nextUrl
  const contacts = await listContacts({
    q: searchParams.get("q") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    overdue: searchParams.get("overdue") === "true",
    userId,
  })
  return NextResponse.json(contacts)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateContactSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const contact = await createContact(parsed.data, "ian", userId)
  return NextResponse.json(contact, { status: 201 })
}
```

Replace `app/api/v1/contacts/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getContact, updateContact, deleteContact } from "@/lib/services/contacts"
import { UpdateContactSchema } from "@/lib/validations/contact"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const contact = await getContact(id, userId)
  if (!contact) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(contact)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const parsed = UpdateContactSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const contact = await updateContact(id, parsed.data, "ian", userId)
  if (!contact) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(contact)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const result = await deleteContact(id, "ian", userId)
  if (!result) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 6: Update interactions service and routes**

Read `lib/services/interactions.ts`. Apply the same pattern:
- Add `userId: string` to `listInteractions`, `getInteraction`, `createInteraction`, `updateInteraction`, `deleteInteraction`
- `listInteractions`: add `{ userId }` to the `where` clause
- `getInteraction`: use `findFirst({ where: { id, userId } })` instead of `findUnique`
- `createInteraction`: pass `userId` to `prisma.interaction.create` data and `auditLog`
- `updateInteraction`: verify ownership with `findFirst({ where: { id, userId } })`, return null if not found
- `deleteInteraction`: verify ownership, return null if not found

Read `app/api/v1/interactions/route.ts` and `app/api/v1/interactions/[id]/route.ts`. Apply the same pattern as contacts routes:
- Extract `const userId = session?.userId` after `await auth()`
- Return 401 if `!userId`
- Pass `userId` to all service function calls

- [ ] **Step 7: Run full test suite**

```bash
npx jest
```
Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add lib/services/contacts.ts lib/services/interactions.ts app/api/v1/contacts/ app/api/v1/interactions/ __tests__/services/contacts.test.ts
git commit -m "feat: scope contacts and interactions by userId"
```

---

## Task 6: Service Layer — Action Items and Projects

**Files:**
- Modify: `lib/services/action-items.ts`
- Modify: `lib/services/projects.ts`
- Modify: `app/api/v1/action-items/route.ts` + `[id]/route.ts`
- Modify: `app/api/v1/projects/route.ts` + `[id]/route.ts`
- Test: `__tests__/services/projects.test.ts`

- [ ] **Step 1: Write failing tests for projects service**

Read `__tests__/services/projects.test.ts`. Add:

```ts
it("listProjects returns owned and shared projects for userId", async () => {
  mockPrisma.project.findMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }] as any)

  await listProjects({ userId: "user-1" })

  expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        OR: [
          { userId: "user-1" },
          { members: { some: { userId: "user-1" } } },
        ],
      },
    })
  )
})

it("createProject sets userId on the record", async () => {
  mockPrisma.project.create.mockResolvedValue({ id: "p1", userId: "user-1" } as any)
  mockPrisma.auditLog.create.mockResolvedValue({} as any)

  await createProject({ title: "Project A" } as any, "ian", "user-1")

  expect(mockPrisma.project.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ userId: "user-1" }) })
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/services/projects.test.ts
```
Expected: FAIL

- [ ] **Step 3: Update lib/services/projects.ts**

Read the full file. Apply these changes:

**`listProjects`** — add `userId: string` to the options interface and update the `where` clause:

```ts
interface ListProjectsOptions {
  status?: string
  userId: string
}

export async function listProjects(opts: ListProjectsOptions) {
  const statusWhere = opts.status ? { status: opts.status } : {}
  return prisma.project.findMany({
    where: {
      ...statusWhere,
      OR: [
        { userId: opts.userId },
        { members: { some: { userId: opts.userId } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { tasks: true } },
      tasks: { select: { status: true, isMilestone: true } },
    },
  })
}
```

**`getProject`** — add `userId: string`, use `findFirst` with ownership OR membership check:

```ts
export async function getProject(id: string, userId: string) {
  return prisma.project.findFirst({
    where: {
      id,
      OR: [
        { userId },
        { members: { some: { userId } } },
      ],
    },
    include: {
      tasks: {
        orderBy: [{ isMilestone: "desc" }, { createdAt: "asc" }],
        include: { actionItems: { orderBy: { createdAt: "asc" } } },
      },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  })
}
```

**`createProject`** — add `userId: string`, include in create data and auditLog:

```ts
export async function createProject(data: CreateProjectInput, actor: Actor, userId: string) {
  const project = await prisma.project.create({
    data: { ...data, targetDate: data.targetDate ? new Date(data.targetDate) : null, userId },
  })
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: project.id, action: "create", actor, userId },
  })
  if (project.targetDate) {
    void upsertCalendarEvent("project", project.id, { title: project.title, date: project.targetDate })
  }
  return project
}
```

**`updateProject`** — add `userId: string`, verify ownership (only owner can update):

```ts
export async function updateProject(id: string, data: UpdateProjectInput, actor: Actor, userId: string) {
  const existing = await prisma.project.findFirst({ where: { id, userId } })
  if (!existing) return null
  // ... rest of existing update logic, add userId to auditLog
}
```

**`deleteProject`** — add `userId: string`, verify ownership:

```ts
export async function deleteProject(id: string, actor: Actor, userId: string) {
  const existing = await prisma.project.findFirst({ where: { id, userId } })
  if (!existing) return null
  // ... rest of existing delete logic, add userId to auditLog
}
```

- [ ] **Step 4: Update projects routes**

Apply the same pattern as contacts routes. In `app/api/v1/projects/route.ts` and `app/api/v1/projects/[id]/route.ts`:
- Extract `const userId = session?.userId`, return 401 if missing
- Pass `userId` to all service calls
- Return 404 when service returns null (ownership check failed)

- [ ] **Step 5: Update action-items service and routes**

Read `lib/services/action-items.ts`. Apply the same userId pattern:
- `listActionItems`: add `userId: string`, filter by `{ userId }` in where clause
- `getActionItem`: use `findFirst({ where: { id, userId } })`
- `createActionItem`: pass `userId` to create data and auditLog
- `updateActionItem`: verify ownership with findFirst, return null if not found
- `deleteActionItem`: verify ownership, return null if not found

Read `app/api/v1/action-items/route.ts` and `[id]/route.ts`. Apply the same route pattern.

- [ ] **Step 6: Run tests**

```bash
npx jest __tests__/services/projects.test.ts
npx jest
```
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add lib/services/projects.ts lib/services/action-items.ts app/api/v1/projects/ app/api/v1/action-items/ __tests__/services/projects.test.ts
git commit -m "feat: scope projects and action-items by userId, shared project queries"
```

---

## Task 7: ProjectMember API Routes

**Files:**
- Create: `app/api/v1/projects/[id]/members/route.ts`
- Create: `app/api/v1/projects/[id]/members/[memberId]/route.ts`
- Test: `__tests__/api/projects/members.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/projects/members.test.ts`:

```ts
import { POST as addMember } from "@/app/api/v1/projects/[id]/members/route"
import { DELETE as removeMember } from "@/app/api/v1/projects/[id]/members/[memberId]/route"
import { prisma } from "@/lib/db"
import { NextRequest } from "next/server"

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/db", () => ({
  prisma: {
    project: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    projectMember: { create: jest.fn(), delete: jest.fn() },
  },
}))

import { auth } from "@/lib/auth"
const mockAuth = auth as jest.Mock
const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

function makeRequest(body?: unknown) {
  return new NextRequest("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
}

it("POST /members returns 403 if caller is not project owner", async () => {
  mockAuth.mockResolvedValue({ userId: "user-2", role: "user" })
  mockPrisma.project.findFirst.mockResolvedValue(null) // not owner

  const res = await addMember(makeRequest({ email: "alice@example.com" }), {
    params: Promise.resolve({ id: "p1" }),
  })
  expect(res.status).toBe(403)
})

it("POST /members returns 404 if target email not found", async () => {
  mockAuth.mockResolvedValue({ userId: "user-1", role: "user" })
  mockPrisma.project.findFirst.mockResolvedValue({ id: "p1", userId: "user-1" } as any)
  mockPrisma.user.findUnique.mockResolvedValue(null)

  const res = await addMember(makeRequest({ email: "unknown@example.com" }), {
    params: Promise.resolve({ id: "p1" }),
  })
  expect(res.status).toBe(404)
})

it("POST /members creates a ProjectMember", async () => {
  mockAuth.mockResolvedValue({ userId: "user-1", role: "user" })
  mockPrisma.project.findFirst.mockResolvedValue({ id: "p1", userId: "user-1" } as any)
  mockPrisma.user.findUnique.mockResolvedValue({ id: "user-2", status: "approved" } as any)
  mockPrisma.projectMember.create.mockResolvedValue({ id: "pm1" } as any)

  const res = await addMember(makeRequest({ email: "alice@example.com" }), {
    params: Promise.resolve({ id: "p1" }),
  })
  expect(res.status).toBe(201)
  expect(mockPrisma.projectMember.create).toHaveBeenCalledWith({
    data: { projectId: "p1", userId: "user-2" },
  })
})

it("DELETE /members returns 403 if caller is not project owner", async () => {
  mockAuth.mockResolvedValue({ userId: "user-2", role: "user" })
  mockPrisma.project.findFirst.mockResolvedValue(null) // not owner

  const res = await removeMember(new NextRequest("http://localhost/", { method: "DELETE" }), {
    params: Promise.resolve({ id: "p1", memberId: "user-3" }),
  })
  expect(res.status).toBe(403)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/api/projects/members.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create POST /members route**

Create `app/api/v1/projects/[id]/members/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const AddMemberSchema = z.object({ email: z.string().email() })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const { id: projectId } = await params

  // Only the project owner can add members
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
  if (!project) return NextResponse.json({ error: "Not found or not owner", code: "FORBIDDEN" }, { status: 403 })

  const body = await req.json()
  const parsed = AddMemberSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 422 })

  const targetUser = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (!targetUser || targetUser.status !== "approved") {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 })
  }

  const member = await prisma.projectMember.create({
    data: { projectId, userId: targetUser.id },
  })
  return NextResponse.json(member, { status: 201 })
}
```

- [ ] **Step 4: Create DELETE /members/[memberId] route**

Create `app/api/v1/projects/[id]/members/[memberId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const { id: projectId, memberId } = await params

  // Only the project owner can remove members
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
  if (!project) return NextResponse.json({ error: "Not found or not owner", code: "FORBIDDEN" }, { status: 403 })

  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId, userId: memberId } },
  })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 5: Run tests**

```bash
npx jest __tests__/api/projects/members.test.ts
```
Expected: all tests pass

- [ ] **Step 6: Run full suite**

```bash
npx jest
```
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add app/api/v1/projects/\[id\]/members/ __tests__/api/projects/
git commit -m "feat: add project member routes for sharing"
```

---

## Task 8: Remaining Web Routes and Cron Scoping

**Files:**
- Modify: `lib/services/api-keys.ts`
- Modify: `app/api/v1/settings/api-keys/route.ts` + `[id]/route.ts`
- Modify: `app/api/v1/push/subscribe/route.ts` + `unsubscribe/route.ts`
- Modify: `lib/google.ts` (all functions gain userId param)
- Modify: `app/api/v1/google/status/route.ts` + `connect/route.ts` + `callback/route.ts` + `disconnect/route.ts`
- Modify: `app/api/v1/calendar/events/route.ts` + `sync/route.ts`
- Modify: `lib/services/vault.ts` (`getVaultConfig`, `isVaultAccessible`, all callers)
- Modify: `app/api/v1/vault/status/route.ts` + `config/route.ts` + `sync/route.ts`
- Modify: `app/api/v1/cron/notify/route.ts`

This task is mechanical: extract `userId` from session, pass it to every service/DB call. The pattern is identical to Task 5.

- [ ] **Step 1: Update api-keys service**

Read `lib/services/api-keys.ts`. Update:

```ts
export async function generateApiKey(name: string, userId: string) {
  const plaintext = `hky_${nanoid()}`
  const keyHash = await bcrypt.hash(plaintext, 12)
  await prisma.hollyApiKey.create({ data: { name, keyHash, userId } })
  return plaintext
}

export async function listApiKeys(userId: string) {
  return prisma.hollyApiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, lastUsed: true, createdAt: true },
  })
}

export async function deleteApiKey(id: string, userId: string) {
  // Verify ownership
  const key = await prisma.hollyApiKey.findFirst({ where: { id, userId } })
  if (!key) return null
  return prisma.hollyApiKey.delete({ where: { id } })
}
```

- [ ] **Step 2: Update api-keys routes**

Read `app/api/v1/settings/api-keys/route.ts` and `[id]/route.ts`. Apply the pattern:
- Extract `const userId = session?.userId`, return 401 if missing
- Pass `userId` to `listApiKeys(userId)`, `generateApiKey(name, userId)`, `deleteApiKey(id, userId)`

- [ ] **Step 3: Update push routes**

Read `app/api/v1/push/subscribe/route.ts` and `unsubscribe/route.ts`. In each:
- Extract `userId`, return 401 if missing
- In subscribe: add `userId` to `prisma.pushSubscription.create({ data: { ..., userId } })`
- In unsubscribe: add `userId` to the delete where clause: `prisma.pushSubscription.deleteMany({ where: { endpoint, userId } })`

- [ ] **Step 4: Update lib/google.ts**

Read `lib/google.ts` in full. Every function that calls `prisma.googleToken.findFirst()` (or similar) needs a `userId` parameter added. For example:

```ts
// Before
export async function isGoogleConnected(): Promise<boolean> {
  const token = await prisma.googleToken.findFirst()
  return !!token
}

// After
export async function isGoogleConnected(userId: string): Promise<boolean> {
  const token = await prisma.googleToken.findFirst({ where: { userId } })
  return !!token
}
```

Apply this pattern to ALL functions in `lib/google.ts` that access GoogleToken or CalendarSync.

- [ ] **Step 5: Update google routes**

Read each of `app/api/v1/google/status/route.ts`, `connect/route.ts`, `callback/route.ts`, `disconnect/route.ts`. In each:
- Extract `userId` from session
- Pass `userId` to all google service function calls

Note: `callback/route.ts` may receive the userId from the OAuth state parameter. Read it carefully to understand how it stores the token and pass `userId` accordingly.

- [ ] **Step 6: Update calendar routes**

Read `app/api/v1/calendar/events/route.ts` and `sync/route.ts`. Extract userId, pass to all calendar service calls. Read `lib/services/calendar-sync.ts` and add userId to any functions that access CalendarSync.

- [ ] **Step 7: Update vault routes and vault service**

Read `lib/services/vault.ts`. Update `getVaultConfig` and `isVaultAccessible` to accept `userId`:

```ts
export async function getVaultConfig(userId: string): Promise<VaultConfig | null> {
  return prisma.vaultConfig.findFirst({ where: { userId } })
}

export async function isVaultAccessible(userId: string): Promise<boolean> {
  const config = await getVaultConfig(userId)
  if (!config) return false
  try {
    await fs.access(config.vaultPath)
    return true
  } catch {
    return false
  }
}
```

Read `app/api/v1/vault/status/route.ts`, `config/route.ts`, `sync/route.ts`. In each:
- Extract `userId` from session
- Pass `userId` to all vault service calls

Also update `createNote` and `updateNote` in `lib/services/vault.ts` to accept `userId` and include it when creating/updating `VaultNote` records. Read the current implementations to see exact changes needed.

- [ ] **Step 8: Update cron/notify route for per-user push notifications**

Read `app/api/v1/cron/notify/route.ts`. The cron route currently queries all subscriptions and all contacts globally. After multi-user, push notifications must go only to the contact owner's subscriptions.

Replace the push notification loops with per-user scoped queries:

```ts
// After fetching overdueContacts (which now have userId):
// Group contacts by userId and only send to that user's subscriptions

for (const contact of overdueContacts) {
  if (sent >= MAX_NOTIFICATIONS_PER_RUN) break
  if (!contact.userId) continue // unclaimed contact, skip
  const dedupeKey = `notify:sent:overdue:${contact.id}:${today}`
  const already = await redis.get(dedupeKey)
  if (already) continue

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: contact.userId },
  })
  if (subscriptions.length === 0) continue

  for (const sub of subscriptions) {
    try {
      await sendPushNotification(sub, {
        title: "Catch up reminder",
        body: `Catch up with ${contact.name} -- it's been a while.`,
        url: `/contacts/${contact.id}`,
      })
    } catch (e) {
      console.error("[cron/notify] push failed for overdue contact", contact.id, e)
    }
  }
  await redis.set(dedupeKey, "1", "EX", 86400)
  sent++
}
```

Apply the same pattern to the follow-ups loop: query `prisma.pushSubscription.findMany({ where: { userId: interaction.userId } })`.

Remove the global `const subscriptions = await prisma.pushSubscription.findMany()` and the `if (subscriptions.length === 0) return` guard (those are now per-contact/interaction).

Also update the overdue contacts query to include userId in the select/return (it should already be present after the schema migration).

- [ ] **Step 9: Run full test suite**

```bash
npx tsc --noEmit
npx jest
```
Expected: no TypeScript errors, all tests pass

- [ ] **Step 10: Commit**

```bash
git add lib/services/api-keys.ts lib/google.ts lib/services/vault.ts app/api/v1/settings/ app/api/v1/push/ app/api/v1/google/ app/api/v1/calendar/ app/api/v1/vault/ app/api/v1/cron/
git commit -m "feat: scope all remaining web routes and cron by userId"
```

---

## Task 9: Holly API Routes Scoping and Briefing Service

**Files:**
- Modify: `lib/services/briefing.ts`
- Modify: `app/api/holly/v1/contacts/route.ts` + `[id]/route.ts`
- Modify: `app/api/holly/v1/interactions/route.ts` + `[id]/route.ts`
- Modify: `app/api/holly/v1/action-items/route.ts` + `[id]/route.ts`
- Modify: `app/api/holly/v1/briefing/route.ts`
- Modify: `app/api/holly/v1/vault/search/route.ts` + `note/route.ts` + `sync/route.ts`
- Test: `__tests__/services/briefing.test.ts`

- [ ] **Step 1: Write failing test for briefing userId scoping**

Read `__tests__/services/briefing.test.ts`. Add:

```ts
it("getBriefing scopes all queries to the given userId", async () => {
  // Set up mocks to return empty arrays (already covered in existing tests)
  mockPrisma.contact.findMany.mockResolvedValue([])
  mockPrisma.interaction.findMany.mockResolvedValue([])
  mockPrisma.actionItem.findMany.mockResolvedValue([])
  mockPrisma.project.count.mockResolvedValue(0 as any)
  mockPrisma.project.findMany.mockResolvedValue([])
  mockPrisma.task.count.mockResolvedValue(0 as any)
  mockPrisma.task.findMany.mockResolvedValue([])

  await getBriefing("user-xyz")

  // overdueContacts query should include userId
  const overdueCall = mockPrisma.contact.findMany.mock.calls[0][0]
  expect(overdueCall?.where).toMatchObject({ userId: "user-xyz" })
})
```

Note: `getBriefing` currently takes no arguments. This test will fail because of the signature mismatch.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/services/briefing.test.ts
```
Expected: FAIL

- [ ] **Step 3: Update lib/services/briefing.ts**

Read `lib/services/briefing.ts` in full. Add `userId: string` parameter and add `userId` to EVERY Prisma `where` clause in the function. The function is a long `Promise.all` — add `userId` to each query.

Example changes:
```ts
// Before
export async function getBriefing() {
  const [overdueContacts, ...] = await Promise.all([
    prisma.contact.findMany({
      where: { interactionFreqDays: { not: null }, OR: [...] },
      ...
    }),
    ...
  ])

// After
export async function getBriefing(userId: string) {
  const [overdueContacts, ...] = await Promise.all([
    prisma.contact.findMany({
      where: { userId, interactionFreqDays: { not: null }, OR: [...] },
      ...
    }),
    ...
  ])
```

Apply `userId` to all 10 queries in the Promise.all.

- [ ] **Step 4: Run briefing tests**

```bash
npx jest __tests__/services/briefing.test.ts
```
Expected: all tests pass

- [ ] **Step 5: Update Holly API routes**

The pattern for ALL Holly API routes changes from:
```ts
const authResult = await validateHollyRequest(req)
if (!authResult.valid) { ... }
// use service functions without userId
```

To:
```ts
const authResult = await validateHollyRequest(req)
if (!authResult.valid) { ... }
const { userId } = authResult  // authResult.valid === true guarantees userId is present
// pass userId to all service function calls
```

Apply this to every file in `app/api/holly/v1/`:
- `contacts/route.ts`: pass `userId` to `listContacts({ ..., userId })`
- `contacts/[id]/route.ts`: pass `userId` to `getContact(id, userId)`, `updateContact(id, data, "holly", userId)`, `deleteContact(id, "holly", userId)`
- `interactions/route.ts`: pass `userId` to `listInteractions({ ..., userId })`
- `interactions/[id]/route.ts`: pass `userId` to interaction service calls
- `action-items/route.ts`: pass `userId` to action item service calls
- `action-items/[id]/route.ts`: same
- `briefing/route.ts`: pass `userId` to `getBriefing(userId)`
- `vault/search/route.ts`: pass `userId` to `isVaultAccessible(userId)` and `searchVault(query, limit, userId)`. Update `searchVault` in `lib/services/vault.ts` to accept and use `userId` when calling `getVaultConfig(userId)`.
- `vault/note/route.ts`: pass `userId` to vault service calls
- `vault/sync/route.ts`: pass `userId` to `isVaultAccessible(userId)` and `runVaultSync(userId)`. Update `runVaultSync` in `lib/services/vault-sync.ts` to accept `userId` and pass it to `getVaultConfig(userId)`.

- [ ] **Step 6: Run full test suite**

```bash
npx tsc --noEmit
npx jest
```
Expected: no TypeScript errors, all tests pass

- [ ] **Step 7: Commit**

```bash
git add lib/services/briefing.ts app/api/holly/ lib/services/vault.ts lib/services/vault-sync.ts __tests__/services/briefing.test.ts
git commit -m "feat: scope briefing service and all Holly API routes by userId"
```

---

## Task 10: Project Sharing UI

**Files:**
- Modify: `app/(dashboard)/projects/[id]/page.tsx`
- Create: `components/projects/project-members.tsx`

- [ ] **Step 1: Create the ProjectMembers component**

Create `components/projects/project-members.tsx`:

```tsx
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
    const res = await fetch(`/api/v1/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })
    if (res.ok) {
      // Reload page to get fresh member list with user details
      window.location.reload()
    } else {
      const data = await res.json()
      setError(data.error ?? "Failed to add member")
    }
    setAdding(false)
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
```

- [ ] **Step 2: Update the project detail page**

Read `app/(dashboard)/projects/[id]/page.tsx` in full. This is a server component.

Add an auth import and userId check at the top, and render `ProjectMembers`:

```tsx
import { auth } from "@/lib/auth"
import { ProjectMembers } from "@/components/projects/project-members"

export default async function ProjectDetailPage({ params }: PageProps) {
  const session = await auth()
  const userId = session?.userId
  const { id } = await params
  const project = await getProject(id, userId ?? "")  // getProject now takes userId
  if (!project) notFound()

  const isOwner = project.userId === userId
  const members = (project as any).members ?? []

  // ... rest of existing page ...

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* existing content */}

      {/* Add members section before or after tasks */}
      <ProjectMembers projectId={id} members={members} isOwner={isOwner} />

      {/* existing tasks/milestones sections */}
    </div>
  )
}
```

Also add a "Shared by [name]" label on the project list page. Read `app/(dashboard)/projects/page.tsx`. For each project where `project.userId !== userId` (i.e., shared), add a small label: find the project owner's name from `project.members` or add it to the `listProjects` return.

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Run full test suite**

```bash
npx jest
```
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add components/projects/ app/\(dashboard\)/projects/
git commit -m "feat: project sharing UI — members section on project detail page"
```

- [ ] **Step 6: Push**

```bash
git push
```

---

## Post-Implementation: First-Time Setup

After deploying Phase 6a, follow these steps once:

1. Deploy and run `npx prisma migrate deploy` on the server
2. Sign in as admin at `/login` using `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH`
3. Open a separate browser tab, go to `/login`, click "Sign in with Google" using your personal Google account
4. A pending User row is created for your Google account
5. Back in the admin tab, go to `/admin` — your pending account appears
6. Approve your own account
7. Sign in with Google — you're now in as your personal user account
8. Go to `/admin`, use "Claim unclaimed data" to assign all existing records to your account
9. Holly API keys are now claimed — Holly works again
