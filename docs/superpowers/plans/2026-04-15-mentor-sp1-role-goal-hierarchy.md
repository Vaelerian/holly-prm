# Role/Goal Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Role > Goal organisational hierarchy to Holly PRM, extending existing Project and Task models so everything belongs to a Goal (which belongs to a Role), while making project assignment optional on tasks.

**Architecture:** New Role and Goal Prisma models with denormalized roleId on Project and Task. New services and API routes for CRUD. Modified task/project services to accept goalId (required) and derive roleId. Migration backfills existing data with default Role/Goal per user.

**Tech Stack:** Next.js 16, Prisma 7, PostgreSQL, Jest, Zod

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `prisma/migrations/YYYYMMDD_role_goal_hierarchy/migration.sql` | Schema migration + data backfill |
| `lib/validations/role.ts` | Zod schemas for Role CRUD |
| `lib/validations/goal.ts` | Zod schemas for Goal CRUD |
| `lib/services/roles.ts` | Role service (CRUD, defaults) |
| `lib/services/goals.ts` | Goal service (CRUD, defaults, complete) |
| `__tests__/services/roles.test.ts` | Role service tests |
| `__tests__/services/goals.test.ts` | Goal service tests |
| `app/api/v1/roles/route.ts` | GET/POST roles |
| `app/api/v1/roles/[id]/route.ts` | PUT/DELETE role |
| `app/api/v1/goals/route.ts` | GET/POST goals |
| `app/api/v1/goals/[id]/route.ts` | PUT/DELETE goal |
| `app/api/v1/goals/[id]/complete/route.ts` | POST complete goal |

### Modified Files
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add Role, Goal models; extend Project, Task |
| `lib/validations/task.ts` | Add goalId, make projectId optional |
| `lib/validations/project.ts` | Add goalId |
| `lib/services/tasks.ts` | Accept goalId, derive roleId, optional projectId |
| `lib/services/projects.ts` | Accept goalId, derive roleId, cascade to tasks |
| `__tests__/services/tasks.test.ts` | Add goal/role tests |
| `__tests__/services/projects.test.ts` | Add goal/role tests |
| `lib/auth.ts` | Seed default role/goal on user creation |
| `app/(dashboard)/settings/page.tsx` | Add Roles & Goals management section |
| `components/projects/project-form.tsx` | Add Role > Goal two-level selector |
| `components/tasks/add-task-form.tsx` | Add Goal selector when outside project context |
| `app/(dashboard)/tasks/page.tsx` | Add role/goal filters, update grouping |
| `app/(dashboard)/projects/page.tsx` | Add role/goal filters, show goal on cards |

---

### Task 1: Prisma Schema - Role and Goal models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add GoalType and GoalStatus enums and Role model to schema**

Add after the existing `UserStatus` enum (around line 85 of schema.prisma):

```prisma
enum GoalType {
  ongoing
  completable
}

enum GoalStatus {
  active
  completed
  archived
}

model Role {
  id          String    @id @default(uuid())
  name        String
  description String    @default("")
  colour      String    @default("#6366F1")
  icon        String    @default("")
  isDefault   Boolean   @default(false)
  sortOrder   Int       @default(0)
  userId      String?
  user        User?     @relation(fields: [userId], references: [id], onDelete: SetNull)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  goals    Goal[]
  projects Project[]   @relation("ProjectRole")
  tasks    Task[]      @relation("TaskRole")

  @@unique([userId, name])
}

model Goal {
  id          String     @id @default(uuid())
  roleId      String
  role        Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  name        String
  description String     @default("")
  goalType    GoalType   @default(ongoing)
  status      GoalStatus @default(active)
  targetDate  DateTime?
  isDefault   Boolean    @default(false)
  sortOrder   Int        @default(0)
  userId      String?
  user        User?      @relation(fields: [userId], references: [id], onDelete: SetNull)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  projects Project[]    @relation("ProjectGoal")
  tasks    Task[]       @relation("TaskGoal")

  @@unique([roleId, name])
}
```

- [ ] **Step 2: Add Role and Goal relations to User model**

In the User model, add these relation fields alongside the existing ones:

```prisma
  roles             Role[]
  goals             Goal[]
```

- [ ] **Step 3: Add roleId and goalId to Project model**

In the Project model, add after the existing `userId`/`user` fields:

```prisma
  roleId      String?
  role        Role?    @relation("ProjectRole", fields: [roleId], references: [id], onDelete: SetNull)
  goalId      String?
  goal        Goal?    @relation("ProjectGoal", fields: [goalId], references: [id], onDelete: SetNull)
```

Note: nullable initially for migration. Will be made required after backfill.

- [ ] **Step 4: Make projectId optional on Task and add roleId/goalId**

In the Task model, change `projectId` from required to optional and add role/goal fields:

Change:
```prisma
  projectId   String
  project     Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

To:
```prisma
  projectId   String?
  project     Project?     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  roleId      String?
  role        Role?        @relation("TaskRole", fields: [roleId], references: [id], onDelete: SetNull)
  goalId      String?
  goal        Goal?        @relation("TaskGoal", fields: [goalId], references: [id], onDelete: SetNull)
```

Note: roleId/goalId nullable initially for migration. Will be made required after backfill.

- [ ] **Step 5: Generate Prisma client and create migration**

Run:
```bash
npx prisma generate
npx prisma migrate dev --name role_goal_hierarchy --create-only
```

This creates the migration SQL without applying it. We will edit it to add the backfill in Task 2.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ app/generated/
git commit -m "feat: add Role and Goal models, extend Project and Task schema"
```

---

### Task 2: Migration with Data Backfill

**Files:**
- Modify: `prisma/migrations/<timestamp>_role_goal_hierarchy/migration.sql`

- [ ] **Step 1: Edit the generated migration to add backfill SQL**

After the auto-generated CREATE TABLE and ALTER TABLE statements, append this backfill SQL before any NOT NULL constraints:

```sql
-- Backfill: create default Role and Goal for each user who has projects or tasks
INSERT INTO "Role" ("id", "name", "description", "colour", "icon", "isDefault", "sortOrder", "userId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  'Unassigned',
  '',
  '#6366F1',
  '',
  true,
  0,
  u."id",
  NOW(),
  NOW()
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "Role" r WHERE r."userId" = u."id" AND r."isDefault" = true
);

INSERT INTO "Goal" ("id", "roleId", "name", "description", "goalType", "status", "isDefault", "sortOrder", "userId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  r."id",
  'General',
  '',
  'ongoing',
  'active',
  true,
  0,
  r."userId",
  NOW(),
  NOW()
FROM "Role" r
WHERE r."isDefault" = true
AND NOT EXISTS (
  SELECT 1 FROM "Goal" g WHERE g."roleId" = r."id" AND g."isDefault" = true
);

-- Backfill existing projects
UPDATE "Project" p
SET "roleId" = r."id", "goalId" = g."id"
FROM "Role" r
JOIN "Goal" g ON g."roleId" = r."id" AND g."isDefault" = true
WHERE r."userId" = p."userId"
AND r."isDefault" = true
AND p."roleId" IS NULL;

-- Backfill existing tasks (join through project to get userId)
UPDATE "Task" t
SET "roleId" = p."roleId", "goalId" = p."goalId"
FROM "Project" p
WHERE p."id" = t."projectId"
AND t."roleId" IS NULL;
```

- [ ] **Step 2: After backfill, add NOT NULL constraints**

Append to the migration:

```sql
-- Now make roleId and goalId required on Project
ALTER TABLE "Project" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "goalId" SET NOT NULL;

-- Make roleId and goalId required on Task (projectId stays nullable)
ALTER TABLE "Task" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "goalId" SET NOT NULL;
```

- [ ] **Step 3: Apply the migration**

Run:
```bash
npx prisma migrate dev
```

Expected: Migration applies successfully, all existing data backfilled.

- [ ] **Step 4: Update Prisma schema to reflect NOT NULL**

In `prisma/schema.prisma`, change the Project fields from nullable to required:

```prisma
  roleId      String
  role        Role     @relation("ProjectRole", fields: [roleId], references: [id], onDelete: SetNull)
  goalId      String
  goal        Goal     @relation("ProjectGoal", fields: [goalId], references: [id], onDelete: SetNull)
```

And the Task fields:

```prisma
  roleId      String
  role        Role     @relation("TaskRole", fields: [roleId], references: [id], onDelete: SetNull)
  goalId      String
  goal        Goal     @relation("TaskGoal", fields: [goalId], references: [id], onDelete: SetNull)
```

Run `npx prisma generate` to regenerate the client.

- [ ] **Step 5: Commit**

```bash
git add prisma/
git commit -m "feat: migration with backfill for role/goal hierarchy"
```

---

### Task 3: Validation Schemas

**Files:**
- Create: `lib/validations/role.ts`
- Create: `lib/validations/goal.ts`
- Modify: `lib/validations/task.ts`
- Modify: `lib/validations/project.ts`

- [ ] **Step 1: Create role validation schema**

Create `lib/validations/role.ts`:

```typescript
import { z } from "zod"

export const CreateRoleSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().default(""),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex colour").default("#6366F1"),
  icon: z.string().default(""),
})

export const UpdateRoleSchema = CreateRoleSchema.partial()

export type CreateRoleInput = z.infer<typeof CreateRoleSchema>
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>
```

- [ ] **Step 2: Create goal validation schema**

Create `lib/validations/goal.ts`:

```typescript
import { z } from "zod"

export const CreateGoalSchema = z.object({
  roleId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().default(""),
  goalType: z.enum(["ongoing", "completable"]),
  targetDate: z.string().date().nullable().default(null),
})

export const UpdateGoalSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  goalType: z.enum(["ongoing", "completable"]).optional(),
  targetDate: z.string().date().nullable().optional(),
  roleId: z.string().uuid().optional(),
})

export type CreateGoalInput = z.infer<typeof CreateGoalSchema>
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>
```

- [ ] **Step 3: Modify task validation schema**

In `lib/validations/task.ts`, change `CreateTaskSchema`:

```typescript
export const CreateTaskSchema = z.object({
  goalId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional().default(null),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().default(""),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).default("todo"),
  priority: PrioritySchema.default("medium"),
  assignedTo: ActorSchema,
  dueDate: z.string().date().nullable().default(null),
  isMilestone: z.boolean().default(false),
})
```

Update `UpdateTaskSchema` to include optional goalId:

```typescript
export const UpdateTaskSchema = CreateTaskSchema.omit({ goalId: true, projectId: true }).partial().extend({
  goalId: z.string().uuid().optional(),
  projectId: z.string().uuid().nullable().optional(),
})
```

- [ ] **Step 4: Modify project validation schema**

In `lib/validations/project.ts`, add `goalId` to `CreateProjectSchema`:

```typescript
export const CreateProjectSchema = z.object({
  goalId: z.string().uuid(),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().default(""),
  category: z.enum(["personal", "work", "volunteer"]),
  status: z.enum(["planning", "active", "on_hold", "done", "cancelled"]).default("planning"),
  priority: PrioritySchema.default("medium"),
  targetDate: z.string().date().nullable().default(null),
  notes: z.string().default(""),
})
```

Add optional goalId to `UpdateProjectSchema`:

```typescript
export const UpdateProjectSchema = CreateProjectSchema.omit({ goalId: true }).partial().extend({
  goalId: z.string().uuid().optional(),
})
```

- [ ] **Step 5: Commit**

```bash
git add lib/validations/role.ts lib/validations/goal.ts lib/validations/task.ts lib/validations/project.ts
git commit -m "feat: add role/goal validation schemas, update task/project schemas"
```

---

### Task 4: Role Service with Tests

**Files:**
- Create: `lib/services/roles.ts`
- Create: `__tests__/services/roles.test.ts`

- [ ] **Step 1: Write role service tests**

Create `__tests__/services/roles.test.ts`:

```typescript
import { listRoles, getRole, createRole, updateRole, deleteRole, getOrCreateDefaultRole } from "@/lib/services/roles"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    role: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      upsert: jest.fn(),
    },
    goal: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    project: { updateMany: jest.fn() },
    task: { updateMany: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("createRole", () => {
  it("creates a role with valid data", async () => {
    const input = { name: "Work", colour: "#FF0000" }
    mockPrisma.role.create.mockResolvedValue({ id: "r1", ...input, isDefault: false } as any)
    const result = await createRole(input, "user-1")
    expect(result).toEqual(expect.objectContaining({ name: "Work" }))
    expect(mockPrisma.role.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Work", colour: "#FF0000", userId: "user-1" }),
    })
  })
})

describe("updateRole", () => {
  it("blocks name update on default role", async () => {
    mockPrisma.role.findFirst.mockResolvedValue({ id: "r1", isDefault: true, userId: "user-1" } as any)
    await expect(updateRole("r1", { name: "Renamed" }, "user-1")).rejects.toThrow()
  })

  it("allows colour update on default role", async () => {
    mockPrisma.role.findFirst.mockResolvedValue({ id: "r1", isDefault: true, userId: "user-1" } as any)
    mockPrisma.role.update.mockResolvedValue({ id: "r1", colour: "#00FF00" } as any)
    const result = await updateRole("r1", { colour: "#00FF00" }, "user-1")
    expect(result.colour).toBe("#00FF00")
  })
})

describe("deleteRole", () => {
  it("blocks deletion of default role", async () => {
    mockPrisma.role.findFirst.mockResolvedValue({ id: "r1", isDefault: true, userId: "user-1" } as any)
    await expect(deleteRole("r1", "r2", "user-1")).rejects.toThrow()
  })
})

describe("getOrCreateDefaultRole", () => {
  it("returns existing default role if one exists", async () => {
    const existing = { id: "r1", name: "Unassigned", isDefault: true }
    mockPrisma.role.findFirst.mockResolvedValue(existing as any)
    const result = await getOrCreateDefaultRole("user-1")
    expect(result).toEqual(existing)
    expect(mockPrisma.role.create).not.toHaveBeenCalled()
  })

  it("creates default role and goal when none exists", async () => {
    mockPrisma.role.findFirst.mockResolvedValue(null)
    mockPrisma.role.create.mockResolvedValue({ id: "r-new", name: "Unassigned", isDefault: true } as any)
    mockPrisma.goal.findFirst.mockResolvedValue(null)
    mockPrisma.goal.create.mockResolvedValue({ id: "g-new", name: "General", isDefault: true } as any)
    const result = await getOrCreateDefaultRole("user-1")
    expect(result.name).toBe("Unassigned")
    expect(mockPrisma.goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "General", isDefault: true }),
    })
  })
})

describe("listRoles", () => {
  it("returns roles ordered by sortOrder then name", async () => {
    mockPrisma.role.findMany.mockResolvedValue([{ id: "r1" }] as any)
    await listRoles("user-1")
    expect(mockPrisma.role.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      })
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/roles.test.ts --no-coverage`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement role service**

Create `lib/services/roles.ts`:

```typescript
import { prisma } from "@/lib/db"
import type { CreateRoleInput, UpdateRoleInput } from "@/lib/validations/role"

export async function listRoles(userId: string) {
  return prisma.role.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { goals: true } } },
  })
}

export async function getRole(id: string, userId: string) {
  return prisma.role.findFirst({
    where: { id, userId },
    include: { goals: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  })
}

export async function createRole(data: CreateRoleInput, userId: string) {
  return prisma.role.create({
    data: { ...data, userId },
  })
}

export async function updateRole(id: string, data: UpdateRoleInput, userId: string) {
  const role = await prisma.role.findFirst({ where: { id, userId } })
  if (!role) throw new Error("Role not found")
  if (role.isDefault && data.name !== undefined) {
    throw new Error("Cannot rename the default role")
  }
  return prisma.role.update({ where: { id }, data })
}

export async function deleteRole(id: string, remapToRoleId: string, userId: string) {
  const role = await prisma.role.findFirst({ where: { id, userId } })
  if (!role) throw new Error("Role not found")
  if (role.isDefault) throw new Error("Cannot delete the default role")

  await prisma.$transaction(async (tx) => {
    // Move all goals to target role
    await tx.goal.updateMany({ where: { roleId: id }, data: { roleId: remapToRoleId } })
    // Update denormalized roleId on projects and tasks
    await tx.project.updateMany({ where: { roleId: id }, data: { roleId: remapToRoleId } })
    await tx.task.updateMany({ where: { roleId: id }, data: { roleId: remapToRoleId } })
    // Delete the role
    await tx.role.delete({ where: { id } })
  })
}

export async function getOrCreateDefaultRole(userId: string) {
  const existing = await prisma.role.findFirst({
    where: { userId, isDefault: true },
  })
  if (existing) return existing

  const role = await prisma.role.create({
    data: { name: "Unassigned", isDefault: true, userId },
  })

  // Also create the default goal
  const existingGoal = await prisma.goal.findFirst({
    where: { roleId: role.id, isDefault: true },
  })
  if (!existingGoal) {
    await prisma.goal.create({
      data: { name: "General", roleId: role.id, goalType: "ongoing", isDefault: true, userId },
    })
  }

  return role
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/services/roles.test.ts --no-coverage`
Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add lib/services/roles.ts __tests__/services/roles.test.ts
git commit -m "feat: role service with CRUD, defaults, and tests"
```

---

### Task 5: Goal Service with Tests

**Files:**
- Create: `lib/services/goals.ts`
- Create: `__tests__/services/goals.test.ts`

- [ ] **Step 1: Write goal service tests**

Create `__tests__/services/goals.test.ts`:

```typescript
import { listGoals, getGoal, createGoal, updateGoal, deleteGoal, completeGoal, getOrCreateDefaultGoal } from "@/lib/services/goals"
import { prisma } from "@/lib/db"

jest.mock("@/lib/db", () => ({
  prisma: {
    goal: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    project: { updateMany: jest.fn() },
    task: { updateMany: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

describe("createGoal", () => {
  it("creates a goal under a role", async () => {
    const input = { roleId: "r1", name: "Career Development", goalType: "ongoing" as const, targetDate: null }
    mockPrisma.goal.create.mockResolvedValue({ id: "g1", ...input, isDefault: false } as any)
    const result = await createGoal(input, "user-1")
    expect(result.name).toBe("Career Development")
    expect(mockPrisma.goal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roleId: "r1", userId: "user-1" }),
    })
  })
})

describe("completeGoal", () => {
  it("completes a completable goal", async () => {
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "g1", goalType: "completable", status: "active", userId: "user-1" } as any)
    mockPrisma.goal.update.mockResolvedValue({ id: "g1", status: "completed" } as any)
    const result = await completeGoal("g1", "user-1")
    expect(result.status).toBe("completed")
  })

  it("rejects completing an ongoing goal", async () => {
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "g1", goalType: "ongoing", userId: "user-1" } as any)
    await expect(completeGoal("g1", "user-1")).rejects.toThrow("ongoing")
  })
})

describe("updateGoal", () => {
  it("blocks name change on default goal", async () => {
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "g1", isDefault: true, userId: "user-1" } as any)
    await expect(updateGoal("g1", { name: "Renamed" }, "user-1")).rejects.toThrow()
  })

  it("cascades roleId when goal moves to different role", async () => {
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "g1", roleId: "r1", isDefault: false, userId: "user-1" } as any)
    mockPrisma.goal.update.mockResolvedValue({ id: "g1", roleId: "r2" } as any)
    mockPrisma.project.updateMany.mockResolvedValue({ count: 1 } as any)
    mockPrisma.task.updateMany.mockResolvedValue({ count: 2 } as any)
    await updateGoal("g1", { roleId: "r2" }, "user-1")
    expect(mockPrisma.project.updateMany).toHaveBeenCalledWith({
      where: { goalId: "g1" }, data: { roleId: "r2" },
    })
    expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
      where: { goalId: "g1" }, data: { roleId: "r2" },
    })
  })
})

describe("deleteGoal", () => {
  it("blocks deletion of default goal", async () => {
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "g1", isDefault: true, userId: "user-1" } as any)
    await expect(deleteGoal("g1", "g2", "user-1")).rejects.toThrow()
  })
})

describe("getOrCreateDefaultGoal", () => {
  it("returns existing default goal", async () => {
    mockPrisma.role.findFirst.mockResolvedValue({ id: "r1", isDefault: true } as any)
    mockPrisma.goal.findFirst.mockResolvedValue({ id: "g1", name: "General", isDefault: true } as any)
    const result = await getOrCreateDefaultGoal("user-1")
    expect(result.name).toBe("General")
  })

  it("creates default role and goal when none exist", async () => {
    mockPrisma.role.findFirst.mockResolvedValue(null)
    mockPrisma.role.create.mockResolvedValue({ id: "r-new", isDefault: true } as any)
    mockPrisma.goal.findFirst.mockResolvedValue(null)
    mockPrisma.goal.create.mockResolvedValue({ id: "g-new", name: "General", isDefault: true } as any)
    const result = await getOrCreateDefaultGoal("user-1")
    expect(result.name).toBe("General")
    expect(mockPrisma.role.create).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/services/goals.test.ts --no-coverage`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement goal service**

Create `lib/services/goals.ts`:

```typescript
import { prisma } from "@/lib/db"
import type { CreateGoalInput, UpdateGoalInput } from "@/lib/validations/goal"

export async function listGoals(userId: string, roleId?: string) {
  const where: Record<string, unknown> = { userId }
  if (roleId) where.roleId = roleId
  return prisma.goal.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { projects: true, tasks: true } } },
  })
}

export async function getGoal(id: string, userId: string) {
  return prisma.goal.findFirst({
    where: { id, userId },
    include: {
      role: { select: { id: true, name: true, colour: true } },
      projects: { select: { id: true, title: true, status: true }, orderBy: { createdAt: "desc" } },
      tasks: { where: { projectId: null }, select: { id: true, title: true, status: true }, orderBy: { createdAt: "asc" } },
    },
  })
}

export async function createGoal(data: CreateGoalInput, userId: string) {
  return prisma.goal.create({
    data: {
      roleId: data.roleId,
      name: data.name,
      description: data.description ?? "",
      goalType: data.goalType,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
      userId,
    },
  })
}

export async function updateGoal(id: string, data: UpdateGoalInput, userId: string) {
  const goal = await prisma.goal.findFirst({ where: { id, userId } })
  if (!goal) throw new Error("Goal not found")
  if (goal.isDefault && data.name !== undefined) {
    throw new Error("Cannot rename the default goal")
  }

  const roleChanged = data.roleId && data.roleId !== goal.roleId

  const updated = await prisma.goal.update({
    where: { id },
    data: {
      ...data,
      targetDate: data.targetDate !== undefined ? (data.targetDate ? new Date(data.targetDate) : null) : undefined,
    },
  })

  if (roleChanged) {
    await prisma.$transaction(async (tx) => {
      await tx.project.updateMany({ where: { goalId: id }, data: { roleId: data.roleId! } })
      await tx.task.updateMany({ where: { goalId: id }, data: { roleId: data.roleId! } })
    })
  }

  return updated
}

export async function deleteGoal(id: string, remapToGoalId: string, userId: string) {
  const goal = await prisma.goal.findFirst({ where: { id, userId } })
  if (!goal) throw new Error("Goal not found")
  if (goal.isDefault) throw new Error("Cannot delete the default goal")

  const target = await prisma.goal.findFirst({ where: { id: remapToGoalId, userId } })
  if (!target) throw new Error("Target goal not found")

  await prisma.$transaction(async (tx) => {
    await tx.project.updateMany({
      where: { goalId: id },
      data: { goalId: remapToGoalId, roleId: target.roleId },
    })
    await tx.task.updateMany({
      where: { goalId: id },
      data: { goalId: remapToGoalId, roleId: target.roleId },
    })
    await tx.goal.delete({ where: { id } })
  })
}

export async function completeGoal(id: string, userId: string) {
  const goal = await prisma.goal.findFirst({ where: { id, userId } })
  if (!goal) throw new Error("Goal not found")
  if (goal.goalType === "ongoing") {
    throw new Error("Cannot complete an ongoing goal")
  }
  return prisma.goal.update({
    where: { id },
    data: { status: "completed" },
  })
}

export async function getOrCreateDefaultGoal(userId: string) {
  // Ensure default role exists
  let role = await prisma.role.findFirst({ where: { userId, isDefault: true } })
  if (!role) {
    role = await prisma.role.create({
      data: { name: "Unassigned", isDefault: true, userId },
    })
  }

  let goal = await prisma.goal.findFirst({ where: { roleId: role.id, isDefault: true } })
  if (!goal) {
    goal = await prisma.goal.create({
      data: { name: "General", roleId: role.id, goalType: "ongoing", isDefault: true, userId },
    })
  }

  return goal
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/services/goals.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/services/goals.ts __tests__/services/goals.test.ts
git commit -m "feat: goal service with CRUD, complete, defaults, and tests"
```

---

### Task 6: Modify Task and Project Services

**Files:**
- Modify: `lib/services/tasks.ts`
- Modify: `lib/services/projects.ts`
- Modify: `__tests__/services/tasks.test.ts`
- Modify: `__tests__/services/projects.test.ts`

- [ ] **Step 1: Add goal/role tests to task service tests**

Add to `__tests__/services/tasks.test.ts`. Add `goal` and `role` to the prisma mock object:

```typescript
// Add to the jest.mock prisma object:
goal: { findFirst: jest.fn() },
role: { findFirst: jest.fn() },
```

Add new test cases:

```typescript
describe("createTask with goal", () => {
  it("derives roleId from goalId", async () => {
    const goal = { id: "g1", roleId: "r1", userId: "user-1" }
    mockPrisma.goal.findFirst.mockResolvedValue(goal as any)
    mockPrisma.task.create.mockResolvedValue({ id: "t1", goalId: "g1", roleId: "r1" } as any)
    const data = { goalId: "g1", title: "Test task", assignedTo: "ian" as const, projectId: null }
    const result = await createTask(data as any, "ian", "user-1")
    expect(mockPrisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roleId: "r1", goalId: "g1" }),
    })
  })

  it("rejects when projectId goal does not match", async () => {
    const goal = { id: "g1", roleId: "r1", userId: "user-1" }
    const project = { id: "p1", goalId: "g2", userId: "user-1" }
    mockPrisma.goal.findFirst.mockResolvedValue(goal as any)
    mockPrisma.project.findFirst.mockResolvedValue(project as any)
    const data = { goalId: "g1", projectId: "p1", title: "Test", assignedTo: "ian" as const }
    const result = await createTask(data as any, "ian", "user-1")
    expect(result).toBeNull()
  })

  it("creates task without projectId (directly under goal)", async () => {
    const goal = { id: "g1", roleId: "r1", userId: "user-1" }
    mockPrisma.goal.findFirst.mockResolvedValue(goal as any)
    mockPrisma.task.create.mockResolvedValue({ id: "t1", goalId: "g1", roleId: "r1", projectId: null } as any)
    const data = { goalId: "g1", title: "Standalone task", assignedTo: "ian" as const }
    const result = await createTask(data as any, "ian", "user-1")
    expect(result).toBeTruthy()
    expect(mockPrisma.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: null }),
    })
  })
})
```

- [ ] **Step 2: Update task service to handle goalId and optional projectId**

Rewrite `lib/services/tasks.ts` `createTask` function:

```typescript
export async function createTask(data: CreateTaskInput, actor: Actor, userId: string) {
  // Look up goal to derive roleId
  const goal = await prisma.goal.findFirst({ where: { id: data.goalId, userId } })
  if (!goal) return null

  // If projectId provided, validate it matches the goal
  if (data.projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: data.projectId,
        OR: [{ userId }, { members: { some: { userId } } }],
      },
    })
    if (!project || project.goalId !== data.goalId) return null
  }

  const task = await prisma.task.create({
    data: {
      goalId: data.goalId,
      roleId: goal.roleId,
      projectId: data.projectId ?? null,
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      assignedTo: data.assignedTo,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      isMilestone: data.isMilestone,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Task", entityId: task.id, action: "create", actor, userId },
  })
  if (task.dueDate) {
    void upsertCalendarEvent("task", task.id, { title: task.title, date: task.dueDate }, userId)
  }
  return task
}
```

Update `listTasks` to support roleId and goalId filters:

```typescript
interface ListTasksOptions {
  projectId?: string
  roleId?: string
  goalId?: string
  status?: string
  assignedTo?: string
  milestoneOnly?: boolean
  userId: string
}

export async function listTasks(opts: ListTasksOptions) {
  const where: Record<string, unknown> = {}

  // Access control: tasks with a project use project ownership, tasks without use direct goal ownership
  if (opts.projectId) {
    where.projectId = opts.projectId
    where.project = {
      OR: [{ userId: opts.userId }, { members: { some: { userId: opts.userId } } }],
    }
  } else {
    where.OR = [
      { project: { OR: [{ userId: opts.userId }, { members: { some: { userId: opts.userId } } }] } },
      { projectId: null, goal: { userId: opts.userId } },
    ]
  }

  if (opts.roleId) where.roleId = opts.roleId
  if (opts.goalId) where.goalId = opts.goalId
  if (opts.status) where.status = opts.status
  if (opts.assignedTo) where.assignedTo = opts.assignedTo
  if (opts.milestoneOnly) where.isMilestone = true

  return prisma.task.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      project: { select: { id: true, title: true } },
      goal: { select: { id: true, name: true } },
      role: { select: { id: true, name: true, colour: true } },
    },
  })
}
```

Update `getTask` to handle tasks without projects:

```typescript
export async function getTask(id: string, userId: string) {
  return prisma.task.findFirst({
    where: {
      id,
      OR: [
        { project: { OR: [{ userId }, { members: { some: { userId } } }] } },
        { projectId: null, goal: { userId } },
      ],
    },
    include: {
      project: { select: { id: true, title: true } },
      goal: { select: { id: true, name: true } },
      role: { select: { id: true, name: true, colour: true } },
      actionItems: { orderBy: { createdAt: "asc" } },
    },
  })
}
```

Update `updateTask` to handle goalId changes:

```typescript
export async function updateTask(id: string, data: UpdateTaskInput, actor: Actor, userId: string) {
  const existing = await prisma.task.findFirst({
    where: {
      id,
      OR: [
        { project: { OR: [{ userId }, { members: { some: { userId } } }] } },
        { projectId: null, goal: { userId } },
      ],
    },
  })
  if (!existing) return null

  // If goalId is changing, derive new roleId
  let roleId: string | undefined
  if (data.goalId && data.goalId !== existing.goalId) {
    const goal = await prisma.goal.findFirst({ where: { id: data.goalId, userId } })
    if (!goal) return null
    roleId = goal.roleId
    // If task has a project, validate goal matches
    const projectId = data.projectId !== undefined ? data.projectId : existing.projectId
    if (projectId) {
      const project = await prisma.project.findFirst({ where: { id: projectId } })
      if (project && project.goalId !== data.goalId) return null
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data: {
      ...data,
      ...(roleId ? { roleId } : {}),
      dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : undefined,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Task", entityId: id, action: "update", actor, userId, diff: { before: existing, after: task } },
  })
  if (task.dueDate) {
    void upsertCalendarEvent("task", task.id, { title: task.title, date: task.dueDate }, userId)
  } else if (data.dueDate === null) {
    void deleteCalendarEvent("task", task.id, userId)
  }
  return task
}
```

Update `deleteTask` to handle tasks without projects:

```typescript
export async function deleteTask(id: string, actor: Actor, userId: string) {
  const existing = await prisma.task.findFirst({
    where: {
      id,
      OR: [
        { project: { userId } },
        { projectId: null, goal: { userId } },
      ],
    },
  })
  if (!existing) return null

  await prisma.auditLog.create({
    data: { entity: "Task", entityId: id, action: "delete", actor, userId },
  })
  void deleteCalendarEvent("task", id, userId)
  return prisma.task.delete({ where: { id } })
}
```

- [ ] **Step 3: Update project service to handle goalId**

In `lib/services/projects.ts`, update `createProject`:

```typescript
export async function createProject(data: CreateProjectInput, actor: Actor, userId: string) {
  // Derive roleId from goalId
  const goal = await prisma.goal.findFirst({ where: { id: data.goalId, userId } })
  if (!goal) return null

  const project = await prisma.project.create({
    data: {
      goalId: data.goalId,
      roleId: goal.roleId,
      title: data.title,
      description: data.description,
      category: data.category,
      status: data.status,
      priority: data.priority,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
      notes: data.notes,
      userId,
    },
  })
  await prisma.auditLog.create({
    data: { entity: "Project", entityId: project.id, action: "create", actor, userId },
  })
  if (project.targetDate) {
    void upsertCalendarEvent("project", project.id, { title: project.title, date: project.targetDate }, userId)
  }
  return project
}
```

Update `updateProject` to handle goalId changes with cascade:

```typescript
export async function updateProject(id: string, data: UpdateProjectInput, actor: Actor, userId: string) {
  const existing = await prisma.project.findFirst({ where: { id, userId } })
  if (!existing) return null

  let roleId: string | undefined
  if (data.goalId && data.goalId !== existing.goalId) {
    const goal = await prisma.goal.findFirst({ where: { id: data.goalId, userId } })
    if (!goal) return null
    roleId = goal.roleId
  }

  const project = await prisma.project.update({
    where: { id, userId },
    data: {
      ...data,
      ...(roleId ? { roleId } : {}),
      targetDate: data.targetDate !== undefined ? (data.targetDate ? new Date(data.targetDate) : null) : undefined,
    },
  })

  // Cascade goalId and roleId to child tasks
  if (data.goalId && data.goalId !== existing.goalId) {
    await prisma.task.updateMany({
      where: { projectId: id },
      data: { goalId: data.goalId, roleId: roleId! },
    })
  }

  await prisma.auditLog.create({
    data: { entity: "Project", entityId: id, action: "update", actor, userId, diff: { before: existing, after: project } },
  })
  if (project.targetDate) {
    void upsertCalendarEvent("project", project.id, { title: project.title, date: project.targetDate }, userId)
  } else if (data.targetDate === null) {
    void deleteCalendarEvent("project", project.id, userId)
  }
  return project
}
```

Update `listProjects` to support roleId and goalId filters:

```typescript
interface ListProjectsOptions {
  status?: string
  roleId?: string
  goalId?: string
  userId: string
}

export async function listProjects(opts: ListProjectsOptions) {
  const where: Record<string, unknown> = {
    OR: [
      { userId: opts.userId },
      { members: { some: { userId: opts.userId } } },
    ],
  }
  if (opts.status) where.status = opts.status as ProjectStatus
  if (opts.roleId) where.roleId = opts.roleId
  if (opts.goalId) where.goalId = opts.goalId

  return prisma.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { tasks: true } },
      tasks: { select: { status: true, isMilestone: true } },
      goal: { select: { id: true, name: true } },
      role: { select: { id: true, name: true, colour: true } },
    },
  })
}
```

- [ ] **Step 4: Run all tests**

Run: `npx jest --no-coverage`
Expected: All tests pass (existing tests may need minor mock updates for new required fields)

- [ ] **Step 5: Commit**

```bash
git add lib/services/tasks.ts lib/services/projects.ts __tests__/services/tasks.test.ts __tests__/services/projects.test.ts
git commit -m "feat: update task/project services for goal/role hierarchy"
```

---

### Task 7: API Routes for Roles and Goals

**Files:**
- Create: `app/api/v1/roles/route.ts`
- Create: `app/api/v1/roles/[id]/route.ts`
- Create: `app/api/v1/goals/route.ts`
- Create: `app/api/v1/goals/[id]/route.ts`
- Create: `app/api/v1/goals/[id]/complete/route.ts`

- [ ] **Step 1: Create roles list/create route**

Create `app/api/v1/roles/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listRoles, createRole } from "@/lib/services/roles"
import { CreateRoleSchema } from "@/lib/validations/role"

export async function GET() {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const roles = await listRoles(session.userId)
  return NextResponse.json(roles)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = CreateRoleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })

  try {
    const role = await createRole(parsed.data, session.userId)
    return NextResponse.json(role, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create role"
    return NextResponse.json({ error: msg }, { status: 409 })
  }
}
```

- [ ] **Step 2: Create roles update/delete route**

Create `app/api/v1/roles/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateRole, deleteRole } from "@/lib/services/roles"
import { UpdateRoleSchema } from "@/lib/validations/role"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = UpdateRoleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })

  try {
    const role = await updateRole(id, parsed.data, session.userId)
    return NextResponse.json(role)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update role"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const remapToRoleId = (body as { remapToRoleId?: string })?.remapToRoleId
  if (!remapToRoleId) return NextResponse.json({ error: "remapToRoleId is required" }, { status: 422 })

  try {
    await deleteRole(id, remapToRoleId, session.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete role"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
```

- [ ] **Step 3: Create goals list/create route**

Create `app/api/v1/goals/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listGoals, createGoal } from "@/lib/services/goals"
import { CreateGoalSchema } from "@/lib/validations/goal"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const roleId = req.nextUrl.searchParams.get("roleId") ?? undefined
  const goals = await listGoals(session.userId, roleId)
  return NextResponse.json(goals)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = CreateGoalSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })

  try {
    const goal = await createGoal(parsed.data, session.userId)
    return NextResponse.json(goal, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create goal"
    return NextResponse.json({ error: msg }, { status: 409 })
  }
}
```

- [ ] **Step 4: Create goals update/delete route**

Create `app/api/v1/goals/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateGoal, deleteGoal } from "@/lib/services/goals"
import { UpdateGoalSchema } from "@/lib/validations/goal"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = UpdateGoalSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 422 })

  try {
    const goal = await updateGoal(id, parsed.data, session.userId)
    return NextResponse.json(goal)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update goal"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const remapToGoalId = (body as { remapToGoalId?: string })?.remapToGoalId
  if (!remapToGoalId) return NextResponse.json({ error: "remapToGoalId is required" }, { status: 422 })

  try {
    await deleteGoal(id, remapToGoalId, session.userId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete goal"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
```

- [ ] **Step 5: Create goal complete route**

Create `app/api/v1/goals/[id]/complete/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { completeGoal } from "@/lib/services/goals"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  try {
    const goal = await completeGoal(id, session.userId)
    return NextResponse.json(goal)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to complete goal"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/roles/ app/api/v1/goals/
git commit -m "feat: API routes for role and goal CRUD"
```

---

### Task 8: Holly API Backward Compatibility and Auth Seeding

**Files:**
- Modify: `lib/services/tasks.ts` (add fallback)
- Modify: `lib/services/projects.ts` (add fallback)
- Modify: `lib/auth.ts` (seed defaults on login)

- [ ] **Step 1: Add goalId fallback to task service**

At the top of `createTask` in `lib/services/tasks.ts`, add a fallback for when goalId is not provided:

```typescript
import { getOrCreateDefaultGoal } from "@/lib/services/goals"

export async function createTask(data: CreateTaskInput, actor: Actor, userId: string) {
  // Backward compat: if no goalId, use default
  let goalId = data.goalId
  if (!goalId) {
    const defaultGoal = await getOrCreateDefaultGoal(userId)
    goalId = defaultGoal.id
  }

  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } })
  if (!goal) return null
  // ... rest of function uses goalId instead of data.goalId
```

- [ ] **Step 2: Add goalId fallback to project service**

At the top of `createProject` in `lib/services/projects.ts`:

```typescript
import { getOrCreateDefaultGoal } from "@/lib/services/goals"

export async function createProject(data: CreateProjectInput, actor: Actor, userId: string) {
  let goalId = data.goalId
  if (!goalId) {
    const defaultGoal = await getOrCreateDefaultGoal(userId)
    goalId = defaultGoal.id
  }

  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } })
  if (!goal) return null
  // ... rest of function uses goalId instead of data.goalId
```

- [ ] **Step 3: Seed defaults on user login**

In `lib/auth.ts`, after the admin user upsert (line 35) and after Google OAuth user creation (around line 53), add seeding calls. Import and call lazily to avoid circular dependencies:

After the admin upsert block (`return { id: adminUser.id, ... }`), add before the return:

```typescript
// Seed default role/goal for admin
import("@/lib/services/roles").then(m => m.getOrCreateDefaultRole(adminUser.id)).catch(() => {})
```

In the Google OAuth `signIn` callback, after `prisma.user.create` (line 53), add:

```typescript
import("@/lib/services/roles").then(m => m.getOrCreateDefaultRole(dbUser.id)).catch(() => {})
```

Note: use dynamic import to avoid circular dependency issues at module load time. The `.catch(() => {})` ensures login doesn't fail if seeding has an issue.

- [ ] **Step 4: Make goalId optional in validation schemas for backward compat**

In `lib/validations/task.ts`, change goalId to be optional with a fallback:

```typescript
goalId: z.string().uuid().optional(),
```

In `lib/validations/project.ts`, change goalId to be optional:

```typescript
goalId: z.string().uuid().optional(),
```

The service layer handles the fallback when goalId is undefined.

- [ ] **Step 5: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add lib/services/tasks.ts lib/services/projects.ts lib/auth.ts lib/validations/task.ts lib/validations/project.ts
git commit -m "feat: backward compat for Holly API, seed defaults on login"
```

---

### Task 9: Update Existing Task/Project API Routes

**Files:**
- Modify: `app/api/v1/tasks/route.ts`
- Modify: `app/api/holly/v1/tasks/route.ts`
- Modify: `app/api/v1/projects/route.ts`
- Modify: `app/api/holly/v1/projects/route.ts`
- Modify: `app/(dashboard)/tasks/page.tsx`

- [ ] **Step 1: Update web task list route to pass roleId/goalId filters**

In `app/api/v1/tasks/route.ts` GET handler, add roleId and goalId from query params:

```typescript
const roleId = req.nextUrl.searchParams.get("roleId") ?? undefined
const goalId = req.nextUrl.searchParams.get("goalId") ?? undefined
// Pass to listTasks:
const tasks = await listTasks({ ...opts, roleId, goalId, userId })
```

- [ ] **Step 2: Update web project list route to pass roleId/goalId filters**

In `app/api/v1/projects/route.ts` GET handler, add roleId and goalId from query params:

```typescript
const roleId = req.nextUrl.searchParams.get("roleId") ?? undefined
const goalId = req.nextUrl.searchParams.get("goalId") ?? undefined
const projects = await listProjects({ ...opts, roleId, goalId, userId })
```

- [ ] **Step 3: Update tasks page to pass roleId/goalId from URL params**

In `app/(dashboard)/tasks/page.tsx`, add roleId and goalId to the search params and pass them to `listTasks`:

```typescript
const roleId = searchParams.roleId as string | undefined
const goalId = searchParams.goalId as string | undefined
const tasks = await listTasks({ status, assignedTo, milestoneOnly: milestoneOnly === "true", roleId, goalId, userId: session.userId! })
```

- [ ] **Step 4: Run TypeScript check and tests**

Run: `npx tsc --noEmit && npx jest --no-coverage`
Expected: No TypeScript errors, all tests pass

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/tasks/ app/api/v1/projects/ app/api/holly/ "app/(dashboard)/tasks/"
git commit -m "feat: pass roleId/goalId filters through API routes and task page"
```

---

### Task 10: Settings UI - Roles and Goals Management

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Add Roles and Goals section to settings page**

Add a new section after the existing "Obsidian Vault" section in the settings page. This section:

- Fetches roles from `/api/v1/roles` on mount
- Shows each role as an expandable card with its colour dot, name, and goal count
- Under each role, lists its goals (fetched from `/api/v1/goals?roleId=...`)
- "Add Role" button with inline form: name input, colour input (type="color"), description textarea
- "Add Goal" button under each role: name input, goalType select (ongoing/completable), optional targetDate
- Edit/delete buttons on each role and goal (disabled for default items)
- Delete shows a confirmation with a remap selector dropdown

The component is a client component (`"use client"`) with local state for the role/goal lists, forms, and loading states. Follow the same patterns as the existing API keys and vault config sections in the settings page.

This is a large UI component. The exact implementation will follow the existing settings page patterns (inline forms, fetch on mount, optimistic updates).

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/settings/page.tsx"
git commit -m "feat: roles and goals management section in settings"
```

---

### Task 11: Project Form - Goal Selector

**Files:**
- Modify: `components/projects/project-form.tsx`

- [ ] **Step 1: Add two-level Role > Goal selector to project form**

Add state for roles list, selected roleId, and goals list. Fetch roles on mount from `/api/v1/roles`. When roleId changes, fetch goals from `/api/v1/goals?roleId=...`. Add two select fields before the existing title field:

```tsx
<div>
  <label className="text-xs text-[#666688] mb-1">Role</label>
  <select value={selectedRoleId} onChange={e => setSelectedRoleId(e.target.value)}
    className="w-full bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2">
    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
  </select>
</div>
<div>
  <label className="text-xs text-[#666688] mb-1">Goal</label>
  <select {...register("goalId")}
    className="w-full bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded text-[#c0c0d0] text-sm px-3 py-2">
    {goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
  </select>
</div>
```

When editing an existing project, pre-populate selectedRoleId from defaultValues.roleId and goalId from defaultValues.goalId. The form already uses react-hook-form, so register goalId as a hidden field that updates when the goal dropdown changes.

- [ ] **Step 2: Commit**

```bash
git add components/projects/project-form.tsx
git commit -m "feat: two-level role/goal selector in project form"
```

---

### Task 12: Task Form and Task Page Updates

**Files:**
- Modify: `components/tasks/add-task-form.tsx`
- Modify: `app/(dashboard)/tasks/page.tsx`
- Modify: `app/(dashboard)/projects/page.tsx`

- [ ] **Step 1: Update AddTaskForm for goal selector**

In `components/tasks/add-task-form.tsx`:

- Accept new optional props: `goalId?: string`, `roleId?: string` (passed when rendered inside a project detail page)
- When goalId/roleId are provided, hide the selector and pass goalId in the POST body
- When NOT provided (rendered from tasks page), show the two-level Role > Goal selector (same pattern as project form) and an optional Project dropdown filtered by selected goalId
- Change the form submit to include `goalId` in the body, and `projectId` only if selected

Make `projectId` prop optional (it's currently required).

- [ ] **Step 2: Update tasks page grouping and filters**

In `app/(dashboard)/tasks/page.tsx`:

- Add role and goal filter dropdowns (fetch roles/goals from API, add to the filter form as select elements with ?roleId= and ?goalId= query params)
- Change task grouping from "group by project" to "group by role > goal > project". Tasks without a projectId appear under a "Direct tasks" sub-heading within their goal group.
- Show a coloured dot (matching role colour) on each task row

- [ ] **Step 3: Update projects page**

In `app/(dashboard)/projects/page.tsx`:

- Add role and goal filter dropdowns (same pattern as tasks page)
- Each ProjectCard shows goal name and role colour dot

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add components/tasks/add-task-form.tsx "app/(dashboard)/tasks/page.tsx" "app/(dashboard)/projects/page.tsx"
git commit -m "feat: goal selector in task form, role/goal filters on task and project pages"
```

---

### Task 13: Full Test Suite and Push

**Files:** None new

- [ ] **Step 1: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Push all commits to remote**

Run: `git push`

---
