# Sub-project 1: Role/Goal Hierarchy - Design Specification

**Part of:** Mentor Scheduling Engine Integration for Holly PRM

**Goal:** Add a Role > Goal organisational hierarchy to Holly PRM, extending the existing Project and Task models so that every task and project belongs to a Goal (which belongs to a Role), while making project assignment optional on tasks.

**Architecture:** Next.js App Router, Prisma ORM, PostgreSQL

---

## 1. Data Model

### 1.1 New Models

**Role**

| Field       | Type     | Constraints                        | Description                              |
|-------------|----------|------------------------------------|------------------------------------------|
| id          | UUID     | PK, default uuid                   | Unique identifier                        |
| name        | String   | required, 1-100 chars              | Display name (e.g. "Work", "Personal")   |
| description | String   | default ""                         | Optional longer description              |
| colour      | String   | default "#6366F1", 7-char hex      | Hex colour for UI badges and calendar    |
| icon        | String   | default ""                         | Optional icon identifier                 |
| isDefault   | Boolean  | default false                      | True for the auto-created "Unassigned" role. Cannot be deleted. |
| sortOrder   | Int      | default 0                          | Manual ordering                          |
| userId      | String   | required, FK to User               | Owner                                    |
| createdAt   | DateTime | default now()                      |                                          |
| updatedAt   | DateTime | auto                               |                                          |

Relations: goals (Goal[]), projects (Project[]), tasks (Task[])

Unique constraint: [userId, name] (no duplicate role names per user)

**Goal**

| Field       | Type     | Constraints                        | Description                              |
|-------------|----------|------------------------------------|------------------------------------------|
| id          | UUID     | PK, default uuid                   | Unique identifier                        |
| roleId      | String   | required, FK to Role               | Parent role                              |
| name        | String   | required, 1-100 chars              | Display name (e.g. "Career Development") |
| description | String   | default ""                         | Optional longer description              |
| goalType    | Enum     | "ongoing" or "completable"         | Whether this goal has an end state       |
| status      | Enum     | "active", "completed", "archived"  | Lifecycle state                          |
| targetDate  | DateTime | nullable                           | Only meaningful for completable goals    |
| isDefault   | Boolean  | default false                      | True for the auto-created "General" goal. Cannot be deleted. |
| sortOrder   | Int      | default 0                          | Manual ordering                          |
| userId      | String   | required, FK to User               | Owner                                    |
| createdAt   | DateTime | default now()                      |                                          |
| updatedAt   | DateTime | auto                               |                                          |

Relations: role (Role), projects (Project[]), tasks (Task[])

Unique constraint: [roleId, name] (no duplicate goal names within a role)

### 1.2 Modified Models

**Project - add fields:**

| Field  | Type   | Constraints          | Description                                    |
|--------|--------|----------------------|------------------------------------------------|
| roleId | String | required, FK to Role | Denormalized from Goal for query performance   |
| goalId | String | required, FK to Goal | The goal this project contributes to           |

New relations: role (Role), goal (Goal)

**Task - add/change fields:**

| Field     | Type   | Constraints              | Description                                  |
|-----------|--------|--------------------------|----------------------------------------------|
| roleId    | String | required, FK to Role     | Denormalized from Goal for query performance |
| goalId    | String | required, FK to Goal     | The goal this task contributes to            |
| projectId | String | optional, FK to Project  | Changed from required to optional            |

New relations: role (Role), goal (Goal)

### 1.3 Hierarchy Rules

1. A Goal always belongs to exactly one Role
2. A Project always belongs to exactly one Goal
3. A Task always belongs to exactly one Goal, optionally to a Project
4. If a Task belongs to a Project, its goalId and roleId must match the Project's goalId and roleId (enforced at service layer)
5. roleId on Task and Project is denormalized from their Goal's roleId. When a Goal moves to a different Role, all child Projects and Tasks have their roleId updated in a transaction.

### 1.4 Default Records

Every user gets a default Role and Goal:
- Role: name="Unassigned", isDefault=true, colour="#6366F1"
- Goal: name="General", roleId=(above), goalType="ongoing", isDefault=true

These are created on user registration (or backfilled for existing users during migration). They cannot be deleted or renamed.

---

## 2. Prisma Schema Additions

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

Project gains: `roleId String`, `goalId String`, relations to Role and Goal.

Task gains: `roleId String`, `goalId String`, `projectId` becomes optional (remove `@relation` requirement but keep the FK).

---

## 3. API Routes

### 3.1 New Routes

```
GET    /api/v1/roles              - List roles for authenticated user
POST   /api/v1/roles              - Create role
PUT    /api/v1/roles/:id          - Update role
DELETE /api/v1/roles/:id          - Delete role (body: {remapToRoleId})

GET    /api/v1/goals              - List goals (?roleId= optional filter)
POST   /api/v1/goals              - Create goal
PUT    /api/v1/goals/:id          - Update goal
DELETE /api/v1/goals/:id          - Delete goal (body: {remapToGoalId})
POST   /api/v1/goals/:id/complete - Mark completable goal as completed
```

### 3.2 Modified Routes

**POST /api/v1/tasks** - CreateTaskSchema gains `goalId` (required UUID). `projectId` becomes nullable. `roleId` is derived server-side from `goalId`.

**PUT /api/v1/tasks/:id** - UpdateTaskSchema gains optional `goalId`. If `goalId` changes, `roleId` is re-derived. If task has a `projectId`, validates the new goalId matches the project's goalId.

**POST /api/v1/projects** - CreateProjectSchema gains `goalId` (required UUID). `roleId` is derived server-side.

**PUT /api/v1/projects/:id** - UpdateProjectSchema gains optional `goalId`. If `goalId` changes, `roleId` is re-derived and all child tasks have their `roleId` and `goalId` updated.

### 3.3 Holly API Backward Compatibility

The Holly agent routes (`/api/holly/v1/tasks`, `/api/holly/v1/projects`) accept requests without `goalId`. When omitted, the service assigns the user's default "General" goal (and its parent "Unassigned" role).

---

## 4. Validation Schemas

### 4.1 New Schemas

**`lib/validations/role.ts`**

```typescript
CreateRoleSchema = {
  name: string (1-100 chars, required),
  description: string (optional),
  colour: string (regex /^#[0-9a-fA-F]{6}$/, default "#6366F1"),
  icon: string (optional)
}

UpdateRoleSchema = CreateRoleSchema (all fields partial)
```

**`lib/validations/goal.ts`**

```typescript
CreateGoalSchema = {
  roleId: UUID (required),
  name: string (1-100 chars, required),
  description: string (optional),
  goalType: enum["ongoing", "completable"] (required),
  targetDate: date string (nullable, only valid when goalType is "completable")
}

UpdateGoalSchema = {
  name: string (1-100 chars, optional),
  description: string (optional),
  goalType: enum["ongoing", "completable"] (optional),
  targetDate: date string (nullable),
  roleId: UUID (optional - allows moving goal to different role)
}
```

### 4.2 Modified Schemas

**CreateTaskSchema** - add `goalId: z.string().uuid()`, change `projectId` to `z.string().uuid().nullable().optional()`

**CreateProjectSchema** - add `goalId: z.string().uuid()`

---

## 5. Service Layer

### 5.1 New Services

**`lib/services/roles.ts`**

- `listRoles(userId: string): Promise<Role[]>` - returns roles with goal counts, ordered by sortOrder then name
- `getRole(id: string, userId: string): Promise<Role | null>` - returns role with goals
- `createRole(data: CreateRoleInput, userId: string): Promise<Role>` - validates name uniqueness per user
- `updateRole(id: string, data: UpdateRoleInput, userId: string): Promise<Role>` - blocks updates to isDefault roles' name
- `deleteRole(id: string, remapToRoleId: string, userId: string): Promise<void>` - blocks deletion of default role. Moves all goals (and their projects/tasks) to the target role. Updates denormalized roleId on all affected projects and tasks.
- `getOrCreateDefaultRole(userId: string): Promise<Role>` - idempotent: returns existing default role or creates one

**`lib/services/goals.ts`**

- `listGoals(userId: string, roleId?: string): Promise<Goal[]>` - returns goals with project/task counts
- `getGoal(id: string, userId: string): Promise<Goal | null>` - returns goal with projects and direct tasks
- `createGoal(data: CreateGoalInput, userId: string): Promise<Goal>` - validates name uniqueness within role
- `updateGoal(id: string, data: UpdateGoalInput, userId: string): Promise<Goal>` - blocks name changes on isDefault goals. If roleId changes, cascades denormalized roleId to all child projects and tasks in a transaction
- `deleteGoal(id: string, remapToGoalId: string, userId: string): Promise<void>` - blocks deletion of default goal. Remaps projects and tasks to target goal. If the target goal is in a different role, updates denormalized roleId on all remapped projects and tasks.
- `completeGoal(id: string, userId: string): Promise<Goal>` - sets status to "completed". Only valid for completable goals. Returns error for ongoing goals.
- `getOrCreateDefaultGoal(userId: string): Promise<Goal>` - idempotent: ensures default role exists, then returns/creates default goal

### 5.2 Modified Services

**`lib/services/tasks.ts`**

- `createTask`: accepts `goalId` (required), `projectId` (optional). Derives `roleId` by looking up the goal. If `projectId` is provided, validates that `project.goalId === goalId`. When called without `goalId` (Holly API backward compat), uses default goal.
- `updateTask`: if `goalId` changes, re-derives `roleId`. If task has `projectId`, validates goalId matches project.
- `listTasks`: add optional `roleId` and `goalId` filter parameters.

**`lib/services/projects.ts`**

- `createProject`: accepts `goalId` (required). Derives `roleId`. When called without `goalId` (Holly API backward compat), uses default goal.
- `updateProject`: if `goalId` changes, re-derives `roleId`. Cascades goalId and roleId to all child tasks in a transaction.
- `listProjects`: add optional `roleId` and `goalId` filter parameters.

---

## 6. UI Changes

### 6.1 New: Roles and Goals Management (Settings Page Section)

Add a "Roles and Goals" section to the existing Settings page (`app/(dashboard)/settings/page.tsx`). This section contains:

- List of Roles, each expandable to show its Goals
- "Add Role" button: inline form with name, colour picker, optional description
- Each Role shows: edit (name, colour, description), delete (with role remap selector)
- Under each Role, "Add Goal" button: inline form with name, goalType selector, optional description/targetDate
- Each Goal shows: edit, delete (with goal remap selector within same role), complete button (only for completable goals with active status)
- Default Role and Goal show a badge "(Default)" and have edit/delete disabled

### 6.2 Modified: Project Form

The ProjectForm component (`components/projects/project-form.tsx`) gains:

- A two-level selector: first pick a Role (dropdown), then pick a Goal within that Role (second dropdown, filtered by selected Role)
- Role dropdown defaults to first non-default role, or the default role if no others exist
- Goal dropdown defaults to first goal within selected role
- When editing an existing project, both dropdowns pre-populate from the project's current goalId/roleId

### 6.3 Modified: Task Creation

**AddTaskForm** (`components/tasks/add-task-form.tsx`):
- When rendered inside a Project detail page: goalId and roleId auto-populate from the project. No selector shown.
- When rendered outside a project context (e.g. from the Tasks page): show the same two-level Role > Goal selector as the Project form. Project dropdown (optional, filtered to projects under selected goal).

**Task creation from Tasks page**: Add a "New Task" button that opens an inline form with: title, goal selector (two-level), optional project selector, priority, assignedTo.

### 6.4 Modified: Tasks Page

- Add Role and Goal filter dropdowns to the existing filter bar
- Tasks are currently grouped by project. Change grouping to: Group by Role > Goal > Project (with a "No Project" sub-group for tasks directly under a goal)
- Each task row shows a small coloured dot matching its Role colour

### 6.5 Modified: Projects Page

- Add Role and Goal filter dropdowns
- Each ProjectCard shows its Goal name and Role colour dot

### 6.6 No Changes

- Sidebar navigation: no changes in this sub-project
- Dashboard page: no changes in this sub-project
- Calendar page: no changes in this sub-project (Role View comes in sub-project 4)
- Contact pages: no changes

---

## 7. Migration Strategy

### 7.1 Database Migration Sequence

1. Create `Role` table with all columns
2. Create `Goal` table with all columns
3. Add `roleId` (nullable) and `goalId` (nullable) columns to `Project` table
4. Add `roleId` (nullable) and `goalId` (nullable) columns to `Task` table
5. Remove NOT NULL constraint from `projectId` on `Task` table (if it exists at DB level)
6. Run backfill (see 7.2)
7. Set `roleId` and `goalId` to NOT NULL on both `Project` and `Task`
8. Add foreign key constraints and indexes

### 7.2 Data Backfill

For each distinct userId found in existing Projects or Tasks:

1. Create Role: name="Unassigned", isDefault=true, userId=userId
2. Create Goal: name="General", roleId=(above), goalType="ongoing", isDefault=true, userId=userId
3. UPDATE Project SET roleId=(role.id), goalId=(goal.id) WHERE userId=userId AND roleId IS NULL
4. UPDATE Task SET roleId=(role.id), goalId=(goal.id) WHERE userId=userId AND roleId IS NULL

This runs as a single Prisma migration script.

### 7.3 New User Seeding

Hook into user creation flow. Two touch points:

1. `lib/auth.ts` - the admin user upsert in the credentials authorize callback
2. `lib/auth.ts` - the Google OAuth signIn callback when a new User is created

In both cases, after the User record exists, call `getOrCreateDefaultRole(userId)` which cascades to create the default Goal.

### 7.4 Backward Compatibility

- Holly API routes that create tasks/projects without goalId: the service layer calls `getOrCreateDefaultGoal(userId)` and uses that goalId
- Existing web UI forms: during the transition, if goalId is not provided (old cached frontend), the API falls back to the default goal
- The `category` field on Project (personal/work/volunteer) is kept as-is. No migration or removal.

---

## 8. Testing

### 8.1 Unit Tests (Service Layer)

**Role service tests (`__tests__/services/roles.test.ts`):**
- Create role with valid data
- Reject duplicate role name for same user
- Allow same role name for different users
- Update role name and colour
- Block deletion of default role
- Delete role with remap: moves all goals, projects, and tasks to target role
- getOrCreateDefaultRole is idempotent

**Goal service tests (`__tests__/services/goals.test.ts`):**
- Create goal with valid data under a role
- Reject duplicate goal name within same role
- Allow same goal name under different roles
- Complete a completable goal
- Reject completing an ongoing goal
- Block deletion of default goal
- Delete goal with remap: moves projects and tasks to target goal
- Update goalId (move goal to different role): cascades roleId to child projects and tasks
- getOrCreateDefaultGoal is idempotent and creates default role if needed

**Modified task service tests (`__tests__/services/tasks.test.ts`):**
- Create task with goalId only (no projectId)
- Create task with goalId and projectId
- Reject task creation where projectId's goalId does not match provided goalId
- roleId is auto-derived from goalId
- List tasks with roleId filter
- List tasks with goalId filter
- Backward compat: create task without goalId uses default goal

**Modified project service tests (`__tests__/services/projects.test.ts`):**
- Create project with goalId
- roleId is auto-derived from goalId
- Update project goalId: cascades to child tasks
- List projects with roleId and goalId filters
- Backward compat: create project without goalId uses default goal

### 8.2 API Route Tests

**Role routes (`__tests__/api/roles.test.ts`):**
- CRUD operations with auth
- Delete with remap body
- 403 for non-owner access
- 422 for validation failures

**Goal routes (`__tests__/api/goals.test.ts`):**
- CRUD operations with auth
- Complete endpoint (success and rejection for ongoing type)
- Delete with remap body
- Filtering by roleId query param

### 8.3 Manual UI Testing

- Settings page: create/edit/delete roles and goals
- Project form: two-level goal selector works, pre-populates on edit
- Task creation: goal selector shown outside project context, hidden inside project context
- Tasks page: role/goal filters work, grouping shows hierarchy
- Projects page: role/goal filters work, cards show goal name
