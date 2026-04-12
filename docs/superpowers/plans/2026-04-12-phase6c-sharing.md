# Phase 6c: Contact and Interaction Sharing - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three sharing mechanisms for contacts and interactions: full contact book access grants (admin-managed), per-contact shares (owner-managed), and project-linked contacts/interactions.

**Architecture:** Access is checked via a four-path `OR` clause on every contact query: owner, full-book grant, per-contact share, or project membership. Contributors (non-owners with access) can view and add interactions but cannot edit/delete the contact or existing interactions. A new `lib/services/sharing.ts` handles grant/share CRUD; `lib/services/contacts.ts` gains a `contactAccessWhere` helper used by all read queries.

**Tech Stack:** Next.js App Router, Prisma 7, NextAuth v5 JWT sessions, TypeScript, Jest

---

## File Map

**Create:**
- `prisma/migrations/20260412000000_phase6c_sharing/migration.sql`
- `lib/services/sharing.ts`
- `app/api/admin/access-grants/route.ts`
- `app/api/admin/access-grants/[id]/route.ts`
- `app/api/v1/contacts/[id]/shares/route.ts`
- `app/api/v1/contacts/[id]/shares/[sharedUserId]/route.ts`
- `components/contacts/sharing-section.tsx`
- `__tests__/services/sharing.test.ts`
- `__tests__/api/admin/access-grants.test.ts`
- `__tests__/api/v1/contact-shares.test.ts`

**Modify:**
- `prisma/schema.prisma` - add UserAccessGrant, ContactShare, projectId/createdByUserId fields
- `lib/services/contacts.ts` - add contactAccessWhere + isContactOwner, update all queries
- `lib/services/interactions.ts` - contributor-aware createInteraction, gate update/delete
- `app/api/v1/contacts/route.ts` - use contactAccessWhere
- `app/api/v1/contacts/[id]/route.ts` - access on GET, owner-only on PUT/DELETE
- `app/api/v1/interactions/route.ts` - contributor-aware GET/POST
- `app/api/v1/interactions/[id]/route.ts` - owner-only PUT/DELETE with 403
- `app/(dashboard)/contacts/page.tsx` - pass session userId, show shared label
- `app/(dashboard)/contacts/[id]/page.tsx` - contributor view, sharing section
- `components/contacts/contact-card.tsx` - accept isShared + ownerName props
- `components/admin/admin-panel.tsx` - add access grants section
- `__tests__/services/contacts.test.ts` - update for new access model
- `__tests__/services/interactions.test.ts` - update for contributor createInteraction

---

## Task 1: Schema and Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260412000000_phase6c_sharing/migration.sql`

- [ ] **Step 1: Update schema.prisma**

Add two new models and modify existing ones. Full changes:

```prisma
// In User model, add after passwordResetTokens line:
  grantedAccess       UserAccessGrant[]   @relation("Grantor")
  receivedAccess      UserAccessGrant[]   @relation("Grantee")
  createdInteractions Interaction[]       @relation("InteractionCreatedBy")

// In Contact model, add after the userId/user lines:
  projectId  String?
  project    Project?      @relation("ContactProject", fields: [projectId], references: [id], onDelete: SetNull)
  shares     ContactShare[]

// In Interaction model, add after the userId/user lines:
  projectId       String?
  project         Project?  @relation("InteractionProject", fields: [projectId], references: [id], onDelete: SetNull)
  createdByUserId String?
  createdByUser   User?     @relation("InteractionCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)

// In Project model, add after members line:
  linkedContacts      Contact[]      @relation("ContactProject")
  linkedInteractions  Interaction[]  @relation("InteractionProject")

// New models (add at end of file):
model UserAccessGrant {
  id        String   @id @default(uuid())
  grantorId String
  granteeId String
  createdAt DateTime @default(now())

  grantor User @relation("Grantor", fields: [grantorId], references: [id], onDelete: Cascade)
  grantee User @relation("Grantee", fields: [granteeId], references: [id], onDelete: Cascade)

  @@unique([grantorId, granteeId])
}

model ContactShare {
  id        String   @id @default(uuid())
  contactId String
  userId    String
  createdAt DateTime @default(now())

  contact Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([contactId, userId])
}
```

Also add back-relation on User for ContactShare:
```prisma
  contactShares ContactShare[]
```

- [ ] **Step 2: Create migration SQL**

Create file `prisma/migrations/20260412000000_phase6c_sharing/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "UserAccessGrant" (
    "id" TEXT NOT NULL,
    "grantorId" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactShare" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactShare_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "projectId" TEXT;

-- AlterTable
ALTER TABLE "Interaction"
    ADD COLUMN "projectId" TEXT,
    ADD COLUMN "createdByUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UserAccessGrant_grantorId_granteeId_key" ON "UserAccessGrant"("grantorId", "granteeId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactShare_contactId_userId_key" ON "ContactShare"("contactId", "userId");

-- AddForeignKey
ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_grantorId_fkey"
    FOREIGN KEY ("grantorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_granteeId_fkey"
    FOREIGN KEY ("granteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactShare" ADD CONSTRAINT "ContactShare_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactShare" ADD CONSTRAINT "ContactShare_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Verify schema compiles**

```bash
npx prisma generate
```

Expected: no errors, client regenerated.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260412000000_phase6c_sharing/
git commit -m "feat: add UserAccessGrant, ContactShare schema and migration"
```

---

## Task 2: Sharing Service

**Files:**
- Create: `lib/services/sharing.ts`
- Create: `__tests__/services/sharing.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/services/sharing.test.ts`:

```ts
import {
  listAccessGrants,
  createAccessGrant,
  deleteAccessGrant,
  listContactShares,
  createContactShare,
  deleteContactShare,
} from "@/lib/services/sharing"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    userAccessGrant: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
    contact: { findFirst: jest.fn() },
    contactShare: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("listAccessGrants", () => {
  it("returns all grants with grantor and grantee names", async () => {
    const grants = [{ id: "g1", grantor: { name: "Alice", email: "a@x.com" }, grantee: { name: "Bob", email: "b@x.com" }, createdAt: new Date() }]
    mockPrisma.userAccessGrant.findMany.mockResolvedValue(grants as any)
    const result = await listAccessGrants()
    expect(result).toEqual(grants)
    expect(mockPrisma.userAccessGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { grantor: expect.any(Object), grantee: expect.any(Object) } })
    )
  })
})

describe("createAccessGrant", () => {
  it("creates grant when both users exist", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: "u1", name: "Alice" } as any)
      .mockResolvedValueOnce({ id: "u2", name: "Bob" } as any)
    mockPrisma.userAccessGrant.create.mockResolvedValue({ id: "g1", grantorId: "u1", granteeId: "u2" } as any)

    const result = await createAccessGrant("alice@x.com", "bob@x.com")

    expect(result).toEqual({ id: "g1", grantorId: "u1", granteeId: "u2" })
    expect(mockPrisma.userAccessGrant.create).toHaveBeenCalledWith({
      data: { grantorId: "u1", granteeId: "u2" },
    })
  })

  it("returns null when grantor email not found", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null)
    const result = await createAccessGrant("nope@x.com", "bob@x.com")
    expect(result).toBeNull()
    expect(mockPrisma.userAccessGrant.create).not.toHaveBeenCalled()
  })

  it("returns null when grantee email not found", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: "u1" } as any)
      .mockResolvedValueOnce(null)
    const result = await createAccessGrant("alice@x.com", "nope@x.com")
    expect(result).toBeNull()
  })
})

describe("deleteAccessGrant", () => {
  it("deletes grant and returns true", async () => {
    mockPrisma.userAccessGrant.findUnique.mockResolvedValue({ id: "g1" } as any)
    mockPrisma.userAccessGrant.delete.mockResolvedValue({ id: "g1" } as any)
    const result = await deleteAccessGrant("g1")
    expect(result).toBe(true)
  })

  it("returns false when grant not found", async () => {
    mockPrisma.userAccessGrant.findUnique.mockResolvedValue(null)
    const result = await deleteAccessGrant("nope")
    expect(result).toBe(false)
    expect(mockPrisma.userAccessGrant.delete).not.toHaveBeenCalled()
  })
})

describe("listContactShares", () => {
  it("returns shares for a contact owned by the caller", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c1" } as any)
    const shares = [{ id: "s1", user: { name: "Bob", email: "b@x.com" }, createdAt: new Date() }]
    mockPrisma.contactShare.findMany.mockResolvedValue(shares as any)
    const result = await listContactShares("c1", "owner-id")
    expect(result).toEqual(shares)
  })

  it("returns null when contact is not owned by caller", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)
    const result = await listContactShares("c1", "wrong-user")
    expect(result).toBeNull()
  })
})

describe("createContactShare", () => {
  it("creates share when contact is owned and target user exists", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c1", userId: "owner-id" } as any)
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u2" } as any)
    mockPrisma.contactShare.create.mockResolvedValue({ id: "s1", contactId: "c1", userId: "u2" } as any)

    const result = await createContactShare("c1", "bob@x.com", "owner-id")
    expect(result).toEqual({ id: "s1", contactId: "c1", userId: "u2" })
  })

  it("returns null when contact not owned by caller", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)
    const result = await createContactShare("c1", "bob@x.com", "wrong-user")
    expect(result).toBeNull()
  })

  it("returns 'user_not_found' when email doesn't match a user", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c1" } as any)
    mockPrisma.user.findUnique.mockResolvedValue(null)
    const result = await createContactShare("c1", "nope@x.com", "owner-id")
    expect(result).toBe("user_not_found")
  })
})

describe("deleteContactShare", () => {
  it("deletes share and returns true", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c1" } as any)
    mockPrisma.contactShare.findUnique.mockResolvedValue({ id: "s1" } as any)
    mockPrisma.contactShare.delete.mockResolvedValue({ id: "s1" } as any)
    const result = await deleteContactShare("c1", "u2", "owner-id")
    expect(result).toBe(true)
  })

  it("returns false when contact not owned by caller", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)
    const result = await deleteContactShare("c1", "u2", "wrong-user")
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/services/sharing.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module '@/lib/services/sharing'"

- [ ] **Step 3: Implement sharing service**

Create `lib/services/sharing.ts`:

```ts
import { prisma } from "@/lib/db"

export async function listAccessGrants() {
  return prisma.userAccessGrant.findMany({
    include: {
      grantor: { select: { name: true, email: true } },
      grantee: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function createAccessGrant(grantorEmail: string, granteeEmail: string) {
  const grantor = await prisma.user.findUnique({ where: { email: grantorEmail } })
  if (!grantor) return null
  const grantee = await prisma.user.findUnique({ where: { email: granteeEmail } })
  if (!grantee) return null
  return prisma.userAccessGrant.create({ data: { grantorId: grantor.id, granteeId: grantee.id } })
}

export async function deleteAccessGrant(id: string): Promise<boolean> {
  const existing = await prisma.userAccessGrant.findUnique({ where: { id } })
  if (!existing) return false
  await prisma.userAccessGrant.delete({ where: { id } })
  return true
}

export async function listContactShares(contactId: string, ownerId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId: ownerId } })
  if (!contact) return null
  return prisma.contactShare.findMany({
    where: { contactId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  })
}

export async function createContactShare(
  contactId: string,
  email: string,
  ownerId: string
): Promise<{ id: string; contactId: string; userId: string } | null | "user_not_found"> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId: ownerId } })
  if (!contact) return null
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return "user_not_found"
  return prisma.contactShare.create({ data: { contactId, userId: user.id } })
}

export async function deleteContactShare(
  contactId: string,
  sharedUserId: string,
  ownerId: string
): Promise<boolean> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, userId: ownerId } })
  if (!contact) return false
  const share = await prisma.contactShare.findUnique({ where: { contactId_userId: { contactId, userId: sharedUserId } } })
  if (!share) return false
  await prisma.contactShare.delete({ where: { contactId_userId: { contactId, userId: sharedUserId } } })
  return true
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/services/sharing.test.ts --no-coverage
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/services/sharing.ts __tests__/services/sharing.test.ts
git commit -m "feat: add sharing service for UserAccessGrant and ContactShare"
```

---

## Task 3: Contacts Service - Access Control

**Files:**
- Modify: `lib/services/contacts.ts`
- Modify: `__tests__/services/contacts.test.ts`

- [ ] **Step 1: Update contacts service**

Replace the entire contents of `lib/services/contacts.ts`:

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

export function contactAccessWhere(userId: string) {
  return {
    OR: [
      { userId },
      { user: { grantedAccess: { some: { granteeId: userId } } } },
      { shares: { some: { userId } } },
      { project: { OR: [{ userId }, { members: { some: { userId } } }] } },
    ],
  }
}

export function isContactOwner(contactUserId: string | null, userId: string): boolean {
  return contactUserId === userId
}

export async function listContacts(opts: ListContactsOptions) {
  const accessClause = contactAccessWhere(opts.userId)
  const filters: object[] = [accessClause]
  if (opts.q) filters.push({ name: { contains: opts.q, mode: "insensitive" } })
  if (opts.type) filters.push({ type: opts.type })
  if (opts.overdue) {
    filters.push({ interactionFreqDays: { not: null } })
    filters.push({ OR: [{ healthScore: { lt: 100 } }, { lastInteraction: null }] })
  }
  return prisma.contact.findMany({
    where: filters.length === 1 ? accessClause : { AND: filters },
    orderBy: { name: "asc" },
    include: { user: { select: { id: true, name: true } } },
  })
}

export async function getContact(id: string, userId: string) {
  return prisma.contact.findFirst({
    where: { id, ...contactAccessWhere(userId) },
    include: {
      user: { select: { id: true, name: true } },
      interactions: {
        orderBy: { occurredAt: "desc" },
        take: 20,
        include: {
          actionItems: { orderBy: { createdAt: "asc" } },
          createdByUser: { select: { name: true } },
        },
      },
    },
  })
}

export async function createContact(data: CreateContactInput, actor: Actor, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contact = await prisma.contact.create({ data: { ...(data as any), userId } })
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: contact.id, action: "create", actor, userId },
  })
  return contact
}

export async function updateContact(id: string, data: UpdateContactInput, actor: Actor, userId: string) {
  const existing = await prisma.contact.findFirst({ where: { id, userId } })
  if (!existing) return null
  const before = existing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contact = await prisma.contact.update({ where: { id, userId }, data: data as any })
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: id, action: "update", actor, userId, diff: { before, after: contact } },
  })
  return contact
}

export async function deleteContact(id: string, actor: Actor, userId: string) {
  const existing = await prisma.contact.findFirst({ where: { id, userId } })
  if (!existing) return null
  await prisma.auditLog.create({
    data: { entity: "Contact", entityId: id, action: "delete", actor, userId },
  })
  return prisma.contact.delete({ where: { id, userId } })
}
```

- [ ] **Step 2: Update contacts service tests**

Replace `__tests__/services/contacts.test.ts` with:

```ts
import { listContacts, getContact, createContact, updateContact, deleteContact, contactAccessWhere, isContactOwner } from "@/lib/services/contacts"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    contact: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("contactAccessWhere", () => {
  it("returns OR clause covering all four access paths", () => {
    const result = contactAccessWhere("user-1")
    expect(result.OR).toHaveLength(4)
    expect(result.OR[0]).toEqual({ userId: "user-1" })
  })
})

describe("isContactOwner", () => {
  it("returns true when userId matches contact owner", () => {
    expect(isContactOwner("user-1", "user-1")).toBe(true)
  })
  it("returns false when userId does not match", () => {
    expect(isContactOwner("user-2", "user-1")).toBe(false)
  })
  it("returns false when owner is null", () => {
    expect(isContactOwner(null, "user-1")).toBe(false)
  })
})

describe("listContacts", () => {
  it("returns contacts using access OR clause", async () => {
    const contacts = [{ id: "1", name: "Alice", user: { id: "user-1", name: "Ian" } }]
    mockPrisma.contact.findMany.mockResolvedValue(contacts as any)
    const result = await listContacts({ userId: "user-1" })
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: "asc" } })
    )
    expect(result).toEqual(contacts)
  })

  it("filters by search query on name", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([])
    await listContacts({ q: "alice", userId: "user-1" })
    const call = (mockPrisma.contact.findMany as jest.Mock).mock.calls[0][0]
    expect(JSON.stringify(call.where)).toContain("alice")
  })

  it("filters overdue contacts when overdue=true", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([])
    await listContacts({ overdue: true, userId: "user-1" })
    const call = (mockPrisma.contact.findMany as jest.Mock).mock.calls[0][0]
    expect(JSON.stringify(call.where)).toContain("interactionFreqDays")
  })
})

describe("createContact", () => {
  it("creates contact and writes audit log", async () => {
    const input = { name: "Alice", type: "personal" as const, emails: [], phones: [], interactionFreqDays: null, isFamilyMember: false, tags: [], notes: "", preferences: {} }
    const created = { id: "abc", ...input }
    mockPrisma.contact.create.mockResolvedValue(created as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
    const result = await createContact(input, "ian", "user-1")
    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "user-1" }) })
    )
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entity: "Contact", entityId: "abc", action: "create", actor: "ian" }),
    })
    expect(result).toEqual(created)
  })
})

describe("ownership checks", () => {
  it("updateContact returns null when contact belongs to different user", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)
    const result = await updateContact("c1", { name: "New" } as any, "ian", "user-2")
    expect(result).toBeNull()
    expect(mockPrisma.contact.update).not.toHaveBeenCalled()
  })

  it("deleteContact returns null when contact belongs to different user", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)
    const result = await deleteContact("c1", "ian", "user-2")
    expect(result).toBeNull()
    expect(mockPrisma.contact.delete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npx jest __tests__/services/contacts.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/services/contacts.ts __tests__/services/contacts.test.ts
git commit -m "feat: add contactAccessWhere and isContactOwner to contacts service"
```

---

## Task 4: Interactions Service - Contributor Support

**Files:**
- Modify: `lib/services/interactions.ts`
- Modify: `__tests__/services/interactions.test.ts`

- [ ] **Step 1: Update interactions service**

The key changes:
1. `listInteractions` uses `contactAccessWhere` when filtering by `contactId`
2. `createInteraction` accepts optional `contactOwnerId` - if set and different from `userId`, sets `createdByUserId`
3. `getInteraction` gets a new variant that finds by id without userId for ownership checks in routes

Replace `lib/services/interactions.ts`:

```ts
import { prisma } from "@/lib/db"
import { Actor } from "@/app/generated/prisma/client"
import { computeHealthScore } from "@/lib/health-score"
import { publishSseEvent } from "@/lib/sse-events"
import { upsertCalendarEvent, deleteCalendarEvent } from "@/lib/services/calendar-sync"
import { contactAccessWhere } from "@/lib/services/contacts"
import type { CreateInteractionInput, UpdateInteractionInput } from "@/lib/validations/interaction"

interface ListInteractionsOptions {
  contactId?: string
  followUpRequired?: boolean
  limit?: number
  userId: string
}

export async function listInteractions(opts: ListInteractionsOptions) {
  const where: Record<string, unknown> = {}
  if (opts.contactId) {
    // Allow owners and contributors to list interactions for a contact
    where.contactId = opts.contactId
    where.contact = contactAccessWhere(opts.userId)
  } else {
    where.userId = opts.userId
  }
  if (opts.followUpRequired) {
    where.followUpRequired = true
    where.followUpCompleted = false
  }
  return prisma.interaction.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take: opts.limit ?? 50,
    include: {
      contact: { select: { id: true, name: true } },
      createdByUser: { select: { name: true } },
    },
  })
}

export async function getInteraction(id: string, userId: string) {
  return prisma.interaction.findFirst({ where: { id, userId }, include: { actionItems: true } })
}

export async function getInteractionById(id: string) {
  return prisma.interaction.findUnique({ where: { id } })
}

export async function createInteraction(
  data: CreateInteractionInput,
  actor: Actor,
  userId: string,
  contactOwnerId?: string
) {
  const ownerId = contactOwnerId ?? userId
  const createdByUserId = ownerId !== userId ? userId : undefined

  const interaction = await prisma.interaction.create({
    data: {
      ...data,
      userId: ownerId,
      createdByUserId: createdByUserId ?? null,
      occurredAt: new Date(data.occurredAt),
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
      createdByHolly: actor === "holly",
    },
    include: { contact: { select: { id: true, name: true } } },
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
    data: { entity: "Interaction", entityId: interaction.id, action: "create", actor, userId: ownerId },
  })

  await publishSseEvent("interaction.created", {
    contactId: data.contactId,
    contactName: interaction.contact?.name ?? "",
    type: data.type,
    summary: data.summary,
    createdByHolly: actor === "holly",
  })

  return interaction
}

export async function updateInteraction(id: string, data: UpdateInteractionInput, actor: Actor, userId: string) {
  const existing = await prisma.interaction.findFirst({ where: { id, userId } })
  if (!existing) return null
  const interaction = await prisma.interaction.update({ where: { id, userId }, data })
  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: id, action: "update", actor, userId },
  })
  if (interaction.followUpDate) {
    const contact = await prisma.contact.findUnique({ where: { id: interaction.contactId }, select: { name: true } })
    void upsertCalendarEvent("follow_up", id, {
      title: `Follow-up: ${contact?.name ?? "Contact"}`,
      date: interaction.followUpDate,
    }, userId)
  } else if (data.followUpDate === null) {
    void deleteCalendarEvent("follow_up", id, userId)
  }
  return interaction
}

export async function deleteInteraction(id: string, actor: Actor, userId: string) {
  const existing = await prisma.interaction.findFirst({ where: { id, userId } })
  if (!existing) return null
  await prisma.auditLog.create({
    data: { entity: "Interaction", entityId: id, action: "delete", actor, userId },
  })
  return prisma.interaction.delete({ where: { id, userId } })
}
```

- [ ] **Step 2: Update interactions service tests**

Add new tests to `__tests__/services/interactions.test.ts`. Keep all existing tests, add at the bottom:

```ts
describe("createInteraction with contributor", () => {
  it("sets createdByUserId when contributor logs interaction for another user's contact", async () => {
    const input = {
      contactId: "contact-1",
      type: "call" as const,
      direction: "outbound" as const,
      summary: "Checked in",
      outcome: null,
      followUpRequired: false,
      followUpDate: null,
      callbackExpected: false,
      location: null,
      duration: null,
      transcript: null,
      occurredAt: "2026-04-12T10:00:00Z",
    }
    const created = { id: "int-5", ...input, occurredAt: new Date(input.occurredAt), contact: { id: "contact-1", name: "Alice" }, createdByUserId: "contributor-1" }
    mockPrisma.interaction.create.mockResolvedValue(created as any)
    mockPrisma.contact.findUnique.mockResolvedValue({ interactionFreqDays: null } as any)
    mockPrisma.contact.update.mockResolvedValue({} as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createInteraction(input, "ian", "contributor-1", "owner-1")

    const createCall = (mockPrisma.interaction.create as jest.Mock).mock.calls[0][0]
    expect(createCall.data.userId).toBe("owner-1")
    expect(createCall.data.createdByUserId).toBe("contributor-1")
  })

  it("does not set createdByUserId when owner logs their own interaction", async () => {
    const input = {
      contactId: "contact-1",
      type: "call" as const,
      direction: "outbound" as const,
      summary: "Checked in",
      outcome: null,
      followUpRequired: false,
      followUpDate: null,
      callbackExpected: false,
      location: null,
      duration: null,
      transcript: null,
      occurredAt: "2026-04-12T10:00:00Z",
    }
    const created = { id: "int-6", ...input, occurredAt: new Date(input.occurredAt), contact: { id: "contact-1", name: "Alice" }, createdByUserId: null }
    mockPrisma.interaction.create.mockResolvedValue(created as any)
    mockPrisma.contact.findUnique.mockResolvedValue({ interactionFreqDays: null } as any)
    mockPrisma.contact.update.mockResolvedValue({} as any)
    mockPrisma.auditLog.create.mockResolvedValue({} as any)

    await createInteraction(input, "ian", "owner-1")

    const createCall = (mockPrisma.interaction.create as jest.Mock).mock.calls[0][0]
    expect(createCall.data.userId).toBe("owner-1")
    expect(createCall.data.createdByUserId).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npx jest __tests__/services/interactions.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/services/interactions.ts __tests__/services/interactions.test.ts
git commit -m "feat: add contributor support to interactions service"
```

---

## Task 5: Admin Access Grants API Routes

**Files:**
- Create: `app/api/admin/access-grants/route.ts`
- Create: `app/api/admin/access-grants/[id]/route.ts`
- Create: `__tests__/api/admin/access-grants.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/admin/access-grants.test.ts`:

```ts
import { GET, POST } from "@/app/api/admin/access-grants/route"
import { DELETE } from "@/app/api/admin/access-grants/[id]/route"
import { NextRequest } from "next/server"

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/services/sharing", () => ({
  listAccessGrants: jest.fn(),
  createAccessGrant: jest.fn(),
  deleteAccessGrant: jest.fn(),
}))

import { auth } from "@/lib/auth"
import { listAccessGrants, createAccessGrant, deleteAccessGrant } from "@/lib/services/sharing"

const mockAuth = auth as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/admin/access-grants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
}

it("GET returns 401 for non-admin", async () => {
  mockAuth.mockResolvedValue({ role: "user", userId: "u1" })
  const res = await GET()
  expect(res.status).toBe(401)
})

it("GET returns all grants for admin", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  const grants = [{ id: "g1", grantor: { name: "A", email: "a@x.com" }, grantee: { name: "B", email: "b@x.com" }, createdAt: new Date() }]
  ;(listAccessGrants as jest.Mock).mockResolvedValue(grants)
  const res = await GET()
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data).toHaveLength(1)
})

it("POST returns 401 for non-admin", async () => {
  mockAuth.mockResolvedValue({ role: "user", userId: "u1" })
  const res = await POST(makeRequest({ grantorEmail: "a@x.com", granteeEmail: "b@x.com" }))
  expect(res.status).toBe(401)
})

it("POST creates grant for admin", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  ;(createAccessGrant as jest.Mock).mockResolvedValue({ id: "g1", grantorId: "u1", granteeId: "u2" })
  const res = await POST(makeRequest({ grantorEmail: "a@x.com", granteeEmail: "b@x.com" }))
  expect(res.status).toBe(201)
})

it("POST returns 404 when createAccessGrant returns null", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  ;(createAccessGrant as jest.Mock).mockResolvedValue(null)
  const res = await POST(makeRequest({ grantorEmail: "nope@x.com", granteeEmail: "b@x.com" }))
  expect(res.status).toBe(404)
})

it("DELETE returns 401 for non-admin", async () => {
  mockAuth.mockResolvedValue({ role: "user", userId: "u1" })
  const res = await DELETE(new NextRequest("http://localhost/"), { params: Promise.resolve({ id: "g1" }) })
  expect(res.status).toBe(401)
})

it("DELETE revokes grant for admin", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  ;(deleteAccessGrant as jest.Mock).mockResolvedValue(true)
  const res = await DELETE(new NextRequest("http://localhost/"), { params: Promise.resolve({ id: "g1" }) })
  expect(res.status).toBe(200)
})

it("DELETE returns 404 when grant not found", async () => {
  mockAuth.mockResolvedValue({ role: "admin" })
  ;(deleteAccessGrant as jest.Mock).mockResolvedValue(false)
  const res = await DELETE(new NextRequest("http://localhost/"), { params: Promise.resolve({ id: "nope" }) })
  expect(res.status).toBe(404)
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/api/admin/access-grants.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement routes**

Create `app/api/admin/access-grants/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listAccessGrants, createAccessGrant } from "@/lib/services/sharing"

export async function GET() {
  const session = await auth()
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await listAccessGrants())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { grantorEmail, granteeEmail } = await req.json()
  if (!grantorEmail || !granteeEmail) return NextResponse.json({ error: "grantorEmail and granteeEmail required" }, { status: 422 })
  const grant = await createAccessGrant(grantorEmail, granteeEmail)
  if (!grant) return NextResponse.json({ error: "User not found" }, { status: 404 })
  return NextResponse.json(grant, { status: 201 })
}
```

Create `app/api/admin/access-grants/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { deleteAccessGrant } from "@/lib/services/sharing"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const ok = await deleteAccessGrant(id)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/api/admin/access-grants.test.ts --no-coverage
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/access-grants/ __tests__/api/admin/access-grants.test.ts
git commit -m "feat: add admin access grants API routes"
```

---

## Task 6: Contact Shares API Routes

**Files:**
- Create: `app/api/v1/contacts/[id]/shares/route.ts`
- Create: `app/api/v1/contacts/[id]/shares/[sharedUserId]/route.ts`
- Create: `__tests__/api/v1/contact-shares.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/v1/contact-shares.test.ts`:

```ts
import { GET, POST } from "@/app/api/v1/contacts/[id]/shares/route"
import { DELETE } from "@/app/api/v1/contacts/[id]/shares/[sharedUserId]/route"
import { NextRequest } from "next/server"

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/services/sharing", () => ({
  listContactShares: jest.fn(),
  createContactShare: jest.fn(),
  deleteContactShare: jest.fn(),
}))

import { auth } from "@/lib/auth"
import { listContactShares, createContactShare, deleteContactShare } from "@/lib/services/sharing"

const mockAuth = auth as jest.Mock

beforeEach(() => jest.clearAllMocks())

const contactParams = { params: Promise.resolve({ id: "c1" }) }
const shareParams = { params: Promise.resolve({ id: "c1", sharedUserId: "u2" }) }

it("GET returns 401 when unauthenticated", async () => {
  mockAuth.mockResolvedValue(null)
  const res = await GET(new NextRequest("http://localhost/"), contactParams)
  expect(res.status).toBe(401)
})

it("GET returns shares for contact owner", async () => {
  mockAuth.mockResolvedValue({ userId: "owner-1" })
  const shares = [{ id: "s1", user: { name: "Bob", email: "b@x.com" }, createdAt: new Date() }]
  ;(listContactShares as jest.Mock).mockResolvedValue(shares)
  const res = await GET(new NextRequest("http://localhost/"), contactParams)
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data).toHaveLength(1)
})

it("GET returns 404 when caller is not the contact owner", async () => {
  mockAuth.mockResolvedValue({ userId: "other-user" })
  ;(listContactShares as jest.Mock).mockResolvedValue(null)
  const res = await GET(new NextRequest("http://localhost/"), contactParams)
  expect(res.status).toBe(404)
})

it("POST shares contact with target user", async () => {
  mockAuth.mockResolvedValue({ userId: "owner-1" })
  ;(createContactShare as jest.Mock).mockResolvedValue({ id: "s1", contactId: "c1", userId: "u2" })
  const req = new NextRequest("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bob@x.com" }) })
  const res = await POST(req, contactParams)
  expect(res.status).toBe(201)
})

it("POST returns 404 when target email not found", async () => {
  mockAuth.mockResolvedValue({ userId: "owner-1" })
  ;(createContactShare as jest.Mock).mockResolvedValue("user_not_found")
  const req = new NextRequest("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "nope@x.com" }) })
  const res = await POST(req, contactParams)
  expect(res.status).toBe(404)
})

it("POST returns 403 when caller is not the contact owner", async () => {
  mockAuth.mockResolvedValue({ userId: "other-user" })
  ;(createContactShare as jest.Mock).mockResolvedValue(null)
  const req = new NextRequest("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "bob@x.com" }) })
  const res = await POST(req, contactParams)
  expect(res.status).toBe(403)
})

it("DELETE removes share", async () => {
  mockAuth.mockResolvedValue({ userId: "owner-1" })
  ;(deleteContactShare as jest.Mock).mockResolvedValue(true)
  const res = await DELETE(new NextRequest("http://localhost/"), shareParams)
  expect(res.status).toBe(200)
})

it("DELETE returns 404 when share not found", async () => {
  mockAuth.mockResolvedValue({ userId: "owner-1" })
  ;(deleteContactShare as jest.Mock).mockResolvedValue(false)
  const res = await DELETE(new NextRequest("http://localhost/"), shareParams)
  expect(res.status).toBe(404)
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx jest __tests__/api/v1/contact-shares.test.ts --no-coverage
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement routes**

Create `app/api/v1/contacts/[id]/shares/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listContactShares, createContactShare } from "@/lib/services/sharing"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const shares = await listContactShares(id, userId)
  if (shares === null) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(shares)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: "email required" }, { status: 422 })
  const result = await createContactShare(id, email, userId)
  if (result === null) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (result === "user_not_found") return NextResponse.json({ error: "User not found" }, { status: 404 })
  return NextResponse.json(result, { status: 201 })
}
```

Create `app/api/v1/contacts/[id]/shares/[sharedUserId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { deleteContactShare } from "@/lib/services/sharing"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sharedUserId: string }> }
) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, sharedUserId } = await params
  const ok = await deleteContactShare(id, sharedUserId, userId)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/api/v1/contact-shares.test.ts --no-coverage
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/contacts/[id]/shares/ __tests__/api/v1/contact-shares.test.ts
git commit -m "feat: add contact shares API routes"
```

---

## Task 7: Updated Contacts API Routes

**Files:**
- Modify: `app/api/v1/contacts/route.ts`
- Modify: `app/api/v1/contacts/[id]/route.ts`

The GET routes now use `contactAccessWhere` (via the service). The PUT and DELETE routes need to return 403 when a contributor tries to modify a contact they don't own.

- [ ] **Step 1: Update contacts/route.ts**

No change needed for GET - `listContacts` already uses `contactAccessWhere` after Task 3.

For POST, no change - creating a contact always sets the creator as owner.

Only update needed: the contacts list page still calls `listContacts` without a session. Fix that now.

Replace `app/(dashboard)/contacts/page.tsx`:

```tsx
import { auth } from "@/lib/auth"
import { listContacts } from "@/lib/services/contacts"
import { ContactCard } from "@/components/contacts/contact-card"
import Link from "next/link"
import { redirect } from "next/navigation"

interface PageProps { searchParams: Promise<{ q?: string; type?: string; overdue?: string }> }

export default async function ContactsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.userId) redirect("/login")
  const userId = session.userId

  const { q, type, overdue } = await searchParams
  let contacts: Awaited<ReturnType<typeof listContacts>> = []
  let dbError = false
  try {
    contacts = await listContacts({ q, type, overdue: overdue === "true", userId })
  } catch (e) {
    console.error("[contacts page]", e)
    dbError = true
  }

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      {dbError && (
        <div className="bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.25)] rounded-lg px-4 py-3 text-sm text-red-400">
          Database unavailable. Check server logs.
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#c0c0d0]">Contacts</h1>
        <Link href="/contacts/new" className="bg-[#00ff88] text-[#0a0a1a] text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-[#00cc6f]">
          + Add contact
        </Link>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search contacts..."
          className="flex-1 border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]"
        />
        <button type="submit" className="bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] text-[#c0c0d0] text-sm px-3 py-2 rounded-lg hover:bg-[rgba(0,255,136,0.08)]">Search</button>
      </form>

      {contacts.length === 0 ? (
        <p className="text-sm text-[#666688]">No contacts found.</p>
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
              isShared={c.userId !== userId}
              ownerName={c.userId !== userId ? (c.user?.name ?? null) : null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update contacts/[id]/route.ts for 403 on contributor PATCH/DELETE**

Replace `app/api/v1/contacts/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getContact, updateContact, deleteContact, isContactOwner } from "@/lib/services/contacts"
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
  // Check access first (contributor check), then check ownership for write
  const existing = await getContact(id, userId)
  if (!existing) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  if (!isContactOwner(existing.userId, userId)) return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 })
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
  const existing = await getContact(id, userId)
  if (!existing) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  if (!isContactOwner(existing.userId, userId)) return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 })
  const result = await deleteContact(id, "ian", userId)
  if (!result) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Run full test suite to confirm no regressions**

```bash
npx jest --no-coverage
```

Expected: all existing tests pass

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/contacts/ app/(dashboard)/contacts/page.tsx
git commit -m "feat: apply contactAccessWhere to contacts routes, add ownership gate, fix page auth"
```

---

## Task 8: Updated Interactions API Routes

**Files:**
- Modify: `app/api/v1/interactions/route.ts`
- Modify: `app/api/v1/interactions/[id]/route.ts`

- [ ] **Step 1: Update interactions/route.ts**

Replace `app/api/v1/interactions/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listInteractions, createInteraction } from "@/lib/services/interactions"
import { getContact } from "@/lib/services/contacts"
import { CreateInteractionSchema } from "@/lib/validations/interaction"

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { searchParams } = req.nextUrl
  const interactions = await listInteractions({
    contactId: searchParams.get("contactId") ?? undefined,
    followUpRequired: searchParams.get("followUpRequired") === "true",
    userId,
  })
  return NextResponse.json(interactions)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const body = await req.json()
  const parsed = CreateInteractionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })

  // Look up contact to verify access and determine owner for contributor mode
  const contact = await getContact(parsed.data.contactId, userId)
  if (!contact) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })

  // If contributor: interaction.userId = contact owner, createdByUserId = contributor
  const contactOwnerId = contact.userId !== userId ? (contact.userId ?? undefined) : undefined

  const interaction = await createInteraction(parsed.data, "ian", userId, contactOwnerId)
  return NextResponse.json(interaction, { status: 201 })
}
```

- [ ] **Step 2: Update interactions/[id]/route.ts for 403**

Replace `app/api/v1/interactions/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getInteraction, getInteractionById, updateInteraction, deleteInteraction } from "@/lib/services/interactions"
import { UpdateInteractionSchema } from "@/lib/validations/interaction"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const interaction = await getInteraction(id, userId)
  if (!interaction) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(interaction)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const existing = await getInteractionById(id)
  if (!existing) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  if (existing.userId !== userId) return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 })
  const body = await req.json()
  const parsed = UpdateInteractionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 422 })
  const interaction = await updateInteraction(id, parsed.data, "ian", userId)
  if (!interaction) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(interaction)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.userId
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 })
  const { id } = await params
  const existing = await getInteractionById(id)
  if (!existing) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  if (existing.userId !== userId) return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 })
  const result = await deleteInteraction(id, "ian", userId)
  if (!result) return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/interactions/
git commit -m "feat: contributor-aware interactions routes with 403 on owner-only operations"
```

---

## Task 9: ContactCard and Contacts List UI

**Files:**
- Modify: `components/contacts/contact-card.tsx`

The contacts list page was already updated in Task 7. Here we update ContactCard to accept and display the shared label.

- [ ] **Step 1: Update ContactCard**

Replace `components/contacts/contact-card.tsx`:

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
  isShared?: boolean
  ownerName?: string | null
}

export function ContactCard({ id, name, type, healthScore, lastInteraction, tags, isShared, ownerName }: ContactCardProps) {
  const daysSince = lastInteraction
    ? Math.floor((Date.now() - new Date(lastInteraction).getTime()) / 86400000)
    : null

  return (
    <Link href={`/contacts/${id}`} className="block bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 hover:border-[#00ff88] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#c0c0d0] truncate">{name}</p>
          {isShared && ownerName && (
            <p className="text-xs text-[#4488ff] mt-0.5">Shared by {ownerName}</p>
          )}
          <p className="text-xs text-[#666688] mt-0.5">
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
          <span className="text-xs text-[#666688] capitalize">{type}</span>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add components/contacts/contact-card.tsx
git commit -m "feat: show 'Shared by [name]' label on shared contacts in list"
```

---

## Task 10: Contact Detail UI - Contributor View and Sharing Section

**Files:**
- Modify: `app/(dashboard)/contacts/[id]/page.tsx`
- Create: `components/contacts/sharing-section.tsx`

- [ ] **Step 1: Create SharingSection component**

Create `components/contacts/sharing-section.tsx`:

```tsx
"use client"

import { useState } from "react"

interface Share {
  id: string
  user: { name: string; email: string }
  createdAt: string
}

interface Props {
  contactId: string
  initialShares: Share[]
}

export function SharingSection({ contactId, initialShares }: Props) {
  const [shares, setShares] = useState(initialShares)
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  async function addShare() {
    if (!email.trim()) return
    setWorking(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/contacts/${contactId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to share")
        return
      }
      setShares(prev => [...prev, { id: data.id, user: { name: email, email }, createdAt: new Date().toISOString() }])
      setEmail("")
    } finally {
      setWorking(false)
    }
  }

  async function removeShare(sharedUserId: string) {
    const res = await fetch(`/api/v1/contacts/${contactId}/shares/${sharedUserId}`, { method: "DELETE" })
    if (res.ok) {
      setShares(prev => prev.filter(s => s.user.email !== sharedUserId))
    }
  }

  return (
    <div>
      <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-2">Sharing</h2>
      <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 space-y-3">
        {shares.length === 0 ? (
          <p className="text-sm text-[#666688]">Not shared with anyone.</p>
        ) : (
          <div className="space-y-2">
            {shares.map(s => (
              <div key={s.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#c0c0d0]">{s.user.name}</p>
                  <p className="text-xs text-[#666688]">{s.user.email}</p>
                </div>
                <button
                  onClick={() => removeShare(s.user.email)}
                  className="text-xs text-[#ff4444] hover:text-[#ff6666]"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email address..."
            className="flex-1 border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-1.5 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-1 focus:ring-[#00ff88]"
            onKeyDown={e => e.key === "Enter" && addShare()}
          />
          <button
            onClick={addShare}
            disabled={working}
            className="bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] text-[#c0c0d0] text-sm px-3 py-1.5 rounded-lg hover:bg-[rgba(0,255,136,0.08)] disabled:opacity-50"
          >
            Share
          </button>
        </div>
        {error && <p className="text-xs text-[#ff4444]">{error}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update contact detail page**

Replace `app/(dashboard)/contacts/[id]/page.tsx`:

```tsx
import { auth } from "@/lib/auth"
import { getContact, isContactOwner } from "@/lib/services/contacts"
import { listContactShares } from "@/lib/services/sharing"
import { InteractionList } from "@/components/interactions/interaction-list"
import { ActionItemRow } from "@/components/action-items/action-item-row"
import { AddActionItemForm } from "@/components/action-items/add-action-item-form"
import { HealthScoreBadge } from "@/components/contacts/health-score-badge"
import { SharingSection } from "@/components/contacts/sharing-section"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.userId) redirect("/login")
  const userId = session.userId

  const { id } = await params
  const contact = await getContact(id, userId)
  if (!contact) notFound()

  const owner = isContactOwner(contact.userId, userId)

  // Load shares only for owner (contributors don't manage shares)
  const shares = owner ? await listContactShares(id, userId) ?? [] : []

  const allActionItems = contact.interactions.flatMap(i =>
    (i.actionItems ?? []).map(ai => ({ ...ai, interactionId: i.id }))
  )
  const openActionItems = allActionItems.filter(ai => ai.status === "todo")

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#c0c0d0]">{contact.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge>{contact.type}</Badge>
            <HealthScoreBadge score={contact.healthScore} />
            {contact.isFamilyMember && <Badge variant="info">Family</Badge>}
          </div>
          {!owner && contact.user && (
            <p className="text-xs text-[#4488ff] mt-1">Shared by {contact.user.name}</p>
          )}
        </div>
        {owner && (
          <Link href={`/contacts/${contact.id}/edit`} className="text-sm text-[#00ff88] hover:text-[#00cc6f]">Edit</Link>
        )}
      </div>

      {contact.notes && (
        <div>
          <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-2">Notes</h2>
          <p className="text-sm text-[#c0c0d0] whitespace-pre-wrap">{contact.notes}</p>
        </div>
      )}

      {openActionItems.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide mb-2">Action items</h2>
          <div className="space-y-2">
            {openActionItems.map(item => (
              <ActionItemRow
                key={item.id}
                id={item.id}
                title={item.title}
                status={item.status}
                priority={item.priority}
                assignedTo={item.assignedTo}
                dueDate={item.dueDate ? item.dueDate.toISOString() : null}
                interactionId={item.interactionId}
                taskId={item.taskId}
                contactId={id}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-[#666688] uppercase tracking-wide">Interactions</h2>
        </div>
        <InteractionList interactions={contact.interactions as any} />
        <AddActionItemForm />
      </div>

      {owner && (
        <SharingSection
          contactId={id}
          initialShares={shares.map(s => ({ id: s.id, user: (s as any).user, createdAt: s.createdAt.toISOString() }))}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/contacts/[id]/page.tsx components/contacts/sharing-section.tsx
git commit -m "feat: contributor view on contact detail, sharing section for owners"
```

---

## Task 11: Admin Panel Access Grants Section

**Files:**
- Modify: `app/admin/page.tsx`
- Modify: `components/admin/admin-panel.tsx`

- [ ] **Step 1: Update admin page to fetch grants**

Replace `app/admin/page.tsx`:

```tsx
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { listAccessGrants } from "@/lib/services/sharing"
import { redirect, notFound } from "next/navigation"
import { AdminPanel } from "@/components/admin/admin-panel"

export default async function AdminPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.role !== "admin") notFound()

  const [users, grants] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" } }),
    listAccessGrants(),
  ])

  return <AdminPanel users={users} grants={grants as any} />
}
```

- [ ] **Step 2: Update AdminPanel to show access grants section**

Add the grants section to `components/admin/admin-panel.tsx`. Add a `grants` prop and a new section at the bottom. Replace the full file:

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

interface Grant {
  id: string
  grantor: { name: string; email: string }
  grantee: { name: string; email: string }
  createdAt: Date
}

interface Props {
  users: User[]
  grants: Grant[]
}

export function AdminPanel({ users, grants: initialGrants }: Props) {
  const [userList, setUserList] = useState(users)
  const [grants, setGrants] = useState(initialGrants)
  const [claimUserId, setClaimUserId] = useState(() => {
    const first = users.find(u => u.status === "approved")
    return first?.id ?? ""
  })
  const [claimResult, setClaimResult] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [grantorEmail, setGrantorEmail] = useState("")
  const [granteeEmail, setGranteeEmail] = useState("")
  const [grantError, setGrantError] = useState<string | null>(null)

  const pending = userList.filter(u => u.status === "pending")
  const approved = userList.filter(u => u.status === "approved")

  async function updateStatus(id: string, action: "approve" | "reject") {
    setWorking(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/users/${id}/${action}`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? "Action failed")
        return
      }
      setUserList(prev =>
        prev.map(u => u.id === id ? { ...u, status: action === "approve" ? "approved" : "rejected" } : u)
      )
      if (action === "approve" && !claimUserId) setClaimUserId(id)
    } finally {
      setWorking(null)
    }
  }

  async function claimUnclaimed() {
    if (!claimUserId) return
    setWorking("claim")
    setClaimResult(null)
    try {
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
    } finally {
      setWorking(null)
    }
  }

  async function createGrant() {
    if (!grantorEmail.trim() || !granteeEmail.trim()) return
    setWorking("grant")
    setGrantError(null)
    try {
      const res = await fetch("/api/admin/access-grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantorEmail: grantorEmail.trim(), granteeEmail: granteeEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGrantError(data.error ?? "Failed to create grant")
        return
      }
      setGrants(prev => [data, ...prev])
      setGrantorEmail("")
      setGranteeEmail("")
    } finally {
      setWorking(null)
    }
  }

  async function revokeGrant(id: string) {
    const res = await fetch(`/api/admin/access-grants/${id}`, { method: "DELETE" })
    if (res.ok) setGrants(prev => prev.filter(g => g.id !== id))
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold text-[#c0c0d0]">Admin</h1>
      {actionError && <p className="text-xs text-[#ff4444]">{actionError}</p>}

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
            {approved.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
          <Button onClick={claimUnclaimed} disabled={working === "claim" || !claimUserId}>
            {working === "claim" ? "Claiming..." : "Claim all unclaimed records"}
          </Button>
          {claimResult && <p className="text-xs text-[#00ff88]">{claimResult}</p>}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[#c0c0d0] mb-3">Access grants</h2>
        <p className="text-sm text-[#666688] mb-3">Grant a user full read+contribute access to another user's contact book.</p>
        <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 space-y-3 mb-3">
          <div className="flex gap-2">
            <input
              value={grantorEmail}
              onChange={e => setGrantorEmail(e.target.value)}
              placeholder="Grantor email..."
              className="flex-1 border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-1.5 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-1 focus:ring-[#00ff88]"
            />
            <input
              value={granteeEmail}
              onChange={e => setGranteeEmail(e.target.value)}
              placeholder="Grantee email..."
              className="flex-1 border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-1.5 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-1 focus:ring-[#00ff88]"
            />
            <Button onClick={createGrant} disabled={working === "grant"}>
              {working === "grant" ? "Creating..." : "Create"}
            </Button>
          </div>
          {grantError && <p className="text-xs text-[#ff4444]">{grantError}</p>}
        </div>
        {grants.length === 0 ? (
          <p className="text-sm text-[#666688]">No access grants.</p>
        ) : (
          <div className="space-y-2">
            {grants.map(g => (
              <div key={g.id} className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#c0c0d0]">
                    <span className="font-medium">{g.grantor.name}</span>
                    <span className="text-[#666688]"> ({g.grantor.email})</span>
                    <span className="text-[#666688]"> granted to </span>
                    <span className="font-medium">{g.grantee.name}</span>
                    <span className="text-[#666688]"> ({g.grantee.email})</span>
                  </p>
                </div>
                <Button size="sm" variant="danger" onClick={() => revokeGrant(g.id)}>
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Run full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add app/admin/page.tsx components/admin/admin-panel.tsx
git commit -m "feat: add access grants section to admin panel"
```

---

## Final verification

- [ ] **Run full test suite one last time**

```bash
npx jest --no-coverage
```

Expected: all tests pass, no regressions

---

## Self-Review

**Spec coverage check:**
- UserAccessGrant schema: Task 1
- ContactShare schema: Task 1
- projectId on Contact and Interaction: Task 1
- createdByUserId on Interaction: Task 1, Task 4
- contactAccessWhere (all 4 paths): Task 3
- isContactOwner helper: Task 3
- Sharing service CRUD: Task 2
- Admin access grants routes (GET/POST/DELETE): Task 5
- Contact shares routes (GET/POST/DELETE): Task 6
- Contacts GET routes use accessWhere: Task 7 (via service)
- Contacts PUT/DELETE return 403 for contributors: Task 7
- Interactions GET/POST contributor-aware: Task 8
- Interactions PUT/DELETE return 403 for contributors: Task 8
- ContactCard "Shared by" label: Task 9
- Contacts list page wired to session: Task 7
- Contact detail contributor view (no edit/delete): Task 10
- Contact detail sharing section (owner only): Task 10
- Admin panel access grants UI: Task 11

All spec requirements covered.
