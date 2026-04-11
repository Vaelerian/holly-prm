# Holly PRM - Phase 6a Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Scope:** Phase 6a - Multi-user

---

## Overview

Phase 6a adds multi-user support to Holly PRM. Each user has their own private PRM (contacts, interactions, action items, vault). Projects can be shared across users, with the owner retaining full control and members able to add, update, and close - but not delete. User accounts require admin approval before access is granted. The admin account remains a separate env-var-based identity used only for system management.

---

## Pillars

1. **User table and auth changes** - User model, Google OAuth for personal account, email/password for invited users, admin stays env-var
2. **Data scoping** - userId on all personal-data tables, all queries filtered by session userId
3. **Registration and admin approval** - /register page, /admin panel, approve/reject flow
4. **Project sharing** - ProjectMember join table, shared project queries, member permission enforcement
5. **Migration** - nullable userId columns, one-time claim-unclaimed-data tool in admin panel

---

## Schema Changes

### New: `User`

Stores registered user accounts. Admin is NOT stored here.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| email | String | Unique |
| name | String | Display name |
| passwordHash | String? | Null for Google OAuth users |
| status | Enum | `pending`, `approved`, `rejected` |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### New: `ProjectMember`

Tracks which users have been granted access to a shared project.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| projectId | String | FK to Project |
| userId | String | FK to User |
| createdAt | DateTime | |

`@@unique([projectId, userId])`

### Modified tables

The following tables gain a `userId` column (String?, FK to User). Added as nullable to support the migration path. Made required (non-null) after existing data is claimed.

- Contact
- Interaction
- ActionItem
- Project
- AuditLog
- KnowledgeItem
- HollyApiKey
- PushSubscription
- GoogleToken
- CalendarSync
- UserPreference
- VaultConfig
- VaultNote

Task is NOT modified - it is already scoped through Project.

---

## Auth

### Google OAuth (personal account)

After Google authenticates, look up the email in the `User` table:
- Found + `status = approved`: sign in, attach `userId` to JWT session
- Found + `status = pending` or `rejected`: reject with a message
- Not found: create a `User` row with `status = pending`, reject (must be approved before first access)

### Credentials (invited users)

Look up email in `User` table, verify bcrypt password hash, check `status = approved`. No env-var fallback - credentials login is DB-only for regular users.

### Admin (unchanged)

Checks `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` env vars. Sets `role: "admin"` in the session. Admin has no `userId` - it is a separate system-management identity only.

### Session shape

```ts
// Regular user session
{ userId: string, email: string, name: string, role: "user" }

// Admin session
{ role: "admin" }
```

---

## Registration and Admin Approval

### `/register` page

Publicly accessible. Form: name, email, password. On submit:
- `POST /api/auth/register` - validates input, hashes password, creates `User` with `status = pending`
- Page shows: "Your request has been submitted. You will get access once approved."

### `/admin` page

Accessible only when `session.role === "admin"`. Sections:

**Pending users** - list with Approve and Reject buttons per row.

**Approved users** - list with Revoke button (sets status to `rejected`).

**Claim unclaimed data** - a dropdown of approved users and a "Claim all unclaimed records" button. Assigns all `userId = null` records across all personal-data tables to the selected user. Intended for one-time use after migration.

### Admin API routes

```
POST /api/admin/users/[id]/approve
POST /api/admin/users/[id]/reject
POST /api/admin/claim-unclaimed        body: { userId }
```

All require `session.role === "admin"`.

### First-time setup flow

1. Deploy with existing data
2. Run migration (adds nullable userId columns, no data changes)
3. Sign in as admin, go to `/admin`
4. Sign in with Google (personal account) - creates pending User row
5. Approve your own account in `/admin`
6. Use "Claim unclaimed data" to assign all existing records to your account
7. Invite others via sharing the `/register` URL

---

## Data Scoping

### Web API routes

Every route that reads or writes personal data:
1. Calls `auth()`, extracts `session.userId`
2. Returns 401 if no `userId` (unauthenticated or admin session)
3. Adds `userId` to all `where` clauses
4. For routes with an entity ID in the path, verifies the fetched record's `userId` matches the session before returning it

Example:
```ts
const session = await auth()
if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
const contacts = await prisma.contact.findMany({ where: { userId: session.userId } })
```

### Holly API routes

`HollyApiKey` has a `userId`. When a Holly request arrives, `validateHollyRequest` resolves the key to its owning `userId` and returns it. All Holly route handlers scope queries to that `userId`. Holly's briefing, contacts, vault, projects, and all other data is scoped to the key owner.

`validateHollyRequest` return type extends to include `userId`:
```ts
{ valid: true, userId: string } | { valid: false, rateLimited?: boolean }
```

---

## Project Sharing

### Queries

Project list and detail queries include shared projects:
```ts
where: {
  OR: [
    { userId: session.userId },
    { members: { some: { userId: session.userId } } }
  ]
}
```

### Permissions

| Operation | Owner | Member |
|-----------|-------|--------|
| View project | Yes | Yes |
| Add task | Yes | Yes |
| Update task status | Yes | Yes |
| Close milestone | Yes | Yes |
| Delete task | Yes | No |
| Delete project | Yes | No |
| Add/remove members | Yes | No |

All delete operations verify `project.userId === session.userId` before proceeding.

### API routes

```
POST   /api/v1/projects/[id]/members          Add member by email
DELETE /api/v1/projects/[id]/members/[userId] Remove member (owner only)
```

`POST` body: `{ email: string }`. Looks up User by email, returns 404 if not found or not approved. Returns 403 if caller is not the project owner.

### UI

On the project detail page, a "Members" section visible to the owner only:
- Lists current members with a Remove button
- "Add member" email input with an Add button
- Shows "Shared by [name]" label on the project list for non-owner members

---

## New Routes Summary

```
POST   /api/auth/register
POST   /api/admin/users/[id]/approve
POST   /api/admin/users/[id]/reject
POST   /api/admin/claim-unclaimed
POST   /api/v1/projects/[id]/members
DELETE /api/v1/projects/[id]/members/[userId]
```

New pages:
```
/register       Public registration form
/admin          Admin user management (admin session only)
```

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Unauthenticated request to personal data route | 401 |
| Admin session accessing personal data route | 401 (no userId in session) |
| Entity ID belongs to different user | 404 (not 403 - do not confirm existence) |
| Register with already-used email | 422 with "Email already registered" |
| Add project member with unknown/unapproved email | 404 |
| Non-owner attempts delete | 403 |
| Non-owner attempts add/remove member | 403 |
| Claim unclaimed data called by non-admin | 401 |

---

## Security

- All personal-data queries include `userId` from the JWT session - never from request input
- Entity ownership is verified on every read and write by ID
- Password hashing uses bcrypt (already in use for admin)
- Admin session is distinct from user session - no privilege escalation path
- `/admin` page and all `/api/admin/*` routes check `session.role === "admin"` via middleware

---

## Out of Scope for Phase 6a

- Email notifications (approval notification, invite emails)
- Per-user Holly API key management UI (keys still created in Settings, now scoped to logged-in user)
- Sharing contacts or interactions across users
- User profile page (name/email editing)
- Password reset flow
- Multi-user (Phase 6b onwards)
