# Phase 4 - Calendar and Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Google OAuth connection layer, bidirectional Google Calendar sync, Gmail monitoring surfaced in the Holly briefing, and a multi-view in-app calendar page at `/calendar`.

**Architecture:** Four pillars built bottom-up: (1) encryption utility + Google token storage + OAuth flow in Settings, (2) Gmail service + cron integration + Holly API endpoint, (3) Calendar sync service wired into existing project/task/interaction services, (4) `/calendar` page with month/week/agenda client-side view switching. All Google operations degrade silently when no token is present.

**Tech Stack:** Next.js 16 App Router, Prisma 7, `googleapis` npm package, `google-auth-library`, Node.js `crypto` (built-in), ioredis, Zod, Jest/ts-jest, Tailwind CSS.

---

## File Map

**Install:**
- `googleapis` + `google-auth-library` packages

**Create:**
- `prisma/migrations/20260410000003_phase4_google/migration.sql`
- `lib/encryption.ts` - AES-256-GCM encrypt/decrypt
- `lib/google.ts` - `getGoogleClient()`, `GoogleNotConnectedError`
- `lib/services/gmail.ts` - `fetchRecentEmails()`, `getEmailThread()`
- `lib/services/calendar-sync.ts` - `upsertCalendarEvent()`, `deleteCalendarEvent()`, `fetchGoogleEvents()`
- `app/api/v1/google/connect/route.ts` - OAuth initiation
- `app/api/v1/google/callback/route.ts` - OAuth callback
- `app/api/v1/google/disconnect/route.ts` - Revoke + delete token
- `app/api/v1/calendar/preferences/route.ts` - Save filter preferences
- `app/api/holly/v1/gmail/recent/route.ts` - Holly on-demand Gmail
- `app/(dashboard)/calendar/page.tsx` - Server component (data fetch)
- `components/calendar/calendar-view.tsx` - Client component (view switching)
- `__tests__/lib/encryption.test.ts`
- `__tests__/services/gmail.test.ts`
- `__tests__/services/calendar-sync.test.ts`

**Modify:**
- `prisma/schema.prisma` - add `GoogleToken`, `CalendarSync`, `UserPreference` models + `CalendarEntityType` enum
- `lib/services/projects.ts` - call `upsertCalendarEvent` / `deleteCalendarEvent` after create/update/delete
- `lib/services/tasks.ts` - call `upsertCalendarEvent` / `deleteCalendarEvent` after create/update/delete
- `lib/services/action-items.ts` - call `upsertCalendarEvent` after `createActionItem`
- `lib/services/interactions.ts` - call `upsertCalendarEvent` after `updateInteraction` when `followUpDate` set
- `lib/services/briefing.ts` - add `recentEmails` field from Redis cache
- `app/api/v1/cron/notify/route.ts` - add Gmail poll step
- `app/(dashboard)/settings/page.tsx` - add Google connection section
- `components/layout/sidebar.tsx` - add Calendar link
- `components/layout/bottom-nav.tsx` - add Calendar tab (replace Reports with smaller label or accept 7 tabs)

---

## Task 1: Install dependencies and schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260410000003_phase4_google/migration.sql`

- [ ] **Step 1: Install Google API packages**

Run:
```bash
npm install googleapis google-auth-library
npm install --save-dev @types/google-auth-library
```

Expected: packages added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Add models to prisma/schema.prisma**

Add after the `PushSubscription` model:

```prisma
enum CalendarEntityType {
  task
  project
  action_item
  follow_up
}

model GoogleToken {
  id           String   @id @default(uuid())
  email        String
  accessToken  String
  refreshToken String
  expiresAt    DateTime
  scopes       String[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model CalendarSync {
  id            String             @id @default(uuid())
  entityType    CalendarEntityType
  entityId      String
  googleEventId String
  calendarId    String             @default("primary")
  createdAt     DateTime           @default(now())

  @@unique([entityType, entityId])
}

model UserPreference {
  id              String   @id @default(uuid())
  calendarFilters Json     @default("{\"tasks\":true,\"projects\":true,\"followUps\":true,\"milestones\":true,\"actionItems\":true,\"googleEvents\":true}")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

- [ ] **Step 3: Create migration SQL**

Create `prisma/migrations/20260410000003_phase4_google/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "CalendarEntityType" AS ENUM ('task', 'project', 'action_item', 'follow_up');

-- CreateTable
CREATE TABLE "GoogleToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoogleToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSync" (
    "id" TEXT NOT NULL,
    "entityType" "CalendarEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSync_entityType_entityId_key" ON "CalendarSync"("entityType", "entityId");

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "calendarFilters" JSONB NOT NULL DEFAULT '{"tasks":true,"projects":true,"followUps":true,"milestones":true,"actionItems":true,"googleEvents":true}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);
```

- [ ] **Step 4: Regenerate Prisma client**

Run: `npx prisma generate`

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260410000003_phase4_google/ app/generated/ package.json package-lock.json
git commit -m "feat: add GoogleToken, CalendarSync, UserPreference schema + install googleapis"
```

---

## Task 2: Encryption utility

**Files:**
- Create: `lib/encryption.ts`
- Create: `__tests__/lib/encryption.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/encryption.test.ts`:

```ts
// Set a test key before importing the module
process.env.ENCRYPTION_KEY = "a".repeat(64) // 32 bytes as 64 hex chars

import { encrypt, decrypt } from "@/lib/encryption"

describe("encrypt / decrypt", () => {
  it("round-trips plaintext correctly", () => {
    const plaintext = "my-secret-token"
    const ciphertext = encrypt(plaintext)
    expect(ciphertext).not.toBe(plaintext)
    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it("produces different ciphertext for same input (random IV)", () => {
    const a = encrypt("same-input")
    const b = encrypt("same-input")
    expect(a).not.toBe(b)
    expect(decrypt(a)).toBe("same-input")
    expect(decrypt(b)).toBe("same-input")
  })

  it("throws on tampered ciphertext", () => {
    const ciphertext = encrypt("secret")
    const [iv, tag, ct] = ciphertext.split(":")
    const tampered = `${iv}:${tag}:${"ff" + ct.slice(2)}`
    expect(() => decrypt(tampered)).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/lib/encryption.test.ts --no-coverage`

Expected: FAIL - `Cannot find module '@/lib/encryption'`

- [ ] **Step 3: Create lib/encryption.ts**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)")
  }
  return Buffer.from(hex, "hex")
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`
}

export function decrypt(ciphertext: string): string {
  const key = getKey()
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(":")
  if (!ivHex || !tagHex || !encryptedHex) throw new Error("Invalid ciphertext format")
  const iv = Buffer.from(ivHex, "hex")
  const tag = Buffer.from(tagHex, "hex")
  const encrypted = Buffer.from(encryptedHex, "hex")
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8")
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/lib/encryption.test.ts --no-coverage`

Expected: PASS - 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/encryption.ts __tests__/lib/encryption.test.ts
git commit -m "feat: add AES-256-GCM encryption utility"
```

---

## Task 3: Google client (token management)

**Files:**
- Create: `lib/google.ts`

No unit test for this file - it wraps the `google-auth-library` OAuth2 client and the Prisma DB. Integration behaviour is tested indirectly via the services that use it.

- [ ] **Step 1: Create lib/google.ts**

```ts
import { OAuth2Client } from "google-auth-library"
import { prisma } from "@/lib/db"
import { encrypt, decrypt } from "@/lib/encryption"

export class GoogleNotConnectedError extends Error {
  constructor() {
    super("Google account not connected")
    this.name = "GoogleNotConnectedError"
  }
}

export async function getGoogleClient(): Promise<OAuth2Client> {
  const token = await prisma.googleToken.findFirst()
  if (!token) throw new GoogleNotConnectedError()

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  client.setCredentials({
    access_token: decrypt(token.accessToken),
    refresh_token: decrypt(token.refreshToken),
    expiry_date: token.expiresAt.getTime(),
  })

  // Refresh if within 5 minutes of expiry
  const fiveMinutes = 5 * 60 * 1000
  if (token.expiresAt.getTime() - Date.now() < fiveMinutes) {
    const { credentials } = await client.refreshAccessToken()
    if (credentials.access_token && credentials.expiry_date) {
      await prisma.googleToken.update({
        where: { id: token.id },
        data: {
          accessToken: encrypt(credentials.access_token),
          expiresAt: new Date(credentials.expiry_date),
        },
      })
      client.setCredentials(credentials)
    }
  }

  return client
}

export async function isGoogleConnected(): Promise<boolean> {
  const token = await prisma.googleToken.findFirst({ select: { id: true, email: true } })
  return token !== null
}

export async function getConnectedEmail(): Promise<string | null> {
  const token = await prisma.googleToken.findFirst({ select: { email: true } })
  return token?.email ?? null
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/google.ts
git commit -m "feat: add Google OAuth client with auto-refresh"
```

---

## Task 4: Google OAuth routes (connect / callback / disconnect)

**Files:**
- Create: `app/api/v1/google/connect/route.ts`
- Create: `app/api/v1/google/callback/route.ts`
- Create: `app/api/v1/google/disconnect/route.ts`

- [ ] **Step 1: Create connect route**

Create `app/api/v1/google/connect/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { OAuth2Client } from "google-auth-library"
import { redis } from "@/lib/redis"
import { randomUUID } from "crypto"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.redirect(new URL("/login", req.url))

  const state = randomUUID()
  await redis.set(`google:oauth:state:${state}`, "1", "EX", 600)

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/calendar",
      "email",
    ],
    state,
  })

  return NextResponse.redirect(url)
}
```

- [ ] **Step 2: Create callback route**

Create `app/api/v1/google/callback/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { OAuth2Client } from "google-auth-library"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import { encrypt } from "@/lib/encryption"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.redirect(new URL("/login", req.url))

  const { searchParams } = req.nextUrl
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error || !code || !state) {
    return NextResponse.redirect(new URL("/settings?error=oauth_failed", req.url))
  }

  const stateKey = `google:oauth:state:${state}`
  const valid = await redis.get(stateKey).catch(() => null)
  if (!valid) {
    return NextResponse.redirect(new URL("/settings?error=oauth_failed", req.url))
  }
  await redis.del(stateKey).catch(() => {})

  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  const { tokens } = await client.getToken(code)
  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    return NextResponse.redirect(new URL("/settings?error=oauth_failed", req.url))
  }

  // Get the email address from the id_token
  client.setCredentials(tokens)
  const tokenInfo = await client.getTokenInfo(tokens.access_token)
  const email = tokenInfo.email ?? "unknown"

  const scopes = Array.isArray(tokens.scope) ? tokens.scope : (tokens.scope ?? "").split(" ")

  // Upsert - delete existing and recreate (single-user, at most one row)
  await prisma.googleToken.deleteMany()
  await prisma.googleToken.create({
    data: {
      email,
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      expiresAt: new Date(tokens.expiry_date),
      scopes,
    },
  })

  return NextResponse.redirect(new URL("/settings?connected=google", req.url))
}
```

- [ ] **Step 3: Create disconnect route**

Create `app/api/v1/google/disconnect/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google"

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const client = await getGoogleClient()
    const token = await prisma.googleToken.findFirst()
    if (token) {
      await client.revokeCredentials().catch(() => {})
    }
  } catch (err) {
    if (!(err instanceof GoogleNotConnectedError)) {
      console.error("[google/disconnect] revoke failed", err)
    }
  }

  await prisma.googleToken.deleteMany()

  return NextResponse.redirect(new URL("/settings", req.url))
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/google/
git commit -m "feat: add Google OAuth connect/callback/disconnect routes"
```

---

## Task 5: Settings page - Google connection section

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

The settings page is a client component. It needs to know whether Google is connected and the connected email. The simplest approach: add a server-fetched prop via a new route, or just fetch from a new `GET /api/v1/google/status` endpoint on mount. Use a dedicated status route to keep the client component pattern consistent.

- [ ] **Step 1: Create Google status route**

Create `app/api/v1/google/status/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isGoogleConnected, getConnectedEmail } from "@/lib/google"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const connected = await isGoogleConnected()
  const email = connected ? await getConnectedEmail() : null
  return NextResponse.json({ connected, email })
}
```

- [ ] **Step 2: Add Google section to settings page**

In `app/(dashboard)/settings/page.tsx`, add to the state at the top:

```ts
const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email: string | null }>({ connected: false, email: null })
```

Add to the `useEffect` that already calls `loadKeys()`:

```ts
fetch("/api/v1/google/status").then(r => r.json()).then(setGoogleStatus).catch(() => {})
```

Add this section before the closing `</div>` of the return, after the Notifications section:

```tsx
<section>
  <h2 className="text-base font-semibold text-[#c0c0d0] mb-1">Google Integration</h2>
  <p className="text-sm text-[#666688] mb-4">Connect Google to enable Gmail monitoring and Google Calendar sync.</p>

  <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 flex items-center justify-between">
    <div>
      <p className="text-sm font-medium text-[#c0c0d0]">Google account</p>
      <p className="text-xs text-[#666688]">
        {googleStatus.connected ? `Connected as ${googleStatus.email}` : "Not connected"}
      </p>
    </div>
    {googleStatus.connected ? (
      <form action="/api/v1/google/disconnect" method="POST" onSubmit={async (e) => {
        e.preventDefault()
        await fetch("/api/v1/google/disconnect", { method: "DELETE" })
        setGoogleStatus({ connected: false, email: null })
      }}>
        <Button variant="danger" type="submit">Disconnect</Button>
      </form>
    ) : (
      <Button onClick={() => { window.location.href = "/api/v1/google/connect" }}>Connect Google</Button>
    )}
  </div>
</section>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/settings/page.tsx app/api/v1/google/status/route.ts
git commit -m "feat: add Google connection section to settings page"
```

---

## Task 6: Gmail service

**Files:**
- Create: `lib/services/gmail.ts`
- Create: `__tests__/services/gmail.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/services/gmail.test.ts`:

```ts
import { fetchRecentEmails, getEmailThread } from "@/lib/services/gmail"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    contact: { findMany: jest.fn() },
    googleToken: { findFirst: jest.fn() },
  },
}))

jest.mock("@/lib/google", () => ({
  getGoogleClient: jest.fn(),
  GoogleNotConnectedError: class GoogleNotConnectedError extends Error {
    constructor() { super("not connected"); this.name = "GoogleNotConnectedError" }
  },
}))

import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google"
const mockGetGoogleClient = getGoogleClient as jest.MockedFunction<typeof getGoogleClient>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("fetchRecentEmails", () => {
  it("returns empty array when Google not connected", async () => {
    mockGetGoogleClient.mockRejectedValue(new GoogleNotConnectedError())
    const result = await fetchRecentEmails()
    expect(result).toEqual([])
  })

  it("returns empty array when no contacts have emails", async () => {
    mockGetGoogleClient.mockResolvedValue({} as any)
    mockPrisma.contact.findMany.mockResolvedValue([])
    const result = await fetchRecentEmails()
    expect(result).toEqual([])
  })
})

describe("getEmailThread", () => {
  it("returns null when Google not connected", async () => {
    mockGetGoogleClient.mockRejectedValue(new GoogleNotConnectedError())
    const result = await getEmailThread("thread-123")
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/gmail.test.ts --no-coverage`

Expected: FAIL - `Cannot find module '@/lib/services/gmail'`

- [ ] **Step 3: Create lib/services/gmail.ts**

```ts
import { google } from "googleapis"
import { prisma } from "@/lib/db"
import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google"

export interface GmailEmail {
  threadId: string
  subject: string
  from: string
  to: string
  snippet: string
  date: string
  contactId: string
  contactName: string
}

export interface GmailThread {
  threadId: string
  subject: string
  messages: Array<{
    from: string
    to: string
    date: string
    body: string
  }>
}

function extractHeader(headers: Array<{ name?: string | null; value?: string | null }>, name: string): string {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ""
}

function decodeBody(part: { mimeType?: string | null; body?: { data?: string | null } | null; parts?: unknown[] | null }): string {
  if (part.body?.data) {
    return Buffer.from(part.body.data, "base64").toString("utf8")
  }
  return ""
}

export async function fetchRecentEmails(options: { hours?: number } = {}): Promise<GmailEmail[]> {
  const hours = options.hours ?? 24
  try {
    const client = await getGoogleClient()
    const gmail = google.gmail({ version: "v1", auth: client })

    // Get all contact email addresses
    const contacts = await prisma.contact.findMany({
      select: { id: true, name: true, emails: true },
    })
    if (contacts.length === 0) return []

    const emailToContact = new Map<string, { id: string; name: string }>()
    for (const contact of contacts) {
      const emails = contact.emails as Array<{ address: string }>
      for (const e of emails) {
        if (e.address) emailToContact.set(e.address.toLowerCase(), { id: contact.id, name: contact.name })
      }
    }
    if (emailToContact.size === 0) return []

    const after = Math.floor((Date.now() - hours * 60 * 60 * 1000) / 1000)
    const query = `after:${after}`

    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 50,
    })

    const messages = listRes.data.messages ?? []
    const results: GmailEmail[] = []

    for (const msg of messages) {
      if (!msg.id) continue
      const full = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "metadata", metadataHeaders: ["From", "To", "Subject", "Date"] })
      const headers = full.data.payload?.headers ?? []
      const from = extractHeader(headers, "From")
      const to = extractHeader(headers, "To")
      const subject = extractHeader(headers, "Subject")
      const date = extractHeader(headers, "Date")
      const snippet = full.data.snippet ?? ""
      const threadId = full.data.threadId ?? msg.id

      // Match from or to against known contacts
      const allAddresses = [from, to].join(" ").toLowerCase()
      let matched: { id: string; name: string } | undefined
      for (const [addr, contact] of emailToContact) {
        if (allAddresses.includes(addr)) { matched = contact; break }
      }
      if (!matched) continue

      results.push({ threadId, subject, from, to, snippet, date, contactId: matched.id, contactName: matched.name })
    }

    return results
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return []
    console.error("[gmail] fetchRecentEmails failed", err)
    return []
  }
}

export async function getEmailThread(threadId: string): Promise<GmailThread | null> {
  try {
    const client = await getGoogleClient()
    const gmail = google.gmail({ version: "v1", auth: client })

    const thread = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" })
    const messages = thread.data.messages ?? []
    if (messages.length === 0) return null

    const firstHeaders = messages[0].payload?.headers ?? []
    const subject = extractHeader(firstHeaders, "Subject")

    const parsedMessages = messages.map(msg => {
      const headers = msg.payload?.headers ?? []
      return {
        from: extractHeader(headers, "From"),
        to: extractHeader(headers, "To"),
        date: extractHeader(headers, "Date"),
        body: decodeBody(msg.payload as any),
      }
    })

    return { threadId, subject, messages: parsedMessages }
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return null
    console.error("[gmail] getEmailThread failed", err)
    return null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/services/gmail.test.ts --no-coverage`

Expected: PASS - 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/services/gmail.ts __tests__/services/gmail.test.ts
git commit -m "feat: add Gmail service for fetching recent emails and threads"
```

---

## Task 7: Calendar sync service

**Files:**
- Create: `lib/services/calendar-sync.ts`
- Create: `__tests__/services/calendar-sync.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/services/calendar-sync.test.ts`:

```ts
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/services/calendar-sync"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    calendarSync: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  },
}))

jest.mock("@/lib/google", () => ({
  getGoogleClient: jest.fn(),
  GoogleNotConnectedError: class GoogleNotConnectedError extends Error {
    constructor() { super("not connected"); this.name = "GoogleNotConnectedError" }
  },
}))

import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google"
const mockGetGoogleClient = getGoogleClient as jest.MockedFunction<typeof getGoogleClient>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("upsertCalendarEvent", () => {
  it("returns silently when Google not connected", async () => {
    mockGetGoogleClient.mockRejectedValue(new GoogleNotConnectedError())
    await expect(
      upsertCalendarEvent("task", "t1", { title: "My task", date: new Date("2026-05-01") })
    ).resolves.toBeUndefined()
    expect(mockPrisma.calendarSync.findUnique).not.toHaveBeenCalled()
  })
})

describe("deleteCalendarEvent", () => {
  it("returns silently when no CalendarSync row exists", async () => {
    mockGetGoogleClient.mockResolvedValue({} as any)
    mockPrisma.calendarSync.findUnique.mockResolvedValue(null)
    await expect(deleteCalendarEvent("task", "t1")).resolves.toBeUndefined()
    expect(mockPrisma.calendarSync.delete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/calendar-sync.test.ts --no-coverage`

Expected: FAIL - `Cannot find module '@/lib/services/calendar-sync'`

- [ ] **Step 3: Create lib/services/calendar-sync.ts**

```ts
import { google } from "googleapis"
import { prisma } from "@/lib/db"
import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google"
import type { CalendarEntityType } from "@/app/generated/prisma/client"

export interface CalendarEventData {
  title: string
  description?: string
  date: Date
}

export interface GoogleCalendarEvent {
  googleEventId: string
  title: string
  date: string
  calendarId: string
}

export async function upsertCalendarEvent(
  entityType: CalendarEntityType,
  entityId: string,
  data: CalendarEventData
): Promise<void> {
  let client
  try {
    client = await getGoogleClient()
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return
    console.error("[calendar-sync] getGoogleClient failed", err)
    return
  }

  const calendar = google.calendar({ version: "v3", auth: client })
  const dateStr = data.date.toISOString().split("T")[0]
  const event = {
    summary: data.title,
    description: data.description ?? "",
    start: { date: dateStr },
    end: { date: dateStr },
  }

  try {
    const existing = await prisma.calendarSync.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
    })

    if (existing) {
      await calendar.events.update({
        calendarId: "primary",
        eventId: existing.googleEventId,
        requestBody: event,
      })
    } else {
      const created = await calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
      })
      if (created.data.id) {
        await prisma.calendarSync.create({
          data: {
            entityType,
            entityId,
            googleEventId: created.data.id,
            calendarId: "primary",
          },
        })
      }
    }
  } catch (err) {
    console.error("[calendar-sync] upsertCalendarEvent failed", entityType, entityId, err)
  }
}

export async function deleteCalendarEvent(
  entityType: CalendarEntityType,
  entityId: string
): Promise<void> {
  let client
  try {
    client = await getGoogleClient()
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return
    console.error("[calendar-sync] getGoogleClient failed", err)
    return
  }

  const calendar = google.calendar({ version: "v3", auth: client })

  try {
    const existing = await prisma.calendarSync.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
    })
    if (!existing) return

    await calendar.events.delete({ calendarId: "primary", eventId: existing.googleEventId })
    await prisma.calendarSync.delete({ where: { id: existing.id } })
  } catch (err) {
    console.error("[calendar-sync] deleteCalendarEvent failed", entityType, entityId, err)
  }
}

export async function fetchGoogleEvents(days: number): Promise<GoogleCalendarEvent[]> {
  let client
  try {
    client = await getGoogleClient()
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return []
    console.error("[calendar-sync] fetchGoogleEvents failed", err)
    return []
  }

  const calendar = google.calendar({ version: "v3", auth: client })
  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  try {
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    })

    return (res.data.items ?? [])
      .filter(e => e.id && e.summary && (e.start?.date || e.start?.dateTime))
      .map(e => ({
        googleEventId: e.id!,
        title: e.summary!,
        date: e.start?.date ?? e.start?.dateTime?.split("T")[0] ?? "",
        calendarId: "primary",
      }))
  } catch (err) {
    console.error("[calendar-sync] fetchGoogleEvents failed", err)
    return []
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/services/calendar-sync.test.ts --no-coverage`

Expected: PASS - 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/services/calendar-sync.ts __tests__/services/calendar-sync.test.ts
git commit -m "feat: add calendar sync service (upsert/delete/fetch Google Calendar events)"
```

---

## Task 8: Wire calendar sync into existing service functions

**Files:**
- Modify: `lib/services/projects.ts`
- Modify: `lib/services/tasks.ts`
- Modify: `lib/services/action-items.ts`
- Modify: `lib/services/interactions.ts`

All sync calls are fire-and-forget (`void` prefix) so they never block or fail PRM operations.

- [ ] **Step 1: Update lib/services/projects.ts**

Replace the entire file:

```ts
import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/services/calendar-sync"
import type { CreateProjectInput, UpdateProjectInput } from "@/lib/validations/project"

interface ListProjectsOptions {
  status?: string
}

export async function listProjects(opts: ListProjectsOptions) {
  const where: Record<string, unknown> = {}
  if (opts.status) where.status = opts.status
  return prisma.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { tasks: true } },
      tasks: { select: { status: true, isMilestone: true } },
    },
  })
}

export async function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: [{ isMilestone: "desc" }, { createdAt: "asc" }],
        include: { actionItems: { orderBy: { createdAt: "asc" } } },
      },
    },
  })
}

export async function createProject(data: CreateProjectInput, actor: Actor) {
  const project = await prisma.project.create({
    data: {
      ...data,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: project.id, action: "create", actor },
  })
  if (project.targetDate) {
    void upsertCalendarEvent("project", project.id, { title: project.title, date: project.targetDate })
  }
  return project
}

export async function updateProject(id: string, data: UpdateProjectInput, actor: Actor) {
  const before = await prisma.project.findUnique({ where: { id } })
  const project = await prisma.project.update({
    where: { id },
    data: {
      ...data,
      targetDate: data.targetDate !== undefined ? (data.targetDate ? new Date(data.targetDate) : null) : undefined,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: id, action: "update", actor, diff: { before, after: project } },
  })
  if (project.targetDate) {
    void upsertCalendarEvent("project", project.id, { title: project.title, date: project.targetDate })
  } else if (data.targetDate === null) {
    void deleteCalendarEvent("project", project.id)
  }
  return project
}

export async function deleteProject(id: string, actor: Actor) {
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: id, action: "delete", actor },
  })
  void deleteCalendarEvent("project", id)
  return prisma.project.delete({ where: { id } })
}
```

- [ ] **Step 2: Update lib/services/tasks.ts**

Replace the entire file:

```ts
import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/services/calendar-sync"
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validations/task"

interface ListTasksOptions {
  projectId?: string
  status?: string
  assignedTo?: string
  milestoneOnly?: boolean
}

export async function listTasks(opts: ListTasksOptions) {
  const where: Record<string, unknown> = {}
  if (opts.projectId) where.projectId = opts.projectId
  if (opts.status) where.status = opts.status
  if (opts.assignedTo) where.assignedTo = opts.assignedTo
  if (opts.milestoneOnly) where.isMilestone = true
  return prisma.task.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: { project: { select: { id: true, title: true } } },
  })
}

export async function getTask(id: string) {
  return prisma.task.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, title: true } },
      actionItems: { orderBy: { createdAt: "asc" } },
    },
  })
}

export async function createTask(data: CreateTaskInput, actor: Actor) {
  const task = await prisma.task.create({
    data: {
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Task", entityId: task.id, action: "create", actor },
  })
  if (task.dueDate) {
    void upsertCalendarEvent("task", task.id, { title: task.title, date: task.dueDate })
  }
  return task
}

export async function updateTask(id: string, data: UpdateTaskInput, actor: Actor) {
  const before = await prisma.task.findUnique({ where: { id } })
  const task = await prisma.task.update({
    where: { id },
    data: {
      ...data,
      dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Task", entityId: id, action: "update", actor, diff: { before, after: task } },
  })
  if (task.dueDate) {
    void upsertCalendarEvent("task", task.id, { title: task.title, date: task.dueDate })
  } else if (data.dueDate === null) {
    void deleteCalendarEvent("task", task.id)
  }
  return task
}

export async function deleteTask(id: string, actor: Actor) {
  await prisma.auditLog.create({
    data: { entity: "Task", entityId: id, action: "delete", actor },
  })
  void deleteCalendarEvent("task", id)
  return prisma.task.delete({ where: { id } })
}
```

- [ ] **Step 3: Update lib/services/action-items.ts**

Add the import and sync call to `createActionItem`. The full updated file:

```ts
import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import { publishSseEvent } from "@/lib/sse-events"
import { upsertCalendarEvent } from "@/lib/services/calendar-sync"
import type { CreateActionItemInput, UpdateActionItemInput } from "@/lib/validations/action-item"

export async function listActionItems(opts: { assignedTo?: Actor; status?: string } = {}) {
  const where: Record<string, unknown> = {}
  if (opts.assignedTo) where.assignedTo = opts.assignedTo
  if (opts.status) where.status = opts.status
  return prisma.actionItem.findMany({ where, orderBy: [{ priority: "desc" }, { dueDate: "asc" }] })
}

export async function createActionItem(data: CreateActionItemInput, actor: Actor) {
  const item = await prisma.actionItem.create({
    data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : null },
  })
  await prisma.auditLog.create({
    data: { entity: "ActionItem", entityId: item.id, action: "create", actor },
  })
  await publishSseEvent("action_item.created", {
    id: item.id,
    title: item.title,
    assignedTo: item.assignedTo,
    priority: item.priority,
    dueDate: item.dueDate ? item.dueDate.toISOString() : null,
  })
  if (item.dueDate) {
    void upsertCalendarEvent("action_item", item.id, { title: item.title, date: item.dueDate })
  }
  return item
}

export async function updateActionItemStatus(id: string, data: UpdateActionItemInput, actor: Actor) {
  const before = await prisma.actionItem.findUnique({ where: { id } })
  const item = await prisma.actionItem.update({ where: { id }, data })
  await prisma.auditLog.create({
    data: { entity: "ActionItem", entityId: id, action: "update", actor, diff: { before, after: item } },
  })
  if (data.status === "done" && before?.status !== "done") {
    await publishSseEvent("action_item.completed", {
      id: item.id,
      title: item.title,
      assignedTo: item.assignedTo,
    })
  }
  return item
}
```

- [ ] **Step 4: Update lib/services/interactions.ts - add follow-up sync**

In `lib/services/interactions.ts`, add the import and call inside `updateInteraction`. The full updated `updateInteraction` function (replace just that function):

First, add to the imports at the top of `lib/services/interactions.ts`:
```ts
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/services/calendar-sync"
```

Then replace the `updateInteraction` function:
```ts
export async function updateInteraction(id: string, data: UpdateInteractionInput, actor: Actor) {
  const interaction = await prisma.interaction.update({ where: { id }, data })
  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: id, action: "update", actor },
  })
  if (interaction.followUpDate) {
    const contact = await prisma.contact.findUnique({ where: { id: interaction.contactId }, select: { name: true } })
    void upsertCalendarEvent("follow_up", id, {
      title: `Follow-up: ${contact?.name ?? "Contact"}`,
      date: interaction.followUpDate,
    })
  } else if (data.followUpDate === null) {
    void deleteCalendarEvent("follow_up", id)
  }
  return interaction
}
```

- [ ] **Step 5: Run existing tests to verify nothing broke**

Run: `npx jest --no-coverage`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/services/projects.ts lib/services/tasks.ts lib/services/action-items.ts lib/services/interactions.ts
git commit -m "feat: wire Google Calendar sync into project, task, action-item, and interaction services"
```

---

## Task 9: Gmail cron integration and briefing extension

**Files:**
- Modify: `app/api/v1/cron/notify/route.ts`
- Modify: `lib/services/briefing.ts`

- [ ] **Step 1: Add Gmail poll step to cron**

In `app/api/v1/cron/notify/route.ts`, add the following import at the top:

```ts
import { fetchRecentEmails } from "@/lib/services/gmail"
```

Then add the Gmail poll step after the existing SSE loop (before `if (!isPushConfigured)`):

```ts
  // 3. Gmail poll - cache recent emails for briefing
  try {
    const recentEmails = await fetchRecentEmails({ hours: 24 })
    await redis.set("gmail:recent", JSON.stringify(recentEmails), "EX", 3600)
  } catch (e) {
    console.error("[cron/notify] gmail poll failed", e)
  }
```

- [ ] **Step 2: Add recentEmails to briefing service**

In `lib/services/briefing.ts`, add the import at the top:

```ts
import { redis } from "@/lib/redis"
```

Then in the `getBriefing` function, after the `Promise.all` resolves and before `return {`, add:

```ts
  // Read Gmail cache (populated by cron)
  let recentEmails: unknown[] = []
  try {
    const cached = await redis.get("gmail:recent")
    if (cached) recentEmails = JSON.parse(cached)
  } catch {
    // Redis unavailable or invalid JSON - proceed with empty array
  }
```

Then add `recentEmails` to the return object:

```ts
  return {
    overdueContacts,
    pendingFollowUps,
    openActionItems,
    openProjectsCount,
    tasksDueTodayCount,
    upcomingMilestones,
    myActionItems,
    followUpCandidates,
    recentInteractions,
    projectHealth,
    recentEmails,
    generatedAt: new Date(),
  }
```

- [ ] **Step 3: Run tests to verify nothing broke**

Run: `npx jest --no-coverage`

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/cron/notify/route.ts lib/services/briefing.ts
git commit -m "feat: add Gmail poll to cron and recentEmails field to briefing"
```

---

## Task 10: Holly API - Gmail on-demand endpoint

**Files:**
- Create: `app/api/holly/v1/gmail/recent/route.ts`

- [ ] **Step 1: Create the route**

Create `app/api/holly/v1/gmail/recent/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { fetchRecentEmails } from "@/lib/services/gmail"
import { isGoogleConnected } from "@/lib/google"

export async function GET(req: NextRequest) {
  const authResult = await validateHollyRequest(req)
  if (!authResult.valid) {
    if (authResult.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }

  const connected = await isGoogleConnected()
  if (!connected) {
    return NextResponse.json({ emails: [], googleConnected: false })
  }

  const hours = Math.min(168, Math.max(1, parseInt(req.nextUrl.searchParams.get("hours") ?? "24", 10) || 24))
  const emails = await fetchRecentEmails({ hours })
  return NextResponse.json({ emails, googleConnected: true, fetchedAt: new Date().toISOString() })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/holly/v1/gmail/recent/route.ts
git commit -m "feat: add Holly API Gmail on-demand endpoint"
```

---

## Task 11: Calendar preferences API route

**Files:**
- Create: `app/api/v1/calendar/preferences/route.ts`

- [ ] **Step 1: Create the route**

Create `app/api/v1/calendar/preferences/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { z } from "zod"

const FiltersSchema = z.object({
  tasks: z.boolean().default(true),
  projects: z.boolean().default(true),
  followUps: z.boolean().default(true),
  milestones: z.boolean().default(true),
  actionItems: z.boolean().default(true),
  googleEvents: z.boolean().default(true),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const pref = await prisma.userPreference.findFirst()
  const defaults = { tasks: true, projects: true, followUps: true, milestones: true, actionItems: true, googleEvents: true }
  return NextResponse.json(pref ? (pref.calendarFilters as typeof defaults) : defaults)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  const parsed = FiltersSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })

  const existing = await prisma.userPreference.findFirst()
  if (existing) {
    await prisma.userPreference.update({ where: { id: existing.id }, data: { calendarFilters: parsed.data } })
  } else {
    await prisma.userPreference.create({ data: { calendarFilters: parsed.data } })
  }
  return NextResponse.json(parsed.data)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/calendar/preferences/route.ts
git commit -m "feat: add calendar preferences API route"
```

---

## Task 12: Calendar page - server component and client view switcher

**Files:**
- Create: `app/(dashboard)/calendar/page.tsx`
- Create: `components/calendar/calendar-view.tsx`

This is the largest task. The server component fetches all data; the client component handles view switching.

- [ ] **Step 1: Create the CalendarView client component**

Create `components/calendar/calendar-view.tsx`:

```tsx
"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

export type CalendarItemType = "task" | "project" | "follow_up" | "milestone" | "action_item" | "google_event"

export interface CalendarItem {
  id: string
  type: CalendarItemType
  title: string
  date: string // YYYY-MM-DD
  href?: string
}

interface CalendarFilters {
  tasks: boolean
  projects: boolean
  followUps: boolean
  milestones: boolean
  actionItems: boolean
  googleEvents: boolean
}

interface CalendarViewProps {
  items: CalendarItem[]
  filters: CalendarFilters
}

type View = "month" | "week" | "agenda"

const TYPE_COLORS: Record<CalendarItemType, string> = {
  task: "bg-blue-500",
  project: "bg-purple-500",
  follow_up: "bg-yellow-500",
  milestone: "bg-[#00ff88]",
  action_item: "bg-orange-500",
  google_event: "bg-gray-500",
}

function filterItems(items: CalendarItem[], filters: CalendarFilters): CalendarItem[] {
  return items.filter(item => {
    if (item.type === "task" && !filters.tasks) return false
    if (item.type === "project" && !filters.projects) return false
    if (item.type === "follow_up" && !filters.followUps) return false
    if (item.type === "milestone" && !filters.milestones) return false
    if (item.type === "action_item" && !filters.actionItems) return false
    if (item.type === "google_event" && !filters.googleEvents) return false
    return true
  })
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toDateStr(date: Date): string {
  return date.toISOString().split("T")[0]
}

function MonthView({ items, currentDate, setCurrentDate }: { items: CalendarItem[]; currentDate: Date; setCurrentDate: (d: Date) => void }) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<Date | null> = [...Array(startOffset).fill(null)]
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)

  const itemsByDate = new Map<string, CalendarItem[]>()
  for (const item of items) {
    const list = itemsByDate.get(item.date) ?? []
    list.push(item)
    itemsByDate.set(item.date, list)
  }

  const monthLabel = currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="text-[#666688] hover:text-[#c0c0d0] px-2 py-1 text-sm">&#8249; Prev</button>
        <span className="text-sm font-semibold text-[#c0c0d0]">{monthLabel}</span>
        <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="text-[#666688] hover:text-[#c0c0d0] px-2 py-1 text-sm">Next &#8250;</button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-[rgba(0,255,136,0.08)] rounded-lg overflow-hidden">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="bg-[#111125] px-1 py-1 text-xs font-semibold text-[#666688] text-center">{d}</div>
        ))}
        {cells.map((day, i) => {
          const key = day ? toDateStr(day) : `empty-${i}`
          const dayItems = day ? (itemsByDate.get(toDateStr(day)) ?? []) : []
          const isToday = day ? toDateStr(day) === toDateStr(new Date()) : false
          return (
            <div key={key} className={`bg-[#111125] min-h-[80px] px-1 py-1 ${day ? "" : "opacity-30"}`}>
              {day && (
                <>
                  <span className={`text-xs ${isToday ? "text-[#00ff88] font-bold" : "text-[#666688]"}`}>{day.getDate()}</span>
                  <div className="mt-1 space-y-0.5">
                    {dayItems.slice(0, 3).map(item => (
                      item.href ? (
                        <Link key={item.id} href={item.href} className="block truncate text-xs text-[#c0c0d0] hover:text-[#00ff88]">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${TYPE_COLORS[item.type]}`} />
                          {item.title}
                        </Link>
                      ) : (
                        <div key={item.id} className="truncate text-xs text-[#c0c0d0]">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${TYPE_COLORS[item.type]}`} />
                          {item.title}
                        </div>
                      )
                    ))}
                    {dayItems.length > 3 && <div className="text-xs text-[#444466]">+{dayItems.length - 3} more</div>}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ items, currentDate, setCurrentDate }: { items: CalendarItem[]; currentDate: Date; setCurrentDate: (d: Date) => void }) {
  // Start of week = Sunday
  const weekStart = new Date(currentDate)
  weekStart.setDate(currentDate.getDate() - currentDate.getDay())
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekLabel = `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} - ${addDays(weekStart, 6).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`

  const itemsByDate = new Map<string, CalendarItem[]>()
  for (const item of items) {
    const list = itemsByDate.get(item.date) ?? []
    list.push(item)
    itemsByDate.set(item.date, list)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCurrentDate(addDays(currentDate, -7))} className="text-[#666688] hover:text-[#c0c0d0] px-2 py-1 text-sm">&#8249; Prev</button>
        <span className="text-sm font-semibold text-[#c0c0d0]">{weekLabel}</span>
        <button onClick={() => setCurrentDate(addDays(currentDate, 7))} className="text-[#666688] hover:text-[#c0c0d0] px-2 py-1 text-sm">Next &#8250;</button>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map(day => {
          const dateStr = toDateStr(day)
          const dayItems = itemsByDate.get(dateStr) ?? []
          const isToday = dateStr === toDateStr(new Date())
          return (
            <div key={dateStr} className="bg-[#111125] border border-[rgba(0,255,136,0.1)] rounded-lg p-2 min-h-[120px]">
              <div className={`text-xs font-semibold mb-2 ${isToday ? "text-[#00ff88]" : "text-[#666688]"}`}>
                {day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
              </div>
              <div className="space-y-1">
                {dayItems.map(item => (
                  item.href ? (
                    <Link key={item.id} href={item.href} className="block truncate text-xs text-[#c0c0d0] hover:text-[#00ff88]">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${TYPE_COLORS[item.type]}`} />
                      {item.title}
                    </Link>
                  ) : (
                    <div key={item.id} className="truncate text-xs text-[#c0c0d0]">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${TYPE_COLORS[item.type]}`} />
                      {item.title}
                    </div>
                  )
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AgendaView({ items }: { items: CalendarItem[] }) {
  const today = toDateStr(new Date())
  const upcoming = items
    .filter(i => i.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const byDate = new Map<string, CalendarItem[]>()
  for (const item of upcoming) {
    const list = byDate.get(item.date) ?? []
    list.push(item)
    byDate.set(item.date, list)
  }

  if (byDate.size === 0) {
    return <p className="text-sm text-[#666688]">No upcoming items in the next 30 days.</p>
  }

  return (
    <div className="space-y-4">
      {Array.from(byDate.entries()).map(([date, dateItems]) => (
        <div key={date}>
          <div className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-2">
            {new Date(date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div className="space-y-1">
            {dateItems.map(item => (
              <div key={item.id} className="bg-[#111125] border border-[rgba(0,255,136,0.1)] rounded-lg px-3 py-2 flex items-center gap-2">
                <span className={`flex-shrink-0 w-2 h-2 rounded-full ${TYPE_COLORS[item.type]}`} />
                {item.href ? (
                  <Link href={item.href} className="text-sm text-[#c0c0d0] hover:text-[#00ff88] truncate">{item.title}</Link>
                ) : (
                  <span className="text-sm text-[#c0c0d0] truncate">{item.title}</span>
                )}
                {item.type === "google_event" && <span className="ml-auto flex-shrink-0 text-xs text-[#444466] bg-[#0a0a1a] px-1.5 py-0.5 rounded">G</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function CalendarView({ items, filters }: CalendarViewProps) {
  const [view, setView] = useState<View>("month")
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => {
    const saved = sessionStorage.getItem("calendarView") as View | null
    if (saved) setView(saved)
  }, [])

  function switchView(v: View) {
    setView(v)
    sessionStorage.setItem("calendarView", v)
  }

  const filtered = filterItems(items, filters)

  return (
    <div>
      <div className="flex gap-1 mb-6">
        {(["month", "week", "agenda"] as View[]).map(v => (
          <button
            key={v}
            onClick={() => switchView(v)}
            className={`px-3 py-1.5 text-sm rounded-lg capitalize transition-colors ${view === v ? "bg-[rgba(0,255,136,0.15)] text-[#00ff88] border border-[rgba(0,255,136,0.3)]" : "text-[#666688] hover:text-[#c0c0d0]"}`}
          >
            {v}
          </button>
        ))}
      </div>
      {view === "month" && <MonthView items={filtered} currentDate={currentDate} setCurrentDate={setCurrentDate} />}
      {view === "week" && <WeekView items={filtered} currentDate={currentDate} setCurrentDate={setCurrentDate} />}
      {view === "agenda" && <AgendaView items={filtered} />}
    </div>
  )
}
```

- [ ] **Step 2: Create the calendar server page**

Create `app/(dashboard)/calendar/page.tsx`:

```tsx
import { prisma } from "@/lib/db"
import { fetchGoogleEvents } from "@/lib/services/calendar-sync"
import { CalendarView, CalendarItem } from "@/components/calendar/calendar-view"
import Link from "next/link"

export default async function CalendarPage() {
  let items: CalendarItem[] = []
  let filters = { tasks: true, projects: true, followUps: true, milestones: true, actionItems: true, googleEvents: true }
  let dbError = false

  try {
    const [tasks, projects, followUps, actionItems, googleEvents, pref] = await Promise.all([
      prisma.task.findMany({
        where: { dueDate: { not: null }, status: { notIn: ["done", "cancelled"] } },
        select: { id: true, title: true, dueDate: true, isMilestone: true, projectId: true },
      }),
      prisma.project.findMany({
        where: { targetDate: { not: null }, status: { notIn: ["done", "cancelled"] } },
        select: { id: true, title: true, targetDate: true },
      }),
      prisma.interaction.findMany({
        where: { followUpRequired: true, followUpCompleted: false, followUpDate: { not: null } },
        select: { id: true, followUpDate: true, contactId: true, contact: { select: { name: true } } },
        include: { contact: { select: { name: true } } },
      }),
      prisma.actionItem.findMany({
        where: { dueDate: { not: null }, status: "todo" },
        select: { id: true, title: true, dueDate: true },
      }),
      fetchGoogleEvents(42), // enough for month view + buffer
      prisma.userPreference.findFirst(),
    ])

    if (pref) filters = pref.calendarFilters as typeof filters

    for (const t of tasks) {
      items.push({
        id: t.id,
        type: t.isMilestone ? "milestone" : "task",
        title: t.title,
        date: t.dueDate!.toISOString().split("T")[0],
        href: `/projects/${t.projectId}`,
      })
    }
    for (const p of projects) {
      items.push({
        id: p.id,
        type: "project",
        title: p.title,
        date: p.targetDate!.toISOString().split("T")[0],
        href: `/projects/${p.id}`,
      })
    }
    for (const f of followUps) {
      items.push({
        id: f.id,
        type: "follow_up",
        title: `Follow-up: ${f.contact.name}`,
        date: f.followUpDate!.toISOString().split("T")[0],
        href: `/contacts/${f.contactId}`,
      })
    }
    for (const a of actionItems) {
      items.push({
        id: a.id,
        type: "action_item",
        title: a.title,
        date: a.dueDate!.toISOString().split("T")[0],
      })
    }
    for (const g of googleEvents) {
      items.push({
        id: g.googleEventId,
        type: "google_event",
        title: g.title,
        date: g.date,
      })
    }
  } catch (e) {
    console.error("[calendar page]", e)
    dbError = true
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#c0c0d0]">Calendar</h1>
        <Link href="/settings" className="text-xs text-[#666688] hover:text-[#c0c0d0]">Filter settings</Link>
      </div>

      {dbError && (
        <div className="bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.25)] rounded-lg px-4 py-3 text-sm text-red-400">
          Database unavailable. Check server logs.
        </div>
      )}

      {!dbError && <CalendarView items={items} filters={filters} />}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/calendar/calendar-view.tsx app/(dashboard)/calendar/page.tsx
git commit -m "feat: add /calendar page with month/week/agenda views and Google Calendar integration"
```

---

## Task 13: Navigation update

**Files:**
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/bottom-nav.tsx`

- [ ] **Step 1: Add Calendar to sidebar**

In `components/layout/sidebar.tsx`, update the `links` array:

```ts
const links = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/projects", label: "Projects" },
  { href: "/tasks", label: "Tasks" },
  { href: "/calendar", label: "Calendar" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
]
```

- [ ] **Step 2: Add Calendar to bottom nav (replace Reports with Cal to fit 7 items)**

In `components/layout/bottom-nav.tsx`, update the `tabs` array. The bottom nav now has 7 items; abbreviate labels to fit:

```ts
const tabs = [
  { href: "/", label: "Home", icon: "⊞" },
  { href: "/contacts", label: "Contacts", icon: "👤" },
  { href: "/log", label: "Log", icon: "+" },
  { href: "/projects", label: "Projects", icon: "📋" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
  { href: "/calendar", label: "Cal", icon: "▦" },
  { href: "/reports", label: "Reports", icon: "◈" },
]
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/layout/sidebar.tsx components/layout/bottom-nav.tsx
git commit -m "feat: add Calendar to sidebar and bottom nav"
```

---

## Task 14: Full test suite and push

- [ ] **Step 1: Run all tests**

Run: `npx jest --no-coverage`

Expected: All tests PASS. If any fail, fix before proceeding.

- [ ] **Step 2: Run production build**

Run: `npx next build --webpack`

Expected: TypeScript clean, build completes (AUTH_SECRET error during page data collection is pre-existing and expected in local env without env vars).

- [ ] **Step 3: Push to remote**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `GoogleToken` table | Task 1 |
| `CalendarSync` table | Task 1 |
| `UserPreference` table | Task 1 |
| `lib/encryption.ts` (AES-256-GCM) | Task 2 |
| `lib/google.ts` - `getGoogleClient()`, auto-refresh, `GoogleNotConnectedError` | Task 3 |
| `isGoogleConnected()`, `getConnectedEmail()` | Task 3 |
| OAuth connect/callback/disconnect routes | Task 4 |
| Settings Google section | Task 5 |
| `fetchRecentEmails()`, `getEmailThread()` | Task 6 |
| `upsertCalendarEvent()`, `deleteCalendarEvent()`, `fetchGoogleEvents()` | Task 7 |
| Projects, tasks, action items, interactions wired to sync | Task 8 |
| Gmail cron step + Redis cache | Task 9 |
| Briefing `recentEmails` field | Task 9 |
| Holly API `GET /api/holly/v1/gmail/recent` | Task 10 |
| Calendar preferences GET + POST route | Task 11 |
| `/calendar` page with month/week/agenda views | Task 12 |
| Filter preferences applied to view | Task 12 |
| Google events shown with `G` badge | Task 12 |
| View state persisted in sessionStorage | Task 12 |
| Calendar in sidebar + bottom nav | Task 13 |

**Placeholder scan:** None found.

**Type consistency:**
- `CalendarEntityType` values (`task`, `project`, `action_item`, `follow_up`) used consistently across Tasks 7, 8, 12.
- `CalendarItem.type` values in the client component (`task`, `project`, `follow_up`, `milestone`, `action_item`, `google_event`) align with what the server page constructs in Task 12.
- `GmailEmail` interface defined in Task 6, consumed in Tasks 9 and 10 with matching fields.
- `GoogleCalendarEvent` interface defined in Task 7, consumed in Task 12.
- `upsertCalendarEvent(entityType, entityId, { title, date })` signature used identically in Tasks 7 and 8.
