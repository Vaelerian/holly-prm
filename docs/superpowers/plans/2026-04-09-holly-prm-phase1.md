# Holly PRM Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a working PRM with contact management, interaction logging, relationship health monitoring, and Holly API access.

**Architecture:** Next.js 15 App Router, single container on Coolify. Server Components fetch data directly from a service layer. Client Components call REST API routes. Holly gets a separate `/api/holly/v1/*` route group authenticated by API key.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Prisma, PostgreSQL, Redis (ioredis), Auth.js v5 (next-auth@beta), Zod, bcryptjs, @ducanh2912/next-pwa, Jest

---

## File Map

```
app/
  (auth)/login/page.tsx              Login page
  (dashboard)/layout.tsx             Auth-protected shell with nav
  (dashboard)/page.tsx               Dashboard (Server Component)
  (dashboard)/contacts/page.tsx      Contact list (Server Component)
  (dashboard)/contacts/[id]/page.tsx Contact detail (Server Component)
  (dashboard)/settings/page.tsx      Settings — API key management
  api/auth/[...nextauth]/route.ts    Auth.js route handler
  api/v1/contacts/route.ts           GET list, POST create (Ian)
  api/v1/contacts/[id]/route.ts      GET, PUT, DELETE (Ian)
  api/v1/interactions/route.ts       GET list, POST create (Ian)
  api/v1/interactions/[id]/route.ts  GET, PUT, DELETE (Ian)
  api/v1/action-items/route.ts       GET list, POST create (Ian)
  api/v1/action-items/[id]/route.ts  PATCH status (Ian)
  api/holly/v1/contacts/route.ts     GET list/search (Holly)
  api/holly/v1/contacts/[id]/route.ts GET profile (Holly)
  api/holly/v1/interactions/route.ts GET list, POST create (Holly)
  api/holly/v1/briefing/route.ts     GET morning summary (Holly)
  api/holly/v1/follow-ups/route.ts   GET pending follow-ups (Holly)
  api/holly/v1/action-items/route.ts POST create (Holly)
  api/holly/v1/action-items/[id]/route.ts PATCH status (Holly)
components/
  layout/app-shell.tsx               Sidebar + bottom nav wrapper
  layout/sidebar.tsx                 Desktop sidebar
  layout/bottom-nav.tsx              Mobile bottom tab bar
  ui/button.tsx                      Button primitive
  ui/input.tsx                       Input primitive
  ui/badge.tsx                       Badge/pill primitive
  ui/toast.tsx                       Toast notification
  ui/dialog.tsx                      Modal dialog wrapper
  contacts/contact-card.tsx          Contact list item
  contacts/health-score-badge.tsx    Colour-coded health indicator
  contacts/contact-form.tsx          Create/edit contact form
  interactions/log-interaction-modal.tsx  Quick-entry modal
  interactions/interaction-list.tsx  Timeline of interactions
  dashboard/stats-row.tsx            Alert counts row
lib/
  db.ts                              Prisma client singleton
  redis.ts                           Redis client singleton
  auth.ts                            Auth.js v5 config
  holly-auth.ts                      API key validation + rate limiting
  health-score.ts                    Pure health score computation
  validations/contact.ts             Zod schemas for Contact
  validations/interaction.ts         Zod schemas for Interaction
  validations/action-item.ts         Zod schemas for ActionItem
  services/contacts.ts               Contact CRUD + search
  services/interactions.ts           Interaction CRUD + contact update
  services/action-items.ts           ActionItem CRUD
  services/briefing.ts               Briefing aggregation
  services/api-keys.ts               HollyApiKey CRUD
middleware.ts                        Auth.js route protection
prisma/schema.prisma                 Full schema (all 7 models)
public/manifest.json                 PWA manifest
next.config.ts                       next-pwa config
Dockerfile
docker-compose.yml                   Local dev
.env.example
__tests__/lib/health-score.test.ts
__tests__/lib/holly-auth.test.ts
__tests__/services/contacts.test.ts
__tests__/services/interactions.test.ts
__tests__/services/briefing.test.ts
```

---

## Task 1: Bootstrap

**Files:**
- Create: `package.json` (via create-next-app)
- Create: `.env.example`
- Create: `jest.config.ts`
- Create: `jest.setup.ts`

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd /path/to/holly-prm
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias="@/*" --use-npm
```

When prompted about existing files, keep them (docs folder is safe).

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install next-auth@beta @auth/core prisma @prisma/client ioredis bcryptjs zod @ducanh2912/next-pwa nanoid react-hook-form @hookform/resolvers
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D @types/bcryptjs @types/ioredis jest @types/jest ts-jest jest-environment-node @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 4: Create jest.config.ts**

```ts
import type { Config } from "jest"
import nextJest from "next/jest.js"

const createJestConfig = nextJest({ dir: "./" })

const config: Config = {
  testEnvironment: "node",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  testMatch: ["**/__tests__/**/*.test.ts"],
}

export default createJestConfig(config)
```

- [ ] **Step 5: Create jest.setup.ts**

```ts
// Empty for now — add global mocks here as needed
```

- [ ] **Step 6: Create .env.example**

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/holly_prm"

# Redis
REDIS_URL="redis://localhost:6379"

# Auth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# Google OAuth
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Single admin credentials (fallback login)
ADMIN_EMAIL="ian@example.com"
ADMIN_PASSWORD_HASH=""  # bcrypt hash — generate with: node -e "console.log(require('bcryptjs').hashSync('yourpassword', 12))"
```

- [ ] **Step 7: Add test script to package.json**

In `package.json`, ensure scripts includes:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: bootstrap Next.js 15 project with dependencies"
```

---

## Task 2: Prisma Schema

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`

- [ ] **Step 1: Initialise Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Replace prisma/schema.prisma with full schema**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ContactType { personal work family volunteer }
enum InteractionType { call meeting email message event }
enum Direction { inbound outbound }
enum ActionStatus { todo done cancelled }
enum Priority { low medium high critical }
enum Actor { ian holly }
enum ProjectCategory { personal work volunteer }
enum ProjectStatus { planning active on_hold done cancelled }
enum TaskStatus { todo in_progress done cancelled }
enum AuditAction { create update delete }
enum KnowledgeSourceType { interaction project contact }

model Contact {
  id                  String        @id @default(uuid())
  name                String
  type                ContactType
  emails              Json          @default("[]")
  phones              Json          @default("[]")
  healthScore         Int           @default(100)
  lastInteraction     DateTime?
  interactionFreqDays Int?
  isFamilyMember      Boolean       @default(false)
  tags                String[]
  notes               String        @default("")
  preferences         Json          @default("{}")
  interactions        Interaction[]
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt
}

model Interaction {
  id                String          @id @default(uuid())
  contactId         String
  contact           Contact         @relation(fields: [contactId], references: [id], onDelete: Cascade)
  type              InteractionType
  direction         Direction
  summary           String
  outcome           String?
  followUpRequired  Boolean         @default(false)
  followUpDate      DateTime?
  followUpCompleted Boolean         @default(false)
  callbackExpected  Boolean         @default(false)
  createdByHolly    Boolean         @default(false)
  location          String?
  duration          Int?
  occurredAt        DateTime
  actionItems       ActionItem[]
  createdAt         DateTime        @default(now())
}

model ActionItem {
  id            String       @id @default(uuid())
  interactionId String?
  interaction   Interaction? @relation(fields: [interactionId], references: [id], onDelete: SetNull)
  taskId        String?
  task          Task?        @relation(fields: [taskId], references: [id], onDelete: SetNull)
  title         String
  status        ActionStatus @default(todo)
  priority      Priority     @default(medium)
  assignedTo    Actor
  dueDate       DateTime?
  createdAt     DateTime     @default(now())
}

model Project {
  id          String          @id @default(uuid())
  title       String
  description String          @default("")
  category    ProjectCategory
  status      ProjectStatus   @default(planning)
  priority    Priority        @default(medium)
  targetDate  DateTime?
  notes       String          @default("")
  tasks       Task[]
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
}

model Task {
  id          String       @id @default(uuid())
  projectId   String
  project     Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  title       String
  description String       @default("")
  status      TaskStatus   @default(todo)
  priority    Priority     @default(medium)
  assignedTo  Actor
  dueDate     DateTime?
  isMilestone Boolean      @default(false)
  actionItems ActionItem[]
  createdAt   DateTime     @default(now())
}

model AuditLog {
  id         String      @id @default(uuid())
  entity     String
  entityId   String
  action     AuditAction
  actor      Actor
  diff       Json?
  occurredAt DateTime    @default(now())
}

model KnowledgeItem {
  id               String              @id @default(uuid())
  sourceId         String
  sourceType       KnowledgeSourceType
  content          String
  proposedCategory String              @default("")
  tags             String[]
  obsidianReady    Boolean             @default(false)
  exported         Boolean             @default(false)
  createdAt        DateTime            @default(now())
}

model HollyApiKey {
  id        String    @id @default(uuid())
  name      String
  keyHash   String    @unique
  lastUsed  DateTime?
  createdAt DateTime  @default(now())
}
```

- [ ] **Step 3: Run initial migration**

```bash
npx prisma migrate dev --name init
```

Expected: Migration applied, Prisma Client generated.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add full Prisma schema with all 7 models"
```

---

## Task 3: DB and Redis Clients

**Files:**
- Create: `lib/db.ts`
- Create: `lib/redis.ts`

- [ ] **Step 1: Create lib/db.ts**

```ts
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error"] : [] })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
```

- [ ] **Step 2: Create lib/redis.ts**

```ts
import Redis from "ioredis"

const globalForRedis = globalThis as unknown as { redis: Redis | undefined }

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  })

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis
```

- [ ] **Step 3: Commit**

```bash
git add lib/
git commit -m "feat: add Prisma and Redis client singletons"
```

---

## Task 4: Health Score

**Files:**
- Create: `lib/health-score.ts`
- Create: `__tests__/lib/health-score.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/lib/health-score.test.ts
import { computeHealthScore } from "@/lib/health-score"

describe("computeHealthScore", () => {
  it("returns 100 when no frequency threshold is set", () => {
    expect(computeHealthScore(new Date(), null)).toBe(100)
  })

  it("returns 100 when no interaction has occurred", () => {
    expect(computeHealthScore(null, 30)).toBe(100)
  })

  it("returns 100 when within frequency window", () => {
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
    expect(computeHealthScore(recent, 30)).toBe(100)
  })

  it("returns 50 when overdue by half a period", () => {
    const lastContact = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) // 45 days ago
    const score = computeHealthScore(lastContact, 30) // 15 days overdue, freqDays=30
    expect(score).toBe(50)
  })

  it("returns 0 when overdue by a full period or more", () => {
    const lastContact = new Date(Date.now() - 61 * 24 * 60 * 60 * 1000) // 61 days ago
    expect(computeHealthScore(lastContact, 30)).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/lib/health-score.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/health-score'`

- [ ] **Step 3: Implement lib/health-score.ts**

```ts
export function computeHealthScore(
  lastInteraction: Date | null,
  freqDays: number | null
): number {
  if (!freqDays || !lastInteraction) return 100
  const daysSince = Math.floor(
    (Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (daysSince <= freqDays) return 100
  const overdueDays = daysSince - freqDays
  const penalty = Math.min(overdueDays / freqDays, 1) * 100
  return Math.max(0, Math.round(100 - penalty))
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/lib/health-score.test.ts --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/health-score.ts __tests__/lib/health-score.test.ts
git commit -m "feat: add health score computation with tests"
```

---

## Task 5: Zod Validations

**Files:**
- Create: `lib/validations/contact.ts`
- Create: `lib/validations/interaction.ts`
- Create: `lib/validations/action-item.ts`

- [ ] **Step 1: Create lib/validations/contact.ts**

```ts
import { z } from "zod"

export const ContactTypeSchema = z.enum(["personal", "work", "family", "volunteer"])

export const CreateContactSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  type: ContactTypeSchema,
  emails: z.array(z.object({ label: z.string(), value: z.string().email() })).default([]),
  phones: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  interactionFreqDays: z.number().int().positive().nullable().default(null),
  isFamilyMember: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  notes: z.string().default(""),
  preferences: z.record(z.unknown()).default({}),
})

export const UpdateContactSchema = CreateContactSchema.partial()

export type CreateContactInput = z.infer<typeof CreateContactSchema>
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>
```

- [ ] **Step 2: Create lib/validations/interaction.ts**

```ts
import { z } from "zod"

export const InteractionTypeSchema = z.enum(["call", "meeting", "email", "message", "event"])
export const DirectionSchema = z.enum(["inbound", "outbound"])

export const CreateInteractionSchema = z.object({
  contactId: z.string().uuid(),
  type: InteractionTypeSchema,
  direction: DirectionSchema,
  summary: z.string().min(1, "Summary is required").max(2000),
  outcome: z.string().max(2000).nullable().default(null),
  followUpRequired: z.boolean().default(false),
  followUpDate: z.string().datetime().nullable().default(null),
  callbackExpected: z.boolean().default(false),
  location: z.string().max(200).nullable().default(null),
  duration: z.number().int().positive().nullable().default(null),
  occurredAt: z.string().datetime(),
})

export const UpdateInteractionSchema = CreateInteractionSchema.partial().extend({
  followUpCompleted: z.boolean().optional(),
})

export type CreateInteractionInput = z.infer<typeof CreateInteractionSchema>
export type UpdateInteractionInput = z.infer<typeof UpdateInteractionSchema>
```

- [ ] **Step 3: Create lib/validations/action-item.ts**

```ts
import { z } from "zod"

export const PrioritySchema = z.enum(["low", "medium", "high", "critical"])
export const ActorSchema = z.enum(["ian", "holly"])

export const CreateActionItemSchema = z.object({
  interactionId: z.string().uuid().nullable().default(null),
  taskId: z.string().uuid().nullable().default(null),
  title: z.string().min(1).max(500),
  priority: PrioritySchema.default("medium"),
  assignedTo: ActorSchema,
  dueDate: z.string().datetime().nullable().default(null),
})

export const UpdateActionItemSchema = z.object({
  status: z.enum(["todo", "done", "cancelled"]),
})

export type CreateActionItemInput = z.infer<typeof CreateActionItemSchema>
export type UpdateActionItemInput = z.infer<typeof UpdateActionItemSchema>
```

- [ ] **Step 4: Commit**

```bash
git add lib/validations/
git commit -m "feat: add Zod validation schemas for all entities"
```

---

## Task 6: Contact Service

**Files:**
- Create: `lib/services/contacts.ts`
- Create: `__tests__/services/contacts.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/services/contacts.test.ts
import { listContacts, getContact, createContact, updateContact, deleteContact } from "@/lib/services/contacts"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    contact: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("listContacts", () => {
  it("returns contacts ordered by name", async () => {
    const contacts = [{ id: "1", name: "Alice" }, { id: "2", name: "Bob" }]
    mockPrisma.contact.findMany.mockResolvedValue(contacts as any)
    const result = await listContacts({})
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: "asc" } })
    )
    expect(result).toEqual(contacts)
  })

  it("filters by search query on name", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([])
    await listContacts({ q: "alice" })
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: expect.objectContaining({ contains: "alice", mode: "insensitive" }),
        }),
      })
    )
  })

  it("filters overdue contacts when overdue=true", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([])
    await listContacts({ overdue: true })
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ healthScore: { lt: 100 }, interactionFreqDays: { not: null } }),
      })
    )
  })
})

describe("createContact", () => {
  it("creates contact and writes audit log", async () => {
    const input = { name: "Alice", type: "personal" as const, emails: [], phones: [], interactionFreqDays: null, isFamilyMember: false, tags: [], notes: "", preferences: {} }
    const created = { id: "abc", ...input }
    mockPrisma.contact.create.mockResolvedValue(created as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    const result = await createContact(input, "ian")
    expect(mockPrisma.contact.create).toHaveBeenCalledWith({ data: input })
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: "Contact", entityId: "abc", action: "create", actor: "ian" }),
    })
    expect(result).toEqual(created)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest __tests__/services/contacts.test.ts --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement lib/services/contacts.ts**

```ts
import { prisma } from "@/lib/db"
import { Actor } from "@prisma/client"
import type { CreateContactInput, UpdateContactInput } from "@/lib/validations/contact"

interface ListContactsOptions {
  q?: string
  type?: string
  overdue?: boolean
}

export async function listContacts(opts: ListContactsOptions) {
  const where: Record<string, unknown> = {}
  if (opts.q) where.name = { contains: opts.q, mode: "insensitive" }
  if (opts.type) where.type = opts.type
  if (opts.overdue) {
    where.healthScore = { lt: 100 }
    where.interactionFreqDays = { not: null }
  }
  return prisma.contact.findMany({ where, orderBy: { name: "asc" } })
}

export async function getContact(id: string) {
  return prisma.contact.findUnique({
    where: { id },
    include: { interactions: { orderBy: { occurredAt: "desc" }, take: 20 } },
  })
}

export async function createContact(data: CreateContactInput, actor: Actor) {
  const contact = await prisma.contact.create({ data })
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: contact.id, action: "create", actor },
  })
  return contact
}

export async function updateContact(id: string, data: UpdateContactInput, actor: Actor) {
  const before = await prisma.contact.findUnique({ where: { id } })
  const contact = await prisma.contact.update({ where: { id }, data })
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: id, action: "update", actor, diff: { before, after: contact } },
  })
  return contact
}

export async function deleteContact(id: string, actor: Actor) {
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: id, action: "delete", actor },
  })
  return prisma.contact.delete({ where: { id } })
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/services/contacts.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/services/contacts.ts __tests__/services/contacts.test.ts
git commit -m "feat: add contacts service with audit logging"
```

---

## Task 7: Interaction Service

**Files:**
- Create: `lib/services/interactions.ts`
- Create: `__tests__/services/interactions.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/services/interactions.test.ts
import { createInteraction, listInteractions } from "@/lib/services/interactions"
import { prisma } from "@/lib/db"
import { computeHealthScore } from "@/lib/health-score"

jest.mock("@/lib/db", () => ({
  prisma: {
    interaction: { create: jest.fn(), findMany: jest.fn() },
    contact: { findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}))

jest.mock("@/lib/health-score", () => ({
  computeHealthScore: jest.fn().mockReturnValue(75),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("createInteraction", () => {
  it("creates interaction and updates contact health score", async () => {
    const input = {
      contactId: "contact-1",
      type: "call" as const,
      direction: "outbound" as const,
      summary: "Caught up",
      outcome: null,
      followUpRequired: false,
      followUpDate: null,
      callbackExpected: false,
      location: null,
      duration: null,
      occurredAt: "2026-04-09T10:00:00Z",
    }
    const created = { id: "int-1", ...input, occurredAt: new Date(input.occurredAt) }
    mockPrisma.interaction.create.mockResolvedValue(created as any)
    mockPrisma.contact.findUnique.mockResolvedValue({ interactionFreqDays: 30 } as any)
    mockPrisma.contact.update.mockResolvedValue({} as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createInteraction(input, "ian")

    expect(mockPrisma.interaction.create).toHaveBeenCalled()
    expect(mockPrisma.contact.update).toHaveBeenCalledWith({
      where: { id: "contact-1" },
      data: { lastInteraction: created.occurredAt, healthScore: 75 },
    })
    expect(computeHealthScore).toHaveBeenCalledWith(created.occurredAt, 30)
  })
})

describe("listInteractions", () => {
  it("filters by contactId when provided", async () => {
    mockPrisma.interaction.findMany.mockResolvedValue([])
    await listInteractions({ contactId: "contact-1" })
    expect(mockPrisma.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ contactId: "contact-1" }) })
    )
  })

  it("filters followUpRequired when requested", async () => {
    mockPrisma.interaction.findMany.mockResolvedValue([])
    await listInteractions({ followUpRequired: true })
    expect(mockPrisma.interaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ followUpRequired: true, followUpCompleted: false }),
      })
    )
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest __tests__/services/interactions.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement lib/services/interactions.ts**

```ts
import { prisma } from "@/lib/db"
import { Actor } from "@prisma/client"
import { computeHealthScore } from "@/lib/health-score"
import type { CreateInteractionInput, UpdateInteractionInput } from "@/lib/validations/interaction"

interface ListInteractionsOptions {
  contactId?: string
  followUpRequired?: boolean
  limit?: number
}

export async function listInteractions(opts: ListInteractionsOptions) {
  const where: Record<string, unknown> = {}
  if (opts.contactId) where.contactId = opts.contactId
  if (opts.followUpRequired) {
    where.followUpRequired = true
    where.followUpCompleted = false
  }
  return prisma.interaction.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take: opts.limit ?? 50,
    include: { contact: { select: { id: true, name: true } } },
  })
}

export async function getInteraction(id: string) {
  return prisma.interaction.findUnique({ where: { id }, include: { actionItems: true } })
}

export async function createInteraction(data: CreateInteractionInput, actor: Actor) {
  const interaction = await prisma.interaction.create({
    data: { ...data, occurredAt: new Date(data.occurredAt), followUpDate: data.followUpDate ? new Date(data.followUpDate) : null, createdByHolly: actor === "holly" },
  })

  const contact = await prisma.contact.findUnique({
    where: { id: data.contactId },
    select: { interactionFreqDays: true },
  })
  const healthScore = computeHealthScore(interaction.occurredAt, contact?.interactionFreqDays ?? null)
  await prisma.contact.update({
    where: { id: data.contactId },
    data: { lastInteraction: interaction.occurredAt, healthScore },
  })

  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: interaction.id, action: "create", actor },
  })

  return interaction
}

export async function updateInteraction(id: string, data: UpdateInteractionInput, actor: Actor) {
  const interaction = await prisma.interaction.update({ where: { id }, data })
  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: id, action: "update", actor },
  })
  return interaction
}

export async function deleteInteraction(id: string, actor: Actor) {
  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: id, action: "delete", actor },
  })
  return prisma.interaction.delete({ where: { id } })
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/services/interactions.test.ts --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/services/interactions.ts __tests__/services/interactions.test.ts
git commit -m "feat: add interactions service with health score update"
```

---

## Task 8: Action Item and Briefing Services

**Files:**
- Create: `lib/services/action-items.ts`
- Create: `lib/services/briefing.ts`
- Create: `__tests__/services/briefing.test.ts`

- [ ] **Step 1: Create lib/services/action-items.ts**

```ts
import { prisma } from "@/lib/db"
import { Actor } from "@prisma/client"
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
  return item
}

export async function updateActionItemStatus(id: string, data: UpdateActionItemInput, actor: Actor) {
  const item = await prisma.actionItem.update({ where: { id }, data })
  await prisma.auditLog.create({
    data: { entity: "ActionItem", entityId: id, action: "update", actor },
  })
  return item
}
```

- [ ] **Step 2: Write failing briefing test**

```ts
// __tests__/services/briefing.test.ts
import { getBriefing } from "@/lib/services/briefing"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    contact: { findMany: jest.fn() },
    interaction: { findMany: jest.fn() },
    actionItem: { findMany: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

it("getBriefing returns overdue contacts, pending follow-ups, and open action items", async () => {
  mockPrisma.contact.findMany.mockResolvedValue([{ id: "c1", name: "Alice", healthScore: 40 }] as any)
  mockPrisma.interaction.findMany.mockResolvedValue([{ id: "i1", followUpRequired: true }] as any)
  mockPrisma.actionItem.findMany.mockResolvedValue([{ id: "a1", status: "todo" }] as any)

  const result = await getBriefing()

  expect(result.overdueContacts).toHaveLength(1)
  expect(result.pendingFollowUps).toHaveLength(1)
  expect(result.openActionItems).toHaveLength(1)
  expect(result.generatedAt).toBeInstanceOf(Date)
})
```

- [ ] **Step 3: Run to verify failure**

```bash
npx jest __tests__/services/briefing.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 4: Create lib/services/briefing.ts**

```ts
import { prisma } from "@/lib/db"

export async function getBriefing() {
  const [overdueContacts, pendingFollowUps, openActionItems] = await Promise.all([
    prisma.contact.findMany({
      where: { healthScore: { lt: 100 }, interactionFreqDays: { not: null } },
      orderBy: { healthScore: "asc" },
      take: 10,
    }),
    prisma.interaction.findMany({
      where: { followUpRequired: true, followUpCompleted: false },
      orderBy: { followUpDate: "asc" },
      take: 20,
      include: { contact: { select: { id: true, name: true } } },
    }),
    prisma.actionItem.findMany({
      where: { status: "todo" },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 20,
    }),
  ])

  return { overdueContacts, pendingFollowUps, openActionItems, generatedAt: new Date() }
}
```

- [ ] **Step 5: Run tests**

```bash
npx jest __tests__/services/briefing.test.ts --no-coverage
```

Expected: PASS (1 test)

- [ ] **Step 6: Commit**

```bash
git add lib/services/
git commit -m "feat: add action item and briefing services"
```

---

## Task 9: Authentication

**Files:**
- Create: `lib/auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`
- Create: `middleware.ts`
- Create: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Create lib/auth.ts**

```ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const adminEmail = process.env.ADMIN_EMAIL
        const adminHash = process.env.ADMIN_PASSWORD_HASH
        if (!adminEmail || !adminHash) return null
        if (credentials.email !== adminEmail) return null
        const valid = await bcrypt.compare(credentials.password as string, adminHash)
        if (!valid) return null
        return { id: "ian", email: adminEmail, name: "Ian" }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
})
```

- [ ] **Step 2: Create app/api/auth/[...nextauth]/route.ts**

```ts
import { handlers } from "@/lib/auth"
export const { GET, POST } = handlers
```

- [ ] **Step 3: Create middleware.ts**

```ts
import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isHollyRoute = req.nextUrl.pathname.startsWith("/api/holly")
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth")
  const isLoginPage = req.nextUrl.pathname === "/login"

  if (isHollyRoute || isAuthRoute || isLoginPage) return NextResponse.next()
  if (!req.auth) return NextResponse.redirect(new URL("/login", req.url))
  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)"],
}
```

- [ ] **Step 4: Create app/(auth)/login/page.tsx**

```tsx
"use client"

import { signIn } from "next-auth/react"
import { useState } from "react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    const res = await signIn("credentials", { email, password, redirect: false })
    if (res?.error) setError("Invalid email or password")
    else window.location.href = "/"
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Holly PRM</h1>

        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Sign in with Google
        </button>

        <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div><div className="relative flex justify-center text-xs text-gray-400"><span className="bg-white px-2">or</span></div></div>

        <form onSubmit={handleCredentials} className="space-y-4">
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" required />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700">Sign in</button>
        </form>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts app/api/auth/ middleware.ts app/\(auth\)/
git commit -m "feat: add Auth.js v5 with Google OAuth and credentials"
```

---

## Task 10: Holly API Key Middleware

**Files:**
- Create: `lib/holly-auth.ts`
- Create: `__tests__/lib/holly-auth.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/lib/holly-auth.test.ts
import { validateHollyRequest } from "@/lib/holly-auth"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import bcrypt from "bcryptjs"
import { NextRequest } from "next/server"

jest.mock("@/lib/db", () => ({
  prisma: { hollyApiKey: { findMany: jest.fn(), update: jest.fn() } },
}))
jest.mock("@/lib/redis", () => ({
  redis: { incr: jest.fn(), expire: jest.fn() },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockRedis = redis as jest.Mocked<typeof redis>

beforeEach(() => jest.clearAllMocks())

function makeRequest(apiKey?: string) {
  const headers: Record<string, string> = {}
  if (apiKey) headers["x-holly-api-key"] = apiKey
  return new NextRequest("http://localhost/api/holly/v1/briefing", { headers })
}

it("rejects request with no API key", async () => {
  const result = await validateHollyRequest(makeRequest())
  expect(result.valid).toBe(false)
})

it("rejects request with wrong prefix", async () => {
  const result = await validateHollyRequest(makeRequest("wrong_abc123"))
  expect(result.valid).toBe(false)
})

it("returns valid=false when rate limit exceeded", async () => {
  mockRedis.incr.mockResolvedValue(1001 as any)
  mockRedis.expire.mockResolvedValue(1 as any)
  const result = await validateHollyRequest(makeRequest("hky_testkey"))
  expect(result.valid).toBe(false)
  expect(result.rateLimited).toBe(true)
})

it("returns valid=true when key matches stored hash", async () => {
  const plaintext = "hky_validkey123"
  const hash = await bcrypt.hash(plaintext, 1)
  mockRedis.incr.mockResolvedValue(1 as any)
  mockRedis.expire.mockResolvedValue(1 as any)
  mockPrisma.hollyApiKey.findMany.mockResolvedValue([{ id: "key-1", keyHash: hash, name: "test" }] as any)
  mockPrisma.hollyApiKey.update.mockResolvedValue({} as any)

  const result = await validateHollyRequest(makeRequest(plaintext))
  expect(result.valid).toBe(true)
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest __tests__/lib/holly-auth.test.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Implement lib/holly-auth.ts**

```ts
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { redis } from "@/lib/redis"
import bcrypt from "bcryptjs"

interface ValidationResult {
  valid: boolean
  rateLimited?: boolean
  keyId?: string
}

export async function validateHollyRequest(req: NextRequest): Promise<ValidationResult> {
  const apiKey = req.headers.get("x-holly-api-key")
  if (!apiKey || !apiKey.startsWith("hky_")) return { valid: false }

  const rateLimitKey = `holly:ratelimit:${apiKey.slice(0, 24)}`
  const count = await redis.incr(rateLimitKey)
  if (count === 1) await redis.expire(rateLimitKey, 60)
  if (count > 1000) return { valid: false, rateLimited: true }

  const keys = await prisma.hollyApiKey.findMany()
  for (const key of keys) {
    const match = await bcrypt.compare(apiKey, key.keyHash)
    if (match) {
      await prisma.hollyApiKey.update({ where: { id: key.id }, data: { lastUsed: new Date() } })
      return { valid: true, keyId: key.id }
    }
  }

  return { valid: false }
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/lib/holly-auth.test.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 5: Create lib/services/api-keys.ts**

```ts
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { customAlphabet } from "nanoid"

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 32)

export async function generateApiKey(name: string) {
  const plaintext = `hky_${nanoid()}`
  const keyHash = await bcrypt.hash(plaintext, 12)
  await prisma.hollyApiKey.create({ data: { name, keyHash } })
  return plaintext // returned once, never stored in plaintext
}

export async function listApiKeys() {
  return prisma.hollyApiKey.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, lastUsed: true, createdAt: true } })
}

export async function deleteApiKey(id: string) {
  return prisma.hollyApiKey.delete({ where: { id } })
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/holly-auth.ts lib/services/api-keys.ts __tests__/lib/holly-auth.test.ts
git commit -m "feat: add Holly API key auth with rate limiting"
```

---

## Task 11: Ian's API Routes

**Files:**
- Create: `app/api/v1/contacts/route.ts`
- Create: `app/api/v1/contacts/[id]/route.ts`
- Create: `app/api/v1/interactions/route.ts`
- Create: `app/api/v1/interactions/[id]/route.ts`
- Create: `app/api/v1/action-items/route.ts`
- Create: `app/api/v1/action-items/[id]/route.ts`

All Ian API routes follow the same pattern: verify session, validate body with Zod, call service, return JSON.

- [ ] **Step 1: Create app/api/v1/contacts/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listContacts, createContact } from "@/lib/services/contacts"
import { CreateContactSchema } from "@/lib/validations/contact"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const contacts = await listContacts({
    q: searchParams.get("q") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    overdue: searchParams.get("overdue") === "true",
  })
  return NextResponse.json(contacts)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const body = await req.json()
  const parsed = CreateContactSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })

  const contact = await createContact(parsed.data, "ian")
  return NextResponse.json(contact, { status: 201 })
}
```

- [ ] **Step 2: Create app/api/v1/contacts/[id]/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getContact, updateContact, deleteContact } from "@/lib/services/contacts"
import { UpdateContactSchema } from "@/lib/validations/contact"

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const contact = await getContact(params.id)
  if (!contact) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(contact)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const body = await req.json()
  const parsed = UpdateContactSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })

  const contact = await updateContact(params.id, parsed.data, "ian")
  return NextResponse.json(contact)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  await deleteContact(params.id, "ian")
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Create app/api/v1/interactions/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listInteractions, createInteraction } from "@/lib/services/interactions"
import { CreateInteractionSchema } from "@/lib/validations/interaction"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const interactions = await listInteractions({
    contactId: searchParams.get("contactId") ?? undefined,
    followUpRequired: searchParams.get("followUpRequired") === "true",
  })
  return NextResponse.json(interactions)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })

  const body = await req.json()
  const parsed = CreateInteractionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })

  const interaction = await createInteraction(parsed.data, "ian")
  return NextResponse.json(interaction, { status: 201 })
}
```

- [ ] **Step 4: Create app/api/v1/interactions/[id]/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getInteraction, updateInteraction, deleteInteraction } from "@/lib/services/interactions"
import { UpdateInteractionSchema } from "@/lib/validations/interaction"

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const interaction = await getInteraction(params.id)
  if (!interaction) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(interaction)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = UpdateInteractionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const interaction = await updateInteraction(params.id, parsed.data, "ian")
  return NextResponse.json(interaction)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  await deleteInteraction(params.id, "ian")
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 5: Create app/api/v1/action-items/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listActionItems, createActionItem } from "@/lib/services/action-items"
import { CreateActionItemSchema } from "@/lib/validations/action-item"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { searchParams } = req.nextUrl
  const items = await listActionItems({ status: searchParams.get("status") ?? undefined })
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateActionItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const item = await createActionItem(parsed.data, "ian")
  return NextResponse.json(item, { status: 201 })
}
```

- [ ] **Step 6: Create app/api/v1/action-items/[id]/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateActionItemStatus } from "@/lib/services/action-items"
import { UpdateActionItemSchema } from "@/lib/validations/action-item"

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = UpdateActionItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const item = await updateActionItemStatus(params.id, parsed.data, "ian")
  return NextResponse.json(item)
}
```

- [ ] **Step 7: Commit**

```bash
git add app/api/v1/
git commit -m "feat: add Ian REST API routes for contacts, interactions, action items"
```

---

## Task 12: Holly API Routes

**Files:**
- Create: `app/api/holly/v1/contacts/route.ts`
- Create: `app/api/holly/v1/contacts/[id]/route.ts`
- Create: `app/api/holly/v1/interactions/route.ts`
- Create: `app/api/holly/v1/briefing/route.ts`
- Create: `app/api/holly/v1/follow-ups/route.ts`
- Create: `app/api/holly/v1/action-items/route.ts`
- Create: `app/api/holly/v1/action-items/[id]/route.ts`

Holly routes follow the same pattern but use `validateHollyRequest` instead of `auth()`.

- [ ] **Step 1: Create app/api/holly/v1/contacts/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { listContacts } from "@/lib/services/contacts"

export async function GET(req: NextRequest) {
  const auth = await validateHollyRequest(req)
  if (!auth.valid) {
    if (auth.rateLimited) return NextResponse.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } })
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  }
  const { searchParams } = req.nextUrl
  const contacts = await listContacts({
    q: searchParams.get("q") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    overdue: searchParams.get("overdue") === "true",
  })
  return NextResponse.json(contacts)
}
```

- [ ] **Step 2: Create app/api/holly/v1/contacts/[id]/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { getContact } from "@/lib/services/contacts"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await validateHollyRequest(req)
  if (!auth.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const contact = await getContact(params.id)
  if (!contact) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(contact)
}
```

- [ ] **Step 3: Create app/api/holly/v1/interactions/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { listInteractions, createInteraction } from "@/lib/services/interactions"
import { CreateInteractionSchema } from "@/lib/validations/interaction"

export async function GET(req: NextRequest) {
  const auth = await validateHollyRequest(req)
  if (!auth.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { searchParams } = req.nextUrl
  const interactions = await listInteractions({
    contactId: searchParams.get("contactId") ?? undefined,
    followUpRequired: searchParams.get("followUpRequired") === "true",
  })
  return NextResponse.json(interactions)
}

export async function POST(req: NextRequest) {
  const auth = await validateHollyRequest(req)
  if (!auth.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateInteractionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const interaction = await createInteraction(parsed.data, "holly")
  return NextResponse.json(interaction, { status: 201 })
}
```

- [ ] **Step 4: Create app/api/holly/v1/briefing/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { getBriefing } from "@/lib/services/briefing"

export async function GET(req: NextRequest) {
  const auth = await validateHollyRequest(req)
  if (!auth.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const briefing = await getBriefing()
  return NextResponse.json(briefing)
}
```

- [ ] **Step 5: Create app/api/holly/v1/follow-ups/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { listInteractions } from "@/lib/services/interactions"

export async function GET(req: NextRequest) {
  const auth = await validateHollyRequest(req)
  if (!auth.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const followUps = await listInteractions({ followUpRequired: true })
  return NextResponse.json(followUps)
}
```

- [ ] **Step 6: Create app/api/holly/v1/action-items/route.ts and [id]/route.ts**

`app/api/holly/v1/action-items/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { createActionItem } from "@/lib/services/action-items"
import { CreateActionItemSchema } from "@/lib/validations/action-item"

export async function POST(req: NextRequest) {
  const auth = await validateHollyRequest(req)
  if (!auth.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateActionItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const item = await createActionItem(parsed.data, "holly")
  return NextResponse.json(item, { status: 201 })
}
```

`app/api/holly/v1/action-items/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server"
import { validateHollyRequest } from "@/lib/holly-auth"
import { updateActionItemStatus } from "@/lib/services/action-items"
import { UpdateActionItemSchema } from "@/lib/validations/action-item"

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await validateHollyRequest(req)
  if (!auth.valid) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = UpdateActionItemSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const item = await updateActionItemStatus(params.id, parsed.data, "holly")
  return NextResponse.json(item)
}
```

- [ ] **Step 7: Commit**

```bash
git add app/api/holly/
git commit -m "feat: add Holly API routes (contacts, interactions, briefing, follow-ups, action items)"
```

---

## Task 13: App Shell and Navigation

**Files:**
- Create: `app/(dashboard)/layout.tsx`
- Create: `components/layout/app-shell.tsx`
- Create: `components/layout/sidebar.tsx`
- Create: `components/layout/bottom-nav.tsx`

- [ ] **Step 1: Create components/layout/sidebar.tsx**

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/projects", label: "Projects" },
  { href: "/tasks", label: "Tasks" },
  { href: "/settings", label: "Settings" },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <nav className="hidden md:flex flex-col w-44 min-h-screen bg-gray-900 text-white flex-shrink-0">
      <div className="px-4 py-5 font-bold text-lg border-b border-gray-700">Holly</div>
      <div className="flex-1 py-2">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`block px-4 py-2.5 text-sm ${pathname === href ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-800"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <button onClick={() => signOut({ callbackUrl: "/login" })} className="px-4 py-3 text-xs text-gray-500 hover:text-gray-300 text-left border-t border-gray-700">
        Sign out
      </button>
    </nav>
  )
}
```

- [ ] **Step 2: Create components/layout/bottom-nav.tsx**

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const tabs = [
  { href: "/", label: "Home", icon: "⊞" },
  { href: "/contacts", label: "Contacts", icon: "👤" },
  { href: "/log", label: "Log", icon: "+" },
  { href: "/projects", label: "Projects", icon: "📋" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
]

export function BottomNav({ onLogPress }: { onLogPress: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 flex">
      {tabs.map(({ href, label, icon }) =>
        label === "Log" ? (
          <button
            key="log"
            onClick={onLogPress}
            className="flex-1 flex flex-col items-center py-2 text-blue-400"
          >
            <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg mb-0.5">+</span>
            <span className="text-xs">Log</span>
          </button>
        ) : (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center py-2 text-xs ${pathname === href ? "text-blue-400" : "text-gray-400"}`}
          >
            <span className="text-lg mb-0.5">{icon}</span>
            {label}
          </Link>
        )
      )}
    </nav>
  )
}
```

- [ ] **Step 3: Create components/layout/app-shell.tsx**

```tsx
"use client"

import { useState } from "react"
import { Sidebar } from "./sidebar"
import { BottomNav } from "./bottom-nav"
import { LogInteractionModal } from "@/components/interactions/log-interaction-modal"

export function AppShell({ children }: { children: React.ReactNode }) {
  const [logOpen, setLogOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 pb-20 md:pb-0 overflow-y-auto">
        {children}
      </main>
      <BottomNav onLogPress={() => setLogOpen(true)} />
      <LogInteractionModal open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  )
}
```

- [ ] **Step 4: Create app/(dashboard)/layout.tsx**

```tsx
import { AppShell } from "@/components/layout/app-shell"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
```

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/layout.tsx components/layout/
git commit -m "feat: add app shell with desktop sidebar and mobile bottom nav"
```

---

## Task 14: Shared UI Primitives

**Files:**
- Create: `components/ui/button.tsx`
- Create: `components/ui/input.tsx`
- Create: `components/ui/badge.tsx`
- Create: `components/ui/dialog.tsx`

- [ ] **Step 1: Create components/ui/button.tsx**

```tsx
import { ButtonHTMLAttributes, forwardRef } from "react"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "sm" | "md"
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => {
    const base = "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
    const variants = {
      primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
      secondary: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-400",
      ghost: "text-gray-600 hover:bg-gray-100 focus:ring-gray-400",
      danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
    }
    const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm" }
    return <button ref={ref} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
  }
)
Button.displayName = "Button"
```

- [ ] **Step 2: Create components/ui/input.tsx**

```tsx
import { InputHTMLAttributes, forwardRef } from "react"

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => (
    <div className="space-y-1">
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      <input
        ref={ref}
        className={`block w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? "border-red-400" : "border-gray-300"} ${className}`}
        {...props}
      />
      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  )
)
Input.displayName = "Input"
```

- [ ] **Step 3: Create components/ui/badge.tsx**

```tsx
interface BadgeProps {
  children: React.ReactNode
  variant?: "default" | "success" | "warning" | "danger" | "info"
}

const variants = {
  default: "bg-gray-100 text-gray-700",
  success: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-blue-100 text-blue-800",
}

export function Badge({ children, variant = "default" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  )
}
```

- [ ] **Step 4: Create components/ui/dialog.tsx**

```tsx
"use client"

import { useEffect, useRef } from "react"

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (open) ref.current?.showModal()
    else ref.current?.close()
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="rounded-xl shadow-xl p-0 w-full max-w-lg backdrop:bg-black/40 open:flex open:flex-col"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>
      <div className="px-5 py-4 overflow-y-auto">{children}</div>
    </dialog>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/ui/
git commit -m "feat: add shared UI primitives (Button, Input, Badge, Dialog)"
```

---

## Task 15: Dashboard Page

**Files:**
- Create: `app/(dashboard)/page.tsx`
- Create: `components/dashboard/stats-row.tsx`

- [ ] **Step 1: Create components/dashboard/stats-row.tsx**

```tsx
interface StatsRowProps {
  overdueCount: number
  followUpCount: number
  actionCount: number
}

export function StatsRow({ overdueCount, followUpCount, actionCount }: StatsRowProps) {
  return (
    <div className="flex gap-3 flex-wrap">
      {overdueCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-red-700">{overdueCount}</span>
          <span className="text-red-600 ml-1">contacts overdue</span>
        </div>
      )}
      {followUpCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-yellow-700">{followUpCount}</span>
          <span className="text-yellow-600 ml-1">follow-ups pending</span>
        </div>
      )}
      {actionCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-blue-700">{actionCount}</span>
          <span className="text-blue-600 ml-1">open actions</span>
        </div>
      )}
      {overdueCount === 0 && followUpCount === 0 && actionCount === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">
          All caught up
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create app/(dashboard)/page.tsx**

```tsx
import { getBriefing } from "@/lib/services/briefing"
import { StatsRow } from "@/components/dashboard/stats-row"
import Link from "next/link"

export default async function DashboardPage() {
  const briefing = await getBriefing()

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Good morning</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <StatsRow
        overdueCount={briefing.overdueContacts.length}
        followUpCount={briefing.pendingFollowUps.length}
        actionCount={briefing.openActionItems.length}
      />

      {briefing.overdueContacts.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Overdue contacts</h2>
          <div className="space-y-2">
            {briefing.overdueContacts.map((c) => (
              <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-400">
                <span className="text-sm font-medium">{c.name}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.healthScore < 30 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {c.healthScore}%
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {briefing.pendingFollowUps.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Pending follow-ups</h2>
          <div className="space-y-2">
            {briefing.pendingFollowUps.map((i) => (
              <Link key={i.id} href={`/contacts/${i.contactId}`} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-400">
                <div>
                  <p className="text-sm font-medium">{(i as any).contact?.name ?? "Unknown"}</p>
                  <p className="text-xs text-gray-500 truncate max-w-xs">{i.summary}</p>
                </div>
                {i.followUpDate && (
                  <span className="text-xs text-gray-500">{new Date(i.followUpDate).toLocaleDateString("en-GB")}</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/page.tsx components/dashboard/
git commit -m "feat: add dashboard page with briefing summary"
```

---

## Task 16: Contacts List and Health Score Badge

**Files:**
- Create: `components/contacts/health-score-badge.tsx`
- Create: `components/contacts/contact-card.tsx`
- Create: `app/(dashboard)/contacts/page.tsx`

- [ ] **Step 1: Create components/contacts/health-score-badge.tsx**

```tsx
interface HealthScoreBadgeProps { score: number }

export function HealthScoreBadge({ score }: HealthScoreBadgeProps) {
  const colour =
    score >= 80 ? "bg-green-100 text-green-800" :
    score >= 50 ? "bg-yellow-100 text-yellow-800" :
    "bg-red-100 text-red-800"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colour}`}>
      {score}%
    </span>
  )
}
```

- [ ] **Step 2: Create components/contacts/contact-card.tsx**

```tsx
import Link from "next/link"
import { HealthScoreBadge } from "./health-score-badge"
import { Badge } from "@/components/ui/badge"

interface ContactCardProps {
  id: string
  name: string
  type: string
  healthScore: number
  lastInteraction: Date | null
  tags: string[]
}

export function ContactCard({ id, name, type, healthScore, lastInteraction, tags }: ContactCardProps) {
  const daysSince = lastInteraction
    ? Math.floor((Date.now() - new Date(lastInteraction).getTime()) / 86400000)
    : null

  return (
    <Link href={`/contacts/${id}`} className="block bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-blue-400 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {daysSince === null ? "No interactions yet" : daysSince === 0 ? "Today" : `${daysSince}d ago`}
          </p>
          {tags.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-1.5">
              {tags.slice(0, 3).map(t => <Badge key={t}>{t}</Badge>)}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <HealthScoreBadge score={healthScore} />
          <span className="text-xs text-gray-400 capitalize">{type}</span>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 3: Create app/(dashboard)/contacts/page.tsx**

```tsx
import { listContacts } from "@/lib/services/contacts"
import { ContactCard } from "@/components/contacts/contact-card"
import Link from "next/link"

interface PageProps { searchParams: { q?: string; type?: string; overdue?: string } }

export default async function ContactsPage({ searchParams }: PageProps) {
  const contacts = await listContacts({
    q: searchParams.q,
    type: searchParams.type,
    overdue: searchParams.overdue === "true",
  })

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Contacts</h1>
        <Link href="/contacts/new" className="bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700">
          + Add contact
        </Link>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={searchParams.q}
          placeholder="Search contacts..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" className="bg-gray-100 border border-gray-300 text-sm px-3 py-2 rounded-lg hover:bg-gray-200">Search</button>
      </form>

      {contacts.length === 0 ? (
        <p className="text-sm text-gray-500">No contacts found.</p>
      ) : (
        <div className="space-y-2">
          {contacts.map(c => (
            <ContactCard
              key={c.id}
              id={c.id}
              name={c.name}
              type={c.type}
              healthScore={c.healthScore}
              lastInteraction={c.lastInteraction}
              tags={c.tags}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add components/contacts/ app/\(dashboard\)/contacts/page.tsx
git commit -m "feat: add contacts list page with health score badges"
```

---

## Task 17: Log Interaction Modal

**Files:**
- Create: `components/interactions/interaction-form.tsx`
- Create: `components/interactions/log-interaction-modal.tsx`
- Create: `components/interactions/interaction-list.tsx`

- [ ] **Step 1: Create components/interactions/interaction-form.tsx**

```tsx
"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CreateInteractionSchema, type CreateInteractionInput } from "@/lib/validations/interaction"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"

interface Contact { id: string; name: string }

interface InteractionFormProps {
  onSuccess: () => void
  defaultContactId?: string
}

export function InteractionForm({ onSuccess, defaultContactId }: InteractionFormProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const { register, handleSubmit, formState: { errors } } = useForm<CreateInteractionInput>({
    resolver: zodResolver(CreateInteractionSchema),
    defaultValues: {
      contactId: defaultContactId ?? "",
      type: "call",
      direction: "outbound",
      summary: "",
      outcome: null,
      followUpRequired: false,
      followUpDate: null,
      callbackExpected: false,
      location: null,
      duration: null,
      occurredAt: new Date().toISOString(),
    },
  })

  useEffect(() => {
    fetch("/api/v1/contacts").then(r => r.json()).then(setContacts)
  }, [])

  async function onSubmit(data: CreateInteractionInput) {
    setSaving(true)
    setError("")
    const res = await fetch("/api/v1/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      onSuccess()
    } else {
      const body = await res.json()
      setError(body.error ?? "Something went wrong")
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Contact</label>
        <select {...register("contactId")} className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Select a contact...</option>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {errors.contactId && <p className="text-red-600 text-xs">{errors.contactId.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Type</label>
          <select {...register("type")} className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="call">Call</option>
            <option value="meeting">Meeting</option>
            <option value="email">Email</option>
            <option value="message">Message</option>
            <option value="event">Event</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Direction</label>
          <select {...register("direction")} className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Summary *</label>
        <textarea {...register("summary")} rows={3} placeholder="What was discussed?" className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {errors.summary && <p className="text-red-600 text-xs">{errors.summary.message}</p>}
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Location</label>
        <input {...register("location")} placeholder="e.g. walking football, work meeting" className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" {...register("followUpRequired")} id="followUpRequired" className="rounded border-gray-300" />
        <label htmlFor="followUpRequired" className="text-sm text-gray-700">Follow-up required</label>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Log interaction"}</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Create components/interactions/log-interaction-modal.tsx**

```tsx
import { Dialog } from "@/components/ui/dialog"
import { InteractionForm } from "./interaction-form"
import { useRouter } from "next/navigation"

interface LogInteractionModalProps {
  open: boolean
  onClose: () => void
  defaultContactId?: string
}

export function LogInteractionModal({ open, onClose, defaultContactId }: LogInteractionModalProps) {
  const router = useRouter()

  function handleSuccess() {
    onClose()
    router.refresh()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Log interaction">
      <InteractionForm onSuccess={handleSuccess} defaultContactId={defaultContactId} />
    </Dialog>
  )
}
```

- [ ] **Step 3: Create components/interactions/interaction-list.tsx**

```tsx
import { Badge } from "@/components/ui/badge"

interface Interaction {
  id: string
  type: string
  direction: string
  summary: string
  outcome: string | null
  followUpRequired: boolean
  followUpCompleted: boolean
  location: string | null
  occurredAt: Date
  createdByHolly: boolean
}

export function InteractionList({ interactions }: { interactions: Interaction[] }) {
  if (interactions.length === 0) {
    return <p className="text-sm text-gray-500">No interactions recorded yet.</p>
  }

  return (
    <div className="space-y-3">
      {interactions.map(i => (
        <div key={i.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="info">{i.type}</Badge>
              <Badge>{i.direction}</Badge>
              {i.createdByHolly && <Badge variant="warning">Holly</Badge>}
              {i.followUpRequired && !i.followUpCompleted && <Badge variant="danger">Follow-up</Badge>}
              {i.location && <span className="text-xs text-gray-500">{i.location}</span>}
            </div>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {new Date(i.occurredAt).toLocaleDateString("en-GB")}
            </span>
          </div>
          <p className="text-sm text-gray-800 mt-2">{i.summary}</p>
          {i.outcome && <p className="text-sm text-gray-600 mt-1 italic">{i.outcome}</p>}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add components/interactions/
git commit -m "feat: add log interaction modal, form, and interaction list"
```

---

## Task 18: Contact Detail and Contact Form

**Files:**
- Create: `app/(dashboard)/contacts/[id]/page.tsx`
- Create: `app/(dashboard)/contacts/new/page.tsx`
- Create: `components/contacts/contact-form.tsx`

- [ ] **Step 1: Create components/contacts/contact-form.tsx**

```tsx
"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CreateContactSchema, type CreateContactInput } from "@/lib/validations/contact"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { useState } from "react"

interface ContactFormProps {
  defaultValues?: Partial<CreateContactInput>
  contactId?: string
}

export function ContactForm({ defaultValues, contactId }: ContactFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const { register, handleSubmit, formState: { errors } } = useForm<CreateContactInput>({
    resolver: zodResolver(CreateContactSchema),
    defaultValues: {
      name: "",
      type: "personal",
      emails: [],
      phones: [],
      interactionFreqDays: null,
      isFamilyMember: false,
      tags: [],
      notes: "",
      preferences: {},
      ...defaultValues,
    },
  })

  async function onSubmit(data: CreateContactInput) {
    setSaving(true)
    setError("")
    const url = contactId ? `/api/v1/contacts/${contactId}` : "/api/v1/contacts"
    const method = contactId ? "PUT" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const contact = await res.json()
      router.push(`/contacts/${contact.id}`)
      router.refresh()
    } else {
      const body = await res.json()
      setError(body.error ?? "Something went wrong")
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-lg">
      <Input label="Name *" error={errors.name?.message} {...register("name")} />

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Relationship type</label>
        <select {...register("type")} className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="personal">Personal</option>
          <option value="work">Work</option>
          <option value="family">Family</option>
          <option value="volunteer">Volunteer</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Contact frequency (days)</label>
        <input type="number" {...register("interactionFreqDays", { setValueAs: v => v === "" ? null : Number(v) })} placeholder="e.g. 30 — leave blank for no alert" className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <p className="text-xs text-gray-400">Set how often to prompt a catch-up. Leave blank to disable alerts.</p>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" {...register("isFamilyMember")} id="family" className="rounded border-gray-300" />
        <label htmlFor="family" className="text-sm text-gray-700">Family member</label>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea {...register("notes")} rows={4} placeholder="Personal context, preferences, notes..." className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : contactId ? "Save changes" : "Create contact"}</Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Create app/(dashboard)/contacts/new/page.tsx**

```tsx
import { ContactForm } from "@/components/contacts/contact-form"

export default function NewContactPage() {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Add contact</h1>
      <ContactForm />
    </div>
  )
}
```

- [ ] **Step 3: Create app/(dashboard)/contacts/[id]/page.tsx**

```tsx
import { getContact } from "@/lib/services/contacts"
import { InteractionList } from "@/components/interactions/interaction-list"
import { HealthScoreBadge } from "@/components/contacts/health-score-badge"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { notFound } from "next/navigation"

export default async function ContactDetailPage({ params }: { params: { id: string } }) {
  const contact = await getContact(params.id)
  if (!contact) notFound()

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{contact.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge>{contact.type}</Badge>
            <HealthScoreBadge score={contact.healthScore} />
            {contact.isFamilyMember && <Badge variant="info">Family</Badge>}
          </div>
        </div>
        <Link href={`/contacts/${contact.id}/edit`} className="text-sm text-blue-600 hover:text-blue-700">Edit</Link>
      </div>

      {contact.notes && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{contact.notes}</p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Interactions</h2>
        </div>
        <InteractionList interactions={contact.interactions as any} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create app/(dashboard)/contacts/[id]/edit/page.tsx**

```tsx
import { getContact } from "@/lib/services/contacts"
import { ContactForm } from "@/components/contacts/contact-form"
import { notFound } from "next/navigation"

export default async function EditContactPage({ params }: { params: { id: string } }) {
  const contact = await getContact(params.id)
  if (!contact) notFound()

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Edit contact</h1>
      <ContactForm
        contactId={contact.id}
        defaultValues={{ name: contact.name, type: contact.type as any, notes: contact.notes, interactionFreqDays: contact.interactionFreqDays, isFamilyMember: contact.isFamilyMember, tags: contact.tags }}
      />
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/contacts/ components/contacts/contact-form.tsx
git commit -m "feat: add contact detail, create, and edit pages"
```

---

## Task 19: Settings Page

**Files:**
- Create: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create app/(dashboard)/settings/page.tsx**

```tsx
"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface ApiKey { id: string; name: string; lastUsed: string | null; createdAt: string }

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyPlaintext, setNewKeyPlaintext] = useState("")
  const [loading, setLoading] = useState(false)

  async function loadKeys() {
    const res = await fetch("/api/v1/settings/api-keys")
    if (res.ok) setKeys(await res.json())
  }

  useEffect(() => { loadKeys() }, [])

  async function generateKey() {
    if (!newKeyName.trim()) return
    setLoading(true)
    const res = await fetch("/api/v1/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName }),
    })
    const data = await res.json()
    setNewKeyPlaintext(data.key)
    setNewKeyName("")
    await loadKeys()
    setLoading(false)
  }

  async function deleteKey(id: string) {
    await fetch(`/api/v1/settings/api-keys/${id}`, { method: "DELETE" })
    await loadKeys()
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">Settings</h1>

      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Holly API Keys</h2>
        <p className="text-sm text-gray-500 mb-4">API keys allow Holly (Openclaw) to access your data. Keys are shown once only.</p>

        {newKeyPlaintext && (
          <div className="bg-green-50 border border-green-300 rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-green-800 mb-1">New API key (copy now — not shown again):</p>
            <code className="text-sm font-mono text-green-900 break-all">{newKeyPlaintext}</code>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <Input placeholder="Key name (e.g. Holly production)" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} />
          <Button onClick={generateKey} disabled={loading || !newKeyName.trim()}>Generate</Button>
        </div>

        {keys.length === 0 ? (
          <p className="text-sm text-gray-500">No API keys yet.</p>
        ) : (
          <div className="space-y-2">
            {keys.map(k => (
              <div key={k.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="text-xs text-gray-400">
                    Last used: {k.lastUsed ? new Date(k.lastUsed).toLocaleDateString("en-GB") : "Never"}
                  </p>
                </div>
                <Button variant="danger" size="sm" onClick={() => deleteKey(k.id)}>Revoke</Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Create API routes for API key management**

`app/api/v1/settings/api-keys/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listApiKeys, generateApiKey } from "@/lib/services/api-keys"
import { z } from "zod"

const CreateKeySchema = z.object({ name: z.string().min(1) })

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const keys = await listApiKeys()
  return NextResponse.json(keys)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateKeySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR" }, { status: 422 })
  const key = await generateApiKey(parsed.data.name)
  return NextResponse.json({ key }, { status: 201 })
}
```

`app/api/v1/settings/api-keys/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { deleteApiKey } from "@/lib/services/api-keys"

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  await deleteApiKey(params.id)
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/settings/ app/api/v1/settings/
git commit -m "feat: add settings page with API key management"
```

---

## Task 20: Placeholder Pages for Deferred Routes

**Files:**
- Create: `app/(dashboard)/projects/page.tsx`
- Create: `app/(dashboard)/tasks/page.tsx`

- [ ] **Step 1: Create placeholder pages**

`app/(dashboard)/projects/page.tsx`:
```tsx
export default function ProjectsPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900">Projects</h1>
      <p className="text-sm text-gray-500 mt-2">Coming in a future update.</p>
    </div>
  )
}
```

`app/(dashboard)/tasks/page.tsx`:
```tsx
export default function TasksPage() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
      <p className="text-sm text-gray-500 mt-2">Coming in a future update.</p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(dashboard\)/projects/ app/\(dashboard\)/tasks/
git commit -m "feat: add placeholder pages for Phase 2 routes"
```

---

## Task 21: PWA Configuration

**Files:**
- Modify: `next.config.ts`
- Create: `public/manifest.json`

- [ ] **Step 1: Create public/manifest.json**

```json
{
  "name": "Holly PRM",
  "short_name": "Holly",
  "description": "Personal relationship and project manager",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#111827",
  "theme_color": "#111827",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: Generate PWA icons**

Create a simple 512x512 PNG icon for the app (dark background, white "H" letter) and save to `public/icons/`. Also produce a 192x192 version. Any image editor works — or use an online PWA icon generator.

Place them at:
- `public/icons/icon-192.png`
- `public/icons/icon-512.png`

- [ ] **Step 3: Update next.config.ts with PWA**

```ts
import withPWA from "@ducanh2912/next-pwa"

const nextConfig = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
})({
  // Any other Next.js config here
})

export default nextConfig
```

- [ ] **Step 4: Add manifest link to root layout**

In `app/layout.tsx`, ensure the `<head>` includes:
```tsx
import type { Metadata } from "next"

export const metadata: Metadata = {
  manifest: "/manifest.json",
  themeColor: "#111827",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
}
```

- [ ] **Step 5: Verify PWA builds**

```bash
npm run build
```

Expected: Build completes, `public/sw.js` and `public/workbox-*.js` generated.

- [ ] **Step 6: Commit**

```bash
git add public/manifest.json public/icons/ next.config.ts app/layout.tsx
git commit -m "feat: add PWA manifest and service worker configuration"
```

---

## Task 22: Dockerfile and Coolify Deployment

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docker-compose.yml`
- Update: `.gitignore`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

- [ ] **Step 2: Add output: standalone to next.config.ts**

In `next.config.ts`, add `output: "standalone"` to the Next.js config object:

```ts
const nextConfig = withPWA({ ... })({
  output: "standalone",
})
```

- [ ] **Step 3: Create .dockerignore**

```
.git
.next
node_modules
*.log
.env*
.DS_Store
```

- [ ] **Step 4: Create docker-compose.yml for local development**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: holly_prm
      POSTGRES_USER: holly
      POSTGRES_PASSWORD: holly_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

- [ ] **Step 5: Update .gitignore**

Ensure these lines are present in `.gitignore`:
```
.env
.env.local
.superpowers/
public/sw.js
public/workbox-*.js
```

- [ ] **Step 6: Test Docker build locally**

```bash
docker build -t holly-prm .
```

Expected: Build completes without errors.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml .gitignore next.config.ts
git commit -m "feat: add Dockerfile and docker-compose for Coolify deployment"
```

---

## Task 23: Run Full Test Suite and Verify

- [ ] **Step 1: Start local services**

```bash
docker compose up -d
```

- [ ] **Step 2: Copy and fill .env**

```bash
cp .env.example .env
# Edit .env with local values:
# DATABASE_URL=postgresql://holly:holly_dev@localhost:5432/holly_prm
# REDIS_URL=redis://localhost:6379
# NEXTAUTH_SECRET=any-random-string-for-dev
# ADMIN_EMAIL=ian@local.dev
# ADMIN_PASSWORD_HASH=<run: node -e "console.log(require('bcryptjs').hashSync('test123',12))">
```

- [ ] **Step 3: Run migrations**

```bash
npx prisma migrate dev
```

Expected: All migrations applied.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: All tests pass. If any fail, fix before continuing.

- [ ] **Step 5: Start dev server and smoke test**

```bash
npm run dev
```

Open http://localhost:3000. Verify:
- Redirected to /login
- Can sign in with credentials
- Dashboard loads
- Can create a contact
- Can log an interaction against the contact
- Health score updates on the contact
- Contact appears in contacts list

- [ ] **Step 6: Smoke test Holly API**

```bash
# First create an API key via Settings page, then:
curl -H "X-Holly-API-Key: hky_<your_key>" http://localhost:3000/api/holly/v1/briefing
```

Expected: JSON response with `overdueContacts`, `pendingFollowUps`, `openActionItems`, `generatedAt`.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: verify full test suite and smoke test pass"
```

---

## Coolify Deployment

After Phase 1 is complete and smoke-tested locally:

1. Push the repository to GitHub/GitLab
2. In Coolify: create a new service from the repository, select Dockerfile
3. Add all environment variables from `.env.example` with production values
4. Create a PostgreSQL service and a Redis service in Coolify; copy their internal connection strings to `DATABASE_URL` and `REDIS_URL`
5. Before first deploy, run `npx prisma migrate deploy` via Coolify's one-off command runner
6. Deploy — Coolify builds the Docker image and starts the container
7. Point the vaelerian.uk domain at the Coolify service; SSL is provisioned automatically

---

## Self-Review Checklist

- [x] Auth.js session protection covers all dashboard and v1 API routes
- [x] Holly API key validation covers all holly/v1 routes
- [x] Health score recomputed on every interaction create
- [x] Audit log written on every Contact, Interaction, ActionItem create/update/delete
- [x] All 7 Prisma models in schema
- [x] Zod validation on all API inputs
- [x] Error responses are consistent `{ error, code }` JSON shape
- [x] Projects/Tasks placeholder pages keep nav structure stable for Phase 2
- [x] PWA manifest, service worker, standalone Docker output all configured
- [x] Settings page allows Holly API key generation and revocation
- [x] `HollyApiKey` model and `api-keys` service match throughout
